/**
 * [INPUT]: 依赖 Fastify hook/route 能力、共享鉴权契约、auth-session 会话核心与 bridge Host 解析
 * [OUTPUT]: 对外提供 registerAuthRoutes 与 registerPanelAuthGuard，用于登录、登出、登录态查询、控制面 API 保护和 viewer bridge 页面保护
 * [POS]: hub-service 的面板鉴权边界，允许本机插件注册流量，把 viewer bridge 与控制面 API 统一到管理员会话
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authLoginRequestSchema, type AuthLoginRequest, type AuthStatusResponse } from '@ccv-hub/shared-contracts';
import {
  createSessionToken,
  isAuthConfigured,
  type AuthConfig,
  verifyPassword,
  verifySessionToken,
} from '../domain/auth-session.js';
import { resolveBridgeIdFromHost } from '../domain/bridge-url.js';

const localHosts = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const publicPanelPaths = new Set(['/api/auth/login', '/api/auth/me', '/api/health']);
const pluginPaths = new Set(['/api/instances/register', '/api/instances/unregister']);
const bridgeBlockedPathPrefixes = ['/api/auth', '/api/host-paths', '/api/instances'];

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(header.split(';').map((part) => {
    const [name = '', ...valueParts] = part.trim().split('=');
    return [name, decodeURIComponent(valueParts.join('='))];
  }).filter(([name]) => name.length > 0));
}

function cookieAttributes(config: AuthConfig): string {
  return [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${config.sessionTtlSeconds}`,
    config.cookieDomain ? `Domain=${config.cookieDomain}` : '',
    config.cookieSecure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

function setSessionCookie(reply: FastifyReply, config: AuthConfig, token: string): void {
  reply.header('Set-Cookie', `${config.cookieName}=${encodeURIComponent(token)}; ${cookieAttributes(config)}`);
}

function clearSessionCookie(reply: FastifyReply, config: AuthConfig): void {
  const domain = config.cookieDomain ? `; Domain=${config.cookieDomain}` : '';
  reply.header('Set-Cookie', `${config.cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${domain}${config.cookieSecure ? '; Secure' : ''}`);
}

export function hasValidSessionCookie(cookieHeader: string | undefined, config: AuthConfig): boolean {
  return isAuthConfigured(config) && verifySessionToken(parseCookies(cookieHeader)[config.cookieName], config);
}

function isLocalRequest(request: FastifyRequest): boolean {
  return localHosts.has(request.ip);
}

function isPluginPath(pathname: string): boolean {
  return pluginPaths.has(pathname);
}

function isPublicPanelPath(pathname: string): boolean {
  return publicPanelPaths.has(pathname);
}

function isBridgeBlockedPath(pathname: string): boolean {
  return bridgeBlockedPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isBridgeProxyRequest(request: FastifyRequest, pathname: string): boolean {
  return Boolean(resolveBridgeIdFromHost(request.headers.host)) && !isBridgeBlockedPath(pathname);
}

function isAuthenticated(request: FastifyRequest, config: AuthConfig): boolean {
  return hasValidSessionCookie(request.headers.cookie, config);
}

function authStatus(request: FastifyRequest, config: AuthConfig): AuthStatusResponse {
  return {
    ok: true,
    data: {
      authenticated: isAuthenticated(request, config),
      configured: isAuthConfigured(config),
    },
  };
}

export function registerAuthRoutes(app: FastifyInstance, config: AuthConfig): void {
  app.get('/api/auth/me', async (request): Promise<AuthStatusResponse> => authStatus(request, config));

  app.post<{ Body: AuthLoginRequest }>('/api/auth/login', async (request, reply): Promise<AuthStatusResponse> => {
    const parsed = authLoginRequestSchema.safeParse(request.body);
    if (!isAuthConfigured(config) || !parsed.success || !verifyPassword(parsed.data.password, config)) {
      reply.code(401);
      return { ok: true, data: { authenticated: false, configured: isAuthConfigured(config) } };
    }

    setSessionCookie(reply, config, createSessionToken(config));
    return { ok: true, data: { authenticated: true, configured: true } };
  });

  app.post('/api/auth/logout', async (_, reply): Promise<AuthStatusResponse> => {
    clearSessionCookie(reply, config);
    return { ok: true, data: { authenticated: false, configured: isAuthConfigured(config) } };
  });
}

export function registerPanelAuthGuard(app: FastifyInstance, config: AuthConfig): void {
  app.addHook('preHandler', async (request, reply) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (isBridgeProxyRequest(request, pathname)) {
      if (isAuthenticated(request, config)) return;
    } else {
      if (!pathname.startsWith('/api/') || isPublicPanelPath(pathname)) return;
      if (isPluginPath(pathname) && isLocalRequest(request)) return;
      if (isAuthenticated(request, config)) return;
    }

    reply.code(401).send({
      ok: false,
      error: {
        code: isAuthConfigured(config) ? 'UNAUTHORIZED' : 'AUTH_NOT_CONFIGURED',
        message: isAuthConfigured(config) ? 'Authentication required' : 'Hub authentication is not configured',
      },
    });
  });
}
