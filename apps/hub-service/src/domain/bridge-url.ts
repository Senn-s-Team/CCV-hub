/**
 * [INPUT]: 依赖 node:crypto、标准 URL 能力与 ccv-hub 公网域名环境变量
 * [OUTPUT]: 对外提供 createBridgeConfig、createBridgeIdentity、buildBridgeUrl、resolveBridgeIdFromHost 与 appendUpstreamToken
 * [POS]: hub-service 的公网桥接地址模块，统一随机实例子域名生成、Host 解析与 token 传递规则
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

export function createBridgeConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  return {
    protocol: env.CCV_HUB_PUBLIC_PROTOCOL ?? 'https',
    domain: env.CCV_HUB_PUBLIC_DOMAIN ?? 'paas.996667.xyz',
    subdomainPrefix: env.CCV_HUB_VIEWER_SUBDOMAIN_PREFIX ?? 'ccv-',
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
  return host.slice(prefix.length, -suffix.length) || null;
}

export function appendUpstreamToken(target: URL, upstreamUrl: string): URL {
  const upstreamToken = new URL(upstreamUrl).searchParams.get('token');
  if (upstreamToken) {
    target.searchParams.delete('token');
    target.searchParams.set('token', upstreamToken);
  }
  return target;
}
