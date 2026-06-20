/**
 * [INPUT]: 依赖 node:crypto 的 HMAC、哈希与安全比较能力
 * [OUTPUT]: 对外提供 AuthConfig、resolveAuthConfig、createSessionToken、verifySessionToken 与 verifyPassword
 * [POS]: hub-service 的面板会话核心，负责把管理员口令转换成可校验 HttpOnly cookie token，并通过显式 cookie domain 控制跨子域范围
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

export type AuthConfig = {
  password: string | undefined;
  sessionSecret: string | undefined;
  cookieName: string;
  cookieSecure: boolean;
  cookieDomain: string | undefined;
  sessionTtlSeconds: number;
};

const defaultSessionTtlSeconds = 60 * 60 * 24 * 7;

function resolveCookieDomain(env: NodeJS.ProcessEnv): string | undefined {
  return env.CCV_HUB_COOKIE_DOMAIN;
}

export function resolveAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  return {
    password: env.CCV_HUB_AUTH_PASSWORD,
    sessionSecret: env.CCV_HUB_SESSION_SECRET,
    cookieName: env.CCV_HUB_SESSION_COOKIE ?? 'ccv_hub_session',
    cookieSecure: (env.CCV_HUB_COOKIE_SECURE ?? env.CCV_HUB_PUBLIC_PROTOCOL) === 'https',
    cookieDomain: resolveCookieDomain(env),
    sessionTtlSeconds: Number(env.CCV_HUB_SESSION_TTL_SECONDS ?? defaultSessionTtlSeconds),
  };
}

export function isAuthConfigured(config: AuthConfig): boolean {
  return Boolean(config.password && config.sessionSecret);
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function verifyPassword(input: string, config: AuthConfig): boolean {
  if (!config.password) return false;
  return timingSafeEqual(digest(input), digest(config.password));
}

export function createSessionToken(config: AuthConfig, now = Date.now()): string {
  if (!config.sessionSecret) return '';
  const payload = Buffer.from(JSON.stringify({ iat: now }), 'utf8').toString('base64url');
  return `${payload}.${sign(payload, config.sessionSecret)}`;
}

export function verifySessionToken(token: string | undefined, config: AuthConfig, now = Date.now()): boolean {
  if (!token || !config.sessionSecret) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = sign(payload, config.sessionSecret);
  if (!timingSafeEqual(digest(signature), digest(expected))) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { iat?: unknown };
    return typeof decoded.iat === 'number' && now - decoded.iat <= config.sessionTtlSeconds * 1000;
  } catch {
    return false;
  }
}
