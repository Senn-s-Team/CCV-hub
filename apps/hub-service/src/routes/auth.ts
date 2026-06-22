/**
 * [INPUT]: 依赖 FastifyInstance 路由能力、共享鉴权契约、auth-session 会话核心与 bridge path 解析
 * [OUTPUT]: 对外提供 registerAuthRoutes 与 registerPanelAuthGuard，用于登录、登出、登录态查询、控制面 API 保护和 viewer bridge path 边界保护
 * [POS]: hub-service 的面板鉴权边界，允许本机插件注册流量，把 viewer bridge 实例级鉴权交给 bridge 路由
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authLoginRequestSchema, type AuthLoginRequest, type AuthStatusResponse } from '@ccv-hub/shared-contracts';
import {
  createSessionToken,
  isAuthConfigured,
  type AuthConfig,
  verifyPassword,
  verifySessionToken,
} from '../domain/auth-session.js';
import { createBridgeConfig, resolveBridgeIdFromPath } from '../domain/bridge-url.js';

const localHosts = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const publicPanelPaths = new Set(['/api/auth/login', '/api/auth/me', '/api/health']);
const pluginPaths = new Set(['/api/instances/register', '/api/instances/unregister']);
const agentProxyTokenHeader = 'x-ccv-hub-agent-token';

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

function isBridgePath(pathname: string): boolean {
  return Boolean(resolveBridgeIdFromPath(pathname, createBridgeConfig()));
}

function isAuthenticated(request: FastifyRequest, config: AuthConfig): boolean {
  return hasValidSessionCookie(request.headers.cookie, config);
}

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function hasValidAgentProxyToken(request: FastifyRequest): boolean {
  const token = process.env.CCV_HUB_AGENT_PROXY_TOKEN;
  if (!token) return true;
  return safeEqual(headerValue(request, agentProxyTokenHeader) ?? '', token);
}

function isForwardedRequest(request: FastifyRequest): boolean {
  return Boolean(request.headers['x-forwarded-for'] || request.headers['x-real-ip']);
}

function isLocalPluginRequest(request: FastifyRequest, pathname: string): boolean {
  return isPluginPath(pathname) && isLocalRequest(request) && !isForwardedRequest(request);
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
    if (isBridgePath(pathname)) {
      if (hasValidAgentProxyToken(request)) return;
    } else if (!pathname.startsWith('/api/') || isPublicPanelPath(pathname)) {
      return;
    } else if (isLocalPluginRequest(request, pathname)) {
      return;
    } else if (hasValidAgentProxyToken(request) && isAuthenticated(request, config)) {
      return;
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
