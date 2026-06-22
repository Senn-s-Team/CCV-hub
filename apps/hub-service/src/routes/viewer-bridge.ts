/**
 * [INPUT]: 依赖 node:http、node:net、node:tls、FastifyInstance、bridge path 解析、multipart raw parser、实例级 viewer token、公网协议环境变量与实例注册表 upstream 记录
 * [OUTPUT]: 对外提供 registerViewerBridgeRoute，用于按 /viewer/<bridgeId> path 反代已鉴权 HTTP/SSE、multipart 上传与 WebSocket 请求
 * [POS]: hub-service 的公网 viewer 桥接面，把稳定 Hub host path 流量转发到对应 cc-viewer 内网实例
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { connect as netConnect, type Socket } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  appendUpstreamToken,
  buildBridgeBasePath,
  createBridgeConfig,
  resolveBridgeIdFromPath,
  stripBridgePathPrefix,
} from '../domain/bridge-url.js';
import type { ManagedInstanceRecord } from '../domain/instance-model.js';
import type { InstanceRegistry } from '../domain/instance-registry.js';

type BridgeRequest = FastifyRequest & { raw: IncomingMessage; body?: unknown };
type RawBodyParserDone = (error: Error | null, body?: Buffer) => void;
type ResolvedBridgeRequest = {
  record: ManagedInstanceRecord;
  bridgeId: string;
  upstreamRequestUrl: string;
  publicBasePath: string;
};

const viewerSessionCookiePrefix = 'ccv_viewer_session_';
const viewerUploadBodyLimit = 100 * 1024 * 1024;
const websocketHeaderNames = ['sec-websocket-key', 'sec-websocket-version', 'sec-websocket-protocol', 'sec-websocket-extensions'];
const blockedProxyHeaders = new Set([
  'connection',
  'content-length',
  'cookie',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'x-ccv-hub-agent-token',
]);

function resolveBridgeRequest(requestUrl: string | undefined, registry: InstanceRegistry): ResolvedBridgeRequest | undefined {
  const safeUrl = requestUrl ?? '/';
  const pathname = new URL(safeUrl, 'http://localhost').pathname;
  const bridgeId = resolveBridgeIdFromPath(pathname);
  if (!bridgeId) return undefined;
  const record = registry.getByBridgeId(bridgeId);
  if (!record) return undefined;
  return {
    record,
    bridgeId,
    upstreamRequestUrl: stripBridgePathPrefix(safeUrl, bridgeId),
    publicBasePath: buildBridgeBasePath(bridgeId),
  };
}

function buildTargetUrl(resolved: ResolvedBridgeRequest): URL {
  const upstream = new URL(resolved.record.upstreamUrl);
  return appendUpstreamToken(new URL(resolved.upstreamRequestUrl, upstream.origin), resolved.record.upstreamUrl);
}

function decodeCookieValue(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(header.split(';').flatMap((part) => {
    const [name = '', ...valueParts] = part.trim().split('=');
    const value = decodeCookieValue(valueParts.join('='));
    return name.length > 0 && value !== undefined ? [[name, value]] : [];
  }));
}

function upstreamToken(record: ManagedInstanceRecord): string | undefined {
  return new URL(record.upstreamUrl).searchParams.get('token') ?? undefined;
}

function requestToken(requestUrl: string | undefined): string | undefined {
  return new URL(requestUrl ?? '/', 'http://localhost').searchParams.get('token') ?? undefined;
}

function viewerSessionCookie(bridgeId: string): string {
  return `${viewerSessionCookiePrefix}${bridgeId}`;
}

function hasViewerAccess(resolved: ResolvedBridgeRequest, requestUrl: string | undefined, cookieHeader: string | undefined): boolean {
  const token = upstreamToken(resolved.record);
  if (!token) return false;
  return requestToken(requestUrl) === token || parseCookies(cookieHeader)[viewerSessionCookie(resolved.bridgeId)] === token;
}

function viewerSessionHeader(resolved: ResolvedBridgeRequest): string | undefined {
  const token = upstreamToken(resolved.record);
  if (!token) return undefined;
  const publicProtocol = process.env.CCV_HUB_PUBLIC_PROTOCOL ?? new URL(resolved.record.instance.url).protocol.slice(0, -1);
  const secure = publicProtocol === 'https' ? '; Secure' : '';
  return `${viewerSessionCookie(resolved.bridgeId)}=${encodeURIComponent(token)}; Path=${resolved.publicBasePath}; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`;
}

function withViewerSession(headers: IncomingHttpHeaders, resolved: ResolvedBridgeRequest): IncomingHttpHeaders {
  const cookie = viewerSessionHeader(resolved);
  const safeHeaders = { ...headers };
  delete safeHeaders['set-cookie'];
  if (!cookie) return safeHeaders;
  return {
    ...safeHeaders,
    'set-cookie': [cookie],
  };
}

function toProxyHeaders(headers: IncomingHttpHeaders, target: URL, body?: Buffer): IncomingHttpHeaders {
  const forwarded: IncomingHttpHeaders = { host: target.host };
  for (const [key, value] of Object.entries(headers)) {
    if (!blockedProxyHeaders.has(key.toLowerCase())) forwarded[key] = value;
  }
  if (body) forwarded['content-length'] = String(body.length);
  return forwarded;
}

function serializeBody(body: unknown): Buffer | undefined {
  if (body === undefined) return undefined;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  return Buffer.from(JSON.stringify(body));
}

function parseRawBody(_: FastifyRequest, payload: Buffer, done: RawBodyParserDone): void {
  done(null, payload);
}

function publicOrigin(): string {
  const config = createBridgeConfig();
  return `${config.protocol}://${config.publicHost}`;
}

function rewriteLocation(location: string, resolved: ResolvedBridgeRequest): string {
  const upstream = new URL(resolved.record.upstreamUrl);
  const parsed = new URL(location, upstream.origin);
  if (parsed.origin !== upstream.origin) return location;
  return `${publicOrigin()}${resolved.publicBasePath}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function responseHeaders(upstreamHeaders: IncomingHttpHeaders, resolved: ResolvedBridgeRequest): IncomingHttpHeaders {
  const headers = upstreamHeaders.location
    ? { ...upstreamHeaders, location: rewriteLocation(String(upstreamHeaders.location), resolved) }
    : upstreamHeaders;
  return withViewerSession(headers, resolved);
}

function sendUnauthorized(reply: FastifyReply): void {
  reply.code(401).send({
    ok: false,
    error: {
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    },
  });
}

function isBodylessMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD';
}

async function proxyHttp(request: BridgeRequest, reply: FastifyReply, resolved: ResolvedBridgeRequest): Promise<void> {
  if (!hasViewerAccess(resolved, request.raw.url, request.headers.cookie)) {
    sendUnauthorized(reply);
    return;
  }

  const target = buildTargetUrl(resolved);
  const body = isBodylessMethod(request.method) ? undefined : serializeBody(request.body);
  await new Promise<void>((resolve, reject) => {
    const upstreamRequest = (target.protocol === 'https:' ? httpsRequest : httpRequest)({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: request.method,
      headers: toProxyHeaders(request.headers, target, body),
    }, (upstreamResponse) => {
      reply.raw.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders(upstreamResponse.headers, resolved));
      upstreamResponse.pipe(reply.raw);
      upstreamResponse.on('end', resolve);
    });

    upstreamRequest.on('error', reject);
    upstreamRequest.end(body);
  });
}

function appendWebSocketHeaders(lines: string[], headers: IncomingHttpHeaders): void {
  for (const key of websocketHeaderNames) {
    const value = headers[key];
    if (Array.isArray(value)) lines.push(...value.map((item) => `${key}: ${item}`));
    else if (value) lines.push(`${key}: ${value}`);
  }
}

function serializeUpgradeRequest(request: IncomingMessage, target: URL): string {
  const lines = [
    `GET ${target.pathname}${target.search} HTTP/1.1`,
    `host: ${target.host}`,
    'connection: Upgrade',
    'upgrade: websocket',
  ];
  appendWebSocketHeaders(lines, request.headers);
  return `${lines.join('\r\n')}\r\n\r\n`;
}

function connectUpstream(target: URL): { socket: Socket; readyEvent: 'connect' | 'secureConnect' } {
  const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80));
  return target.protocol === 'https:'
    ? { socket: tlsConnect({ host: target.hostname, port, servername: target.hostname }), readyEvent: 'secureConnect' }
    : { socket: netConnect({ host: target.hostname, port }), readyEvent: 'connect' };
}

function proxyUpgrade(request: IncomingMessage, socket: Socket | import('node:stream').Duplex, head: Buffer, registry: InstanceRegistry): void {
  const resolved = resolveBridgeRequest(request.url, registry);
  if (!resolved) {
    socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
    return;
  }
  if (!hasViewerAccess(resolved, request.url, request.headers.cookie)) {
    socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return;
  }

  const target = buildTargetUrl(resolved);
  const upstream = connectUpstream(target);
  upstream.socket.once(upstream.readyEvent, () => {
    upstream.socket.write(serializeUpgradeRequest(request, target));
    if (head.length > 0) upstream.socket.write(head);
    upstream.socket.pipe(socket);
    socket.pipe(upstream.socket);
  });
  upstream.socket.on('error', () => socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'));
  socket.on('error', () => upstream.socket.destroy());
}

export function registerViewerBridgeRoute(app: FastifyInstance, registry: InstanceRegistry): void {
  app.addContentTypeParser(/^multipart\/form-data(?:;.*)?$/u, { bodyLimit: viewerUploadBodyLimit, parseAs: 'buffer' }, parseRawBody);

  app.all('/*', async (request, reply) => {
    const resolved = resolveBridgeRequest(request.raw.url, registry);
    if (!resolved) {
      reply.callNotFound();
      return;
    }
    await proxyHttp(request as BridgeRequest, reply, resolved);
  });

  app.server.on('upgrade', (request, socket, head) => proxyUpgrade(request, socket, head, registry));
}
