/**
 * [INPUT]: 依赖 node:crypto、标准 URL 能力与 ccv-hub 公网 host/path 环境变量
 * [OUTPUT]: 对外提供 createBridgeConfig、createBridgeIdentity、buildBridgeUrl、resolveBridgeIdFromPath、stripBridgePathPrefix、buildBridgeBasePath 与 appendUpstreamToken
 * [POS]: hub-service 的公网桥接地址模块，统一稳定主机 path 生成、path 解析与 upstream token 注入规则
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomUUID } from 'node:crypto';

export type BridgeConfig = {
  protocol: string;
  publicHost: string;
  viewerPathPrefix: string;
};

export type BridgeIdentity = {
  id: string;
};

const hostPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/u;
const pathPrefixPattern = /^\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*$/u;
const bridgeIdPattern = /^[a-f0-9]{32}$/u;
const reservedPathPrefixes = ['/api', '/favicon.ico'];

function normalizePathPrefix(value: string | undefined): string {
  const raw = value?.trim() || '/viewer';
  const prefixed = raw.startsWith('/') ? raw : `/${raw}`;
  const normalized = prefixed.replace(/\/+$/u, '');
  return normalized || '/viewer';
}

function assertViewerPathPrefix(value: string): void {
  if (!pathPrefixPattern.test(value)) throw new Error('CCV_HUB_VIEWER_PATH_PREFIX must be a safe absolute path prefix');
  if (reservedPathPrefixes.some((prefix) => value === prefix || value.startsWith(`${prefix}/`))) {
    throw new Error('CCV_HUB_VIEWER_PATH_PREFIX conflicts with reserved Hub paths');
  }
}

function normalizeUpstreamPath(pathname: string): string {
  return `/${pathname.replace(/^\/+/u, '')}`;
}

export function createBridgeConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  if (env.CCV_HUB_ENV === 'production' && !env.CCV_HUB_PUBLIC_HOST) {
    throw new Error('CCV_HUB_PUBLIC_HOST is required in production');
  }
  const publicHost = env.CCV_HUB_PUBLIC_HOST ?? 'localhost';
  const viewerPathPrefix = normalizePathPrefix(env.CCV_HUB_VIEWER_PATH_PREFIX);
  if (!hostPattern.test(publicHost)) throw new Error('CCV_HUB_PUBLIC_HOST must be a DNS host');
  assertViewerPathPrefix(viewerPathPrefix);
  return {
    protocol: env.CCV_HUB_PUBLIC_PROTOCOL ?? 'https',
    publicHost,
    viewerPathPrefix,
  };
}

export function createBridgeIdentity(): BridgeIdentity {
  return { id: randomUUID().replaceAll('-', '').slice(0, 32) };
}

export function buildBridgeBasePath(bridgeId: string, config = createBridgeConfig()): string {
  return `${config.viewerPathPrefix}/${bridgeId}`;
}

export function buildBridgeUrl(bridgeId: string, upstreamUrl: string, config = createBridgeConfig()): string {
  const url = new URL(`${config.protocol}://${config.publicHost}${buildBridgeBasePath(bridgeId, config)}/`);
  const token = new URL(upstreamUrl).searchParams.get('token');
  if (token) {
    url.searchParams.set('token', token);
  }
  return url.toString();
}

export function resolveBridgeIdFromPath(pathname: string, config = createBridgeConfig()): string | null {
  const prefix = config.viewerPathPrefix;
  const suffix = pathname === prefix ? '' : pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length + 1) : '';
  const bridgeId = suffix.split('/')[0] ?? '';
  return bridgeIdPattern.test(bridgeId) ? bridgeId : null;
}

export function stripBridgePathPrefix(requestUrl: string, bridgeId: string, config = createBridgeConfig()): string {
  const parsed = new URL(requestUrl, 'http://localhost');
  const basePath = buildBridgeBasePath(bridgeId, config);
  if (parsed.pathname === basePath || parsed.pathname === `${basePath}/`) {
    parsed.pathname = '/';
  } else if (parsed.pathname.startsWith(`${basePath}/`)) {
    parsed.pathname = normalizeUpstreamPath(parsed.pathname.slice(basePath.length));
  }
  return `${parsed.pathname}${parsed.search}`;
}

export function appendUpstreamToken(target: URL, upstreamUrl: string): URL {
  const upstreamToken = new URL(upstreamUrl).searchParams.get('token');
  if (upstreamToken) {
    target.searchParams.delete('token');
    target.searchParams.set('token', upstreamToken);
  }
  return target;
}
