/**
 * [INPUT]: 依赖 node:http、node:net、node:tls、FastifyInstance、bridge Host 解析与实例注册表 upstream 记录
 * [OUTPUT]: 对外提供 registerViewerBridgeRoute，用于按 viewer 子域名反代 HTTP/SSE 与 WebSocket 请求
 * [POS]: hub-service 的公网 viewer 桥接面，把 Dokploy 子域名流量转发到对应 cc-viewer 内网实例
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { connect as netConnect, type Socket } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { appendUpstreamToken, resolveBridgeIdFromHost } from '../domain/bridge-url.js';
import type { InstanceRegistry } from '../domain/instance-registry.js';
import type { ManagedInstanceRecord } from '../domain/instance-model.js';

type BridgeRequest = FastifyRequest & { raw: IncomingMessage; body?: unknown };

function resolveBridgeRecord(host: string | undefined, registry: InstanceRegistry): ManagedInstanceRecord | undefined {
  const bridgeId = resolveBridgeIdFromHost(host);
  if (!bridgeId) return undefined;
  return registry.getByBridgeId(bridgeId);
}

function buildTargetUrl(record: ManagedInstanceRecord, requestUrl = '/'): URL {
  const upstream = new URL(record.upstreamUrl);
  const target = new URL(requestUrl, upstream.origin);
  return appendUpstreamToken(target, record.upstreamUrl);
}

function toProxyHeaders(headers: IncomingHttpHeaders, target: URL, body?: Buffer): IncomingHttpHeaders {
  const forwarded: IncomingHttpHeaders = { ...headers, host: target.host };
  delete forwarded.connection;
  delete forwarded['content-length'];
  if (body) forwarded['content-length'] = String(body.length);
  return forwarded;
}

function serializeBody(body: unknown): Buffer | undefined {
  if (body === undefined) return undefined;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body);
  return Buffer.from(JSON.stringify(body));
}

function rewriteResponseHeaders(headers: IncomingHttpHeaders, record: ManagedInstanceRecord, host: string | undefined): IncomingHttpHeaders {
  if (!headers.location || !host) return headers;
  return {
    ...headers,
    location: String(headers.location).replace(new URL(record.upstreamUrl).origin, `${new URL(record.instance.url).protocol}//${host}`),
  };
}

async function proxyHttp(request: BridgeRequest, reply: FastifyReply, record: ManagedInstanceRecord): Promise<void> {
  const target = buildTargetUrl(record, request.raw.url);
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : serializeBody(request.body);
  await new Promise<void>((resolve, reject) => {
    const upstreamRequest = (target.protocol === 'https:' ? httpsRequest : httpRequest)({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: request.method,
      headers: toProxyHeaders(request.headers, target, body),
    }, (upstreamResponse) => {
      reply.raw.writeHead(upstreamResponse.statusCode ?? 502, rewriteResponseHeaders(upstreamResponse.headers, record, request.headers.host));
      upstreamResponse.pipe(reply.raw);
      upstreamResponse.on('end', resolve);
    });

    upstreamRequest.on('error', reject);
    if (body) upstreamRequest.end(body);
    else upstreamRequest.end();
  });
}

function serializeUpgradeRequest(request: IncomingMessage, target: URL): string {
  const headers = { ...request.headers, host: target.host };
  const lines = [`GET ${target.pathname}${target.search} HTTP/1.1`];
  for (const [key, value] of Object.entries(headers)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const item of value) lines.push(`${key}: ${item}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  return `${lines.join('\r\n')}\r\n\r\n`;
}

function proxyUpgrade(request: IncomingMessage, socket: Socket | import('node:stream').Duplex, head: Buffer, registry: InstanceRegistry): void {
  const record = resolveBridgeRecord(request.headers.host, registry);
  if (!record) {
    socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
    return;
  }

  const target = buildTargetUrl(record, request.url);
  const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80));
  const upstream = target.protocol === 'https:'
    ? tlsConnect({ host: target.hostname, port, servername: target.hostname })
    : netConnect({ host: target.hostname, port });
  const readyEvent = target.protocol === 'https:' ? 'secureConnect' : 'connect';

  upstream.once(readyEvent, () => {
    upstream.write(serializeUpgradeRequest(request, target));
    if (head.length > 0) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'));
  socket.on('error', () => upstream.destroy());
}

export function registerViewerBridgeRoute(app: FastifyInstance, registry: InstanceRegistry): void {
  app.all('/*', async (request, reply) => {
    const record = resolveBridgeRecord(request.headers.host, registry);
    if (!record) {
      reply.callNotFound();
      return;
    }
    await proxyHttp(request as BridgeRequest, reply, record);
  });

  app.server.on('upgrade', (request, socket, head) => proxyUpgrade(request, socket, head, registry));
}
