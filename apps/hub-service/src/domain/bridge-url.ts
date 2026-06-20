/**
 * [INPUT]: 依赖 node:crypto、标准 URL 能力与 ccv-hub 公网域名环境变量
 * [OUTPUT]: 对外提供 createBridgeConfig、createBridgeIdentity、buildBridgeUrl、resolveBridgeIdFromHost 与 appendUpstreamToken
 * [POS]: hub-service 的公网桥接地址模块，统一随机实例子域名生成、Host 解析与 upstream token 注入规则
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomUUID } from 'node:crypto';

export type BridgeConfig = {
  protocol: string;
  domain: string;
  subdomainPrefix: string;
};

export type BridgeIdentity = {
  id: string;
  host: string;
};

const dnsNamePattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/u;
const prefixPattern = /^[a-z0-9-]+$/u;

export function createBridgeConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  if (env.CCV_HUB_ENV === 'production' && !env.CCV_HUB_PUBLIC_DOMAIN) {
    throw new Error('CCV_HUB_PUBLIC_DOMAIN is required in production');
  }
  const domain = env.CCV_HUB_PUBLIC_DOMAIN ?? 'example.com';
  const subdomainPrefix = env.CCV_HUB_VIEWER_SUBDOMAIN_PREFIX ?? 'ccv-';
  if (!dnsNamePattern.test(domain)) throw new Error('CCV_HUB_PUBLIC_DOMAIN must be a DNS domain');
  if (!prefixPattern.test(subdomainPrefix)) throw new Error('CCV_HUB_VIEWER_SUBDOMAIN_PREFIX must be DNS-safe');
  return {
    protocol: env.CCV_HUB_PUBLIC_PROTOCOL ?? 'https',
    domain,
    subdomainPrefix,
  };
}

export function createBridgeIdentity(config = createBridgeConfig()): BridgeIdentity {
  const id = randomUUID().replaceAll('-', '').slice(0, 32);
  return {
    id,
    host: `${config.subdomainPrefix}${id}.${config.domain}`,
  };
}

export function buildBridgeUrl(bridgeId: string, upstreamUrl: string, config = createBridgeConfig()): string {
  const identity: BridgeIdentity = {
    id: bridgeId,
    host: `${config.subdomainPrefix}${bridgeId}.${config.domain}`,
  };
  const url = new URL(`${config.protocol}://${identity.host}/`);
  const token = new URL(upstreamUrl).searchParams.get('token');
  if (token) {
    url.searchParams.set('token', token);
  }
  return url.toString();
}

export function resolveBridgeIdFromHost(hostHeader: string | undefined, config = createBridgeConfig()): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.split(':')[0]?.toLowerCase() ?? '';
  const prefix = config.subdomainPrefix.toLowerCase();
  const suffix = `.${config.domain.toLowerCase()}`;
  if (!host.startsWith(prefix) || !host.endsWith(suffix)) return null;
  const bridgeId = host.slice(prefix.length, -suffix.length);
  return /^[a-f0-9]{32}$/u.test(bridgeId) ? bridgeId : null;
}

export function appendUpstreamToken(target: URL, upstreamUrl: string): URL {
  const upstreamToken = new URL(upstreamUrl).searchParams.get('token');
  if (upstreamToken) {
    target.searchParams.delete('token');
    target.searchParams.set('token', upstreamToken);
  }
  return target;
}
