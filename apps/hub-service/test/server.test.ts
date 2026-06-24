/**
 * [INPUT]: 依赖 vitest、node:http、node:net、hub-service 服务装配、Hub 插件安装器与 launcher 参数/环境构造函数
 * [OUTPUT]: 对外提供 hub-service 路由、稳定 path 启动 URL、外部注册、logger 注销、Hub 插件安装、viewer bridge、存活清理与启动参数/环境回归测试
 * [POS]: hub-service 的测试入口，负责验证健康接口、实例列表、创建/注册流程、URL 投影、HTTP/multipart/WebSocket path 桥接、插件播种与启动环境收敛
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, symlink, rm, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../src/server.js';
import type { AuthConfig } from '../src/domain/auth-session.js';
import { buildBridgeBasePath, createBridgeConfig } from '../src/domain/bridge-url.js';
import { HostPathBrowser } from '../src/domain/host-path-browser.js';
import { InstanceRegistry } from '../src/domain/instance-registry.js';
import { buildLaunchArgs, buildLaunchEnv, parseViewerUrl, resolveViewerUrl } from '../src/launcher/ccv-launcher.js';
import { createStopHandle } from '../src/launcher/process-supervisor.js';
import { installHubPlugin } from '../src/domain/hub-plugin-installer.js';

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
  });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}


class FakeChildProcess extends EventEmitter {
  killed = false;
  readonly kill = vi.fn((signal?: NodeJS.Signals) => {
    if (signal === 'SIGKILL') this.killed = true;
    return true;
  });
}

const authConfig: AuthConfig = {
  password: 'secret',
  sessionSecret: 'test-session-secret',
  cookieName: 'ccv_hub_session',
  cookieSecure: false,
  cookieDomain: undefined,
  sessionTtlSeconds: 60,
};

async function authHeaders(app: ReturnType<typeof buildServer>): Promise<{ cookie: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { password: 'secret' },
  });
  return { cookie: String(response.headers['set-cookie']).split(';')[0]! };
}

async function proxiedAuthHeaders(app: ReturnType<typeof buildServer>, token = 'proxy-secret'): Promise<{ cookie: string; 'x-ccv-hub-agent-token': string }> {
  return { ...(await authHeaders(app)), 'x-ccv-hub-agent-token': token };
}

function readSocketUntil(port: number, request: string, marker: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    const socket = createConnection(port, '127.0.0.1', () => socket.write(request));
    socket.on('data', (chunk) => {
      data += chunk.toString('utf8');
      if (data.includes(marker)) {
        socket.end();
        resolve(data);
      }
    });
    socket.on('error', reject);
    socket.setTimeout(1000, () => {
      socket.destroy();
      reject(new Error(`Timed out waiting for ${marker}`));
    });
  });
}

describe('hub-service routes', () => {
  beforeEach(() => {
    process.env.CCV_HUB_PUBLIC_PROTOCOL = 'https';
    process.env.CCV_HUB_PUBLIC_HOST = 'ccv-hub.test';
    process.env.CCV_HUB_VIEWER_PATH_PREFIX = '/viewer';
    delete process.env.CCV_HUB_AGENT_PROXY_TOKEN;
  });

  it('returns health response', async () => {
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      data: { status: 'ok' },
    });

    await app.close();
  });

  it('requires authentication for panel instance APIs', async () => {
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    const response = await app.inject({ method: 'GET', url: '/api/instances' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });

    await app.close();
  });

  it('treats malformed auth cookies as unauthenticated panel requests', async () => {
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/instances',
      headers: { cookie: 'ccv_hub_session=%' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');

    await app.close();
  });
  it('sets and clears authenticated panel sessions', async () => {
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { password: 'secret' },
    });
    const cookie = loginResponse.headers['set-cookie'];

    expect(loginResponse.statusCode).toBe(200);
    expect(loginResponse.json()).toEqual({ ok: true, data: { authenticated: true, configured: true } });
    expect(cookie).toContain('ccv_hub_session=');
    expect(cookie).not.toContain('Domain=');

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/instances',
      headers: { cookie: String(cookie).split(';')[0]! },
    });
    expect(listResponse.statusCode).toBe(200);

    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: String(cookie).split(';')[0]! },
    });
    expect(logoutResponse.headers['set-cookie']).toContain('Max-Age=0');

    await app.close();
  });

  it('rejects external registration without an upstream token', async () => {
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/instances/register',
      remoteAddress: '127.0.0.1',
      payload: {
        id: 'manual-tokenless',
        projectName: 'cc-viewer',
        projectPath: '/home/opc/projects/ccvs/cc-viewer',
        url: 'http://127.0.0.1:7008',
        port: 7008,
        pid: 4321,
        source: 'manual',
        startedAt: '2026-04-22T10:00:00.000Z',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toEqual({
      code: 'REGISTER_FAILED',
      message: 'Instance URL token is required',
    });

    await app.close();
  });

  it('requires agent proxy token for forwarded panel APIs and viewer bridge requests', async () => {
    process.env.CCV_HUB_AGENT_PROXY_TOKEN = 'proxy-secret';
    const registry = new InstanceRegistry();
    registry.createRunning({
      id: 'proxy-token-bridge',
      projectName: 'alpha',
      projectPath: '/tmp/alpha',
      url: 'https://ccv-hub.test/viewer/1234567890abcdef1234567890abcdef/?token=abc',
      upstreamUrl: 'http://127.0.0.1:4321?token=abc',
      bridgeId: '1234567890abcdef1234567890abcdef',
      port: 4321,
      pid: 1001,
      source: 'launcher',
      startedAt: '2026-04-22T10:00:00.000Z',
      lastSeen: '2026-04-22T10:00:01.000Z',
      stop: vi.fn(),
    });
    const app = buildServer({
      registry,
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    const panelWithoutProxyToken = await app.inject({
      method: 'GET',
      url: '/api/instances',
      headers: await authHeaders(app),
    });
    const panelWithProxyToken = await app.inject({
      method: 'GET',
      url: '/api/instances',
      headers: await proxiedAuthHeaders(app),
    });
    const viewerWithoutProxyToken = await app.inject({
      method: 'GET',
      url: '/viewer/1234567890abcdef1234567890abcdef/?token=abc',
      headers: { host: 'ccv-hub.test' },
    });

    expect(panelWithoutProxyToken.statusCode).toBe(401);
    expect(panelWithProxyToken.statusCode).toBe(200);
    expect(viewerWithoutProxyToken.statusCode).toBe(401);

    await app.close();
  });

  it('keeps local plugin registration open while panel APIs are protected', async () => {
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/instances/register',
      remoteAddress: '127.0.0.1',
      payload: {
        id: 'manual-local',
        projectName: 'cc-viewer',
        projectPath: '/home/opc/projects/ccvs/cc-viewer',
        url: 'http://127.0.0.1:7008?token=abc',
        port: 7008,
        pid: 4321,
        source: 'manual',
        startedAt: '2026-04-22T10:00:00.000Z',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.instance.id).toBe('manual-local');

    await app.close();
  });

  it('returns running instances in startedAt descending order', async () => {
    const oldServer = createServer((_, response) => response.end('old'));
    const newServer = createServer((_, response) => response.end('new'));
    const oldPort = await listen(oldServer);
    const newPort = await listen(newServer);
    const registry = new InstanceRegistry();
    registry.createStarting({
      id: 'old',
      projectName: 'alpha',
      projectPath: '/tmp/alpha',
      url: `http://127.0.0.1:${oldPort}`,
      port: oldPort,
      pid: 1001,
      source: 'launcher',
      startedAt: '2026-04-22T10:00:00.000Z',
      lastSeen: '2026-04-22T10:00:01.000Z',
    });
    registry.markRunning('old');
    registry.createStarting({
      id: 'new',
      projectName: 'beta',
      projectPath: '/tmp/beta',
      url: `http://127.0.0.1:${newPort}`,
      port: newPort,
      pid: 1002,
      source: 'launcher',
      startedAt: '2026-04-22T11:00:00.000Z',
      lastSeen: '2026-04-22T11:00:01.000Z',
    });
    registry.markRunning('new');
    registry.createStarting({
      id: 'stale',
      projectName: 'gamma',
      projectPath: '/tmp/gamma',
      url: 'http://127.0.0.1:4003',
      port: 4003,
      pid: 1003,
      source: 'launcher',
      startedAt: '2026-04-22T12:00:00.000Z',
      lastSeen: '2026-04-22T12:00:01.000Z',
    });
    registry.markStale('stale');

    const app = buildServer({
      registry,
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/api/instances', headers: await authHeaders(app) });
      const json = response.json();

      expect(response.statusCode).toBe(200);
      expect(json.ok).toBe(true);
      expect(json.data.instances.map((instance: { id: string }) => instance.id)).toEqual(['new', 'old']);
    } finally {
      await app.close();
      await close(oldServer);
      await close(newServer);
    }
  });

  it('removes running instances whose viewer port is closed', async () => {
    const registry = new InstanceRegistry();
    registry.createStarting({
      id: 'dead',
      projectName: 'alpha',
      projectPath: '/tmp/alpha',
      url: 'http://127.0.0.1:49999',
      port: 49999,
      pid: 1001,
      source: 'launcher',
      startedAt: '2026-04-22T10:00:00.000Z',
      lastSeen: '2026-04-22T10:00:01.000Z',
    });
    registry.markRunning('dead');

    const app = buildServer({
      registry,
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    const response = await app.inject({ method: 'GET', url: '/api/instances', headers: await authHeaders(app) });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.instances).toHaveLength(0);

    await app.close();
  });

  it('keeps running instances whose viewer port is reachable', async () => {
    const server = createServer((_, response) => {
      response.end('ok');
    });
    const port = await listen(server);
    const registry = new InstanceRegistry();
    registry.createStarting({
      id: 'alive',
      projectName: 'alpha',
      projectPath: '/tmp/alpha',
      url: `http://127.0.0.1:${port}`,
      port,
      pid: 1001,
      source: 'launcher',
      startedAt: '2026-04-22T10:00:00.000Z',
      lastSeen: '2026-04-22T10:00:01.000Z',
    });
    registry.markRunning('alive');

    const app = buildServer({
      registry,
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/api/instances', headers: await authHeaders(app) });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.instances.map((instance: { id: string }) => instance.id)).toEqual(['alive']);
    } finally {
      await app.close();
      await close(server);
    }
  });

  it('parses local and network viewer urls from ccv output', () => {
    expect(parseViewerUrl('  ➜ Local:   http://127.0.0.1:7008')).toBe('http://127.0.0.1:7008');
    expect(parseViewerUrl('  ➜ Network: http://10.0.0.212:7008?token=abc')).toBe('http://10.0.0.212:7008?token=abc');
  });

  it('resolves best viewer url from cc-viewer local-url api', async () => {
    const server = createServer((request, response) => {
      if (request.url === '/api/local-url') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ url: 'http://10.0.0.212:7008?token=abc' }));
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    const port = await listen(server);

    try {
      await expect(resolveViewerUrl(`http://127.0.0.1:${port}`)).resolves.toBe('http://10.0.0.212:7008?token=abc');
    } finally {
      await close(server);
    }
  });

  it('requires a valid public host and viewer path prefix', () => {
    expect(() => createBridgeConfig({ CCV_HUB_ENV: 'production' })).toThrow('CCV_HUB_PUBLIC_HOST is required in production');
    expect(() => createBridgeConfig({ CCV_HUB_PUBLIC_HOST: 'bad host' })).toThrow('CCV_HUB_PUBLIC_HOST must be a DNS host');
    expect(() => createBridgeConfig({ CCV_HUB_PUBLIC_HOST: 'ccv-hub.test', CCV_HUB_VIEWER_PATH_PREFIX: '/api' })).toThrow('CCV_HUB_VIEWER_PATH_PREFIX conflicts with reserved Hub paths');
    expect(() => createBridgeConfig({ CCV_HUB_PUBLIC_HOST: 'ccv-hub.test', CCV_HUB_VIEWER_PATH_PREFIX: '/assets' })).toThrow('CCV_HUB_VIEWER_PATH_PREFIX conflicts with reserved Hub paths');
    expect(() => createBridgeConfig({ CCV_HUB_PUBLIC_HOST: 'ccv-hub.test', CCV_HUB_VIEWER_PATH_PREFIX: '/../viewer' })).toThrow('CCV_HUB_VIEWER_PATH_PREFIX must be a safe absolute path prefix');
    expect(createBridgeConfig({
      CCV_HUB_PUBLIC_HOST: 'ccv-hub.test',
      CCV_HUB_VIEWER_PATH_PREFIX: 'viewer/',
    })).toMatchObject({
      publicHost: 'ccv-hub.test',
      viewerPathPrefix: '/viewer',
    });
  });

  it('protects hub host api even when hub host starts with the viewer prefix', async () => {
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/instances',
      headers: { host: 'ccv-hub-dev.test' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });

    await app.close();
  });

  it('requires the viewer token for bridge pages', async () => {
    const registry = new InstanceRegistry();
    registry.createRunning({
      id: 'bridge-auth',
      projectName: 'alpha',
      projectPath: '/tmp/alpha',
      url: 'https://ccv-hub.test/viewer/1234567890abcdef1234567890abcdef/?token=abc',
      upstreamUrl: 'http://127.0.0.1:4321?token=abc',
      bridgeId: '1234567890abcdef1234567890abcdef',
      port: 4321,
      pid: 1001,
      source: 'launcher',
      startedAt: '2026-04-22T10:00:00.000Z',
      lastSeen: '2026-04-22T10:00:01.000Z',
      stop: vi.fn(),
    });
    const app = buildServer({
      registry,
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/viewer/1234567890abcdef1234567890abcdef/',
      headers: { host: 'ccv-hub.test' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');

    await app.close();
  });

  it('bridges viewer pages with the URL token and sets an instance session cookie', async () => {
    const upstream = createServer((request, response) => {
      response.setHeader('content-type', 'text/html');
      response.setHeader('set-cookie', ['viewer_pref=compact; Path=/; SameSite=Lax', 'ccv_hub_session=evil; Path=/']);
      response.end(`page:${request.url}`);
    });
    const upstreamPort = await listen(upstream);
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    try {
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/instances/register',
        payload: {
          id: 'manual-bridge-page',
          projectName: 'cc-viewer',
          projectPath: '/home/opc/projects/ccvs/cc-viewer',
          url: `http://127.0.0.1:${upstreamPort}?token=abc`,
          port: upstreamPort,
          pid: 4321,
          source: 'manual',
          startedAt: '2026-04-22T10:00:00.000Z',
        },
      });
      const viewerUrl = new URL(registerResponse.json().data.instance.url);
      const bridgeId = viewerUrl.pathname.split('/')[2]!;
      const bridgePath = buildBridgeBasePath(bridgeId);

      const firstResponse = await app.inject({
        method: 'GET',
        url: `${bridgePath}/?token=abc`,
        headers: { host: viewerUrl.host },
      });
      const setCookies = firstResponse.headers['set-cookie'];
      const cookies = Array.isArray(setCookies) ? setCookies : [String(setCookies)];
      const cookie = cookies.find((value) => value.startsWith(`ccv_viewer_session_${bridgeId}=`))?.split(';')[0]!;
      const nextResponse = await app.inject({
        method: 'GET',
        url: `${bridgePath}/assets/app.js`,
        headers: { host: viewerUrl.host, cookie },
      });

      expect(firstResponse.statusCode).toBe(200);
      expect(firstResponse.body).toBe('page:/?token=abc');
      expect(cookie).toBe(`ccv_viewer_session_${bridgeId}=abc`);
      expect(cookies).toContain(`viewer_pref=compact; Path=${bridgePath}; SameSite=Lax`);
      expect(cookies).toContain(`ccv_viewer_session_${bridgeId}=abc; Path=${bridgePath}; HttpOnly; SameSite=Lax; Max-Age=604800; Secure`);
      expect(cookies.join('\n')).not.toContain('ccv_hub_session=evil');
      expect(nextResponse.statusCode).toBe(200);
      expect(nextResponse.body).toBe('page:/assets/app.js?token=abc');
    } finally {
      await app.close();
      await close(upstream);
    }
  });

  it('rewrites viewer HTML root assets to the bridge path', async () => {
    const upstream = createServer((_, response) => {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end('<script type="module" src="/assets/vendor-antd-Bur5ZxWE.js"></script><link rel="stylesheet" href="/assets/index-Cy7Xfu81.css">');
    });
    const upstreamPort = await listen(upstream);
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    try {
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/instances/register',
        payload: {
          id: 'manual-bridge-html-assets',
          projectName: 'cc-viewer',
          projectPath: '/home/opc/projects/ccvs/cc-viewer',
          url: `http://127.0.0.1:${upstreamPort}?token=abc`,
          port: upstreamPort,
          pid: 4321,
          source: 'manual',
          startedAt: '2026-04-22T10:00:00.000Z',
        },
      });
      const viewerUrl = new URL(registerResponse.json().data.instance.url);
      const bridgeId = viewerUrl.pathname.split('/')[2]!;
      const bridgePath = buildBridgeBasePath(bridgeId);

      const response = await app.inject({
        method: 'GET',
        url: `${bridgePath}/?token=abc`,
        headers: { host: viewerUrl.host },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(`src="${bridgePath}/assets/vendor-antd-Bur5ZxWE.js"`);
      expect(response.body).toContain(`href="${bridgePath}/assets/index-Cy7Xfu81.css"`);
      expect(response.body).not.toContain('src="/assets/vendor-antd-Bur5ZxWE.js"');
    } finally {
      await app.close();
      await close(upstream);
    }
  });

  it('rewrites viewer CSS root asset references to the bridge path', async () => {
    const upstream = createServer((_, response) => {
      response.setHeader('content-type', 'text/css; charset=utf-8');
      response.end('@import "/assets/theme.css"; .hero{background:url(/assets/bg.png)} @font-face{src:url("/assets/font.woff2")} .icon{background:url(\'/assets/icon.svg\')}');
    });
    const upstreamPort = await listen(upstream);
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    try {
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/instances/register',
        payload: {
          id: 'manual-bridge-css-assets',
          projectName: 'cc-viewer',
          projectPath: '/home/opc/projects/ccvs/cc-viewer',
          url: `http://127.0.0.1:${upstreamPort}?token=abc`,
          port: upstreamPort,
          pid: 4321,
          source: 'manual',
          startedAt: '2026-04-22T10:00:00.000Z',
        },
      });
      const viewerUrl = new URL(registerResponse.json().data.instance.url);
      const bridgeId = viewerUrl.pathname.split('/')[2]!;
      const bridgePath = buildBridgeBasePath(bridgeId);

      const response = await app.inject({
        method: 'GET',
        url: `${bridgePath}/assets/index.css?token=abc`,
        headers: { host: viewerUrl.host },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(`@import "${bridgePath}/assets/theme.css"`);
      expect(response.body).toContain(`url(${bridgePath}/assets/bg.png)`);
      expect(response.body).toContain(`url("${bridgePath}/assets/font.woff2")`);
      expect(response.body).toContain(`url('${bridgePath}/assets/icon.svg')`);
      expect(response.body).not.toContain('url(/assets/');
    } finally {
      await app.close();
      await close(upstream);
    }
  });

  it('decodes compressed viewer text before rewriting root assets', async () => {
    const upstream = createServer((_, response) => {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.setHeader('content-encoding', 'gzip');
      response.end(gzipSync('<script src="/assets/app.js"></script>'));
    });
    const upstreamPort = await listen(upstream);
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    try {
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/instances/register',
        payload: {
          id: 'manual-bridge-gzip-html',
          projectName: 'cc-viewer',
          projectPath: '/home/opc/projects/ccvs/cc-viewer',
          url: `http://127.0.0.1:${upstreamPort}?token=abc`,
          port: upstreamPort,
          pid: 4321,
          source: 'manual',
          startedAt: '2026-04-22T10:00:00.000Z',
        },
      });
      const viewerUrl = new URL(registerResponse.json().data.instance.url);
      const bridgeId = viewerUrl.pathname.split('/')[2]!;
      const bridgePath = buildBridgeBasePath(bridgeId);

      const response = await app.inject({
        method: 'GET',
        url: `${bridgePath}/?token=abc`,
        headers: { host: viewerUrl.host, 'accept-encoding': 'gzip' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-encoding']).toBeUndefined();
      expect(response.body).toBe(`<script src="${bridgePath}/assets/app.js"></script>`);
    } finally {
      await app.close();
      await close(upstream);
    }
  });

  it('rewrites viewer JavaScript root asset preload literals to the bridge path', async () => {
    const upstream = createServer((request, response) => {
      if (request.url?.startsWith('/assets/vendor-mdxeditor-Cco3AQJS.js')) {
        response.setHeader('content-type', 'application/javascript');
        response.end('const deps=["assets/App-DVWiEmB2.js","assets/seqResourceLoaders-CX6xejM7.css"]; const endpoints={status:"/api/im/feishu/status"}; const ws=`${getBasePath().replace(/\\/$/,"")}/ws/terminal`; let sse="/events"; sse=`/events?since=${encodeURIComponent("x")}`;');
        return;
      }
      response.setHeader('content-type', 'text/html');
      response.end('ok');
    });
    const upstreamPort = await listen(upstream);
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    try {
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/instances/register',
        payload: {
          id: 'manual-bridge-js-assets',
          projectName: 'cc-viewer',
          projectPath: '/home/opc/projects/ccvs/cc-viewer',
          url: `http://127.0.0.1:${upstreamPort}?token=abc`,
          port: upstreamPort,
          pid: 4321,
          source: 'manual',
          startedAt: '2026-04-22T10:00:00.000Z',
        },
      });
      const viewerUrl = new URL(registerResponse.json().data.instance.url);
      const bridgeId = viewerUrl.pathname.split('/')[2]!;
      const bridgePath = buildBridgeBasePath(bridgeId);

      const response = await app.inject({
        method: 'GET',
        url: `${bridgePath}/assets/vendor-mdxeditor-Cco3AQJS.js?token=abc`,
        headers: { host: viewerUrl.host },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(`"${bridgePath.slice(1)}/assets/App-DVWiEmB2.js"`);
      expect(response.body).toContain(`"${bridgePath.slice(1)}/assets/seqResourceLoaders-CX6xejM7.css"`);
      expect(response.body).toContain(`"${bridgePath}/api/im/feishu/status"`);
      expect(response.body).toContain(`${bridgePath}/ws/terminal`);
      expect(response.body).toContain(`"${bridgePath}/events"`);
      expect(response.body).toContain(`\`${bridgePath}/events?since=`);
      expect(response.body).not.toContain(`"${bridgePath}/assets/App-DVWiEmB2.js"`);
      expect(response.body).not.toContain('"assets/App-DVWiEmB2.js"');
      expect(response.body).not.toContain('"/api/im/feishu/status"');
    } finally {
      await app.close();
      await close(upstream);
    }
  });
  it('bridges viewer path requests to the registered upstream with token', async () => {
    const upstream = createServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ url: request.url, host: request.headers.host }));
    });
    const upstreamPort = await listen(upstream);
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    try {
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/instances/register',
        payload: {
          id: 'manual-bridge',
          projectName: 'cc-viewer',
          projectPath: '/home/opc/projects/ccvs/cc-viewer',
          url: `http://127.0.0.1:${upstreamPort}?token=abc`,
          port: upstreamPort,
          pid: 4321,
          source: 'manual',
          startedAt: '2026-04-22T10:00:00.000Z',
        },
      });
      const viewerUrl = new URL(registerResponse.json().data.instance.url);
      const bridgeId = viewerUrl.pathname.split('/')[2]!;
      const bridgePath = buildBridgeBasePath(bridgeId);

      const response = await app.inject({
        method: 'GET',
        url: `${bridgePath}/api/events?cursor=1&token=evil`,
        headers: { host: viewerUrl.host, cookie: `ccv_viewer_session_${bridgeId}=abc` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        url: '/api/events?cursor=1&token=abc',
        host: `127.0.0.1:${upstreamPort}`,
      });
    } finally {
      await app.close();
      await close(upstream);
    }
  });

  it('keeps protocol-relative viewer paths on the registered upstream', async () => {
    const upstream = createServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ url: request.url, host: request.headers.host }));
    });
    const upstreamPort = await listen(upstream);
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    try {
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/instances/register',
        payload: {
          id: 'manual-bridge-protocol-relative',
          projectName: 'cc-viewer',
          projectPath: '/home/opc/projects/ccvs/cc-viewer',
          url: `http://127.0.0.1:${upstreamPort}?token=abc`,
          port: upstreamPort,
          pid: 4321,
          source: 'manual',
          startedAt: '2026-04-22T10:00:00.000Z',
        },
      });
      const viewerUrl = new URL(registerResponse.json().data.instance.url);
      const bridgeId = viewerUrl.pathname.split('/')[2]!;
      const bridgePath = buildBridgeBasePath(bridgeId);

      const response = await app.inject({
        method: 'GET',
        url: `${bridgePath}//evil.example/path?token=abc`,
        headers: { host: viewerUrl.host },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        url: '/evil.example/path?token=abc',
        host: `127.0.0.1:${upstreamPort}`,
      });
    } finally {
      await app.close();
      await close(upstream);
    }
  });

  it('rewrites upstream redirects to the public viewer path', async () => {
    const upstream = createServer((_, response) => {
      response.statusCode = 302;
      response.setHeader('location', '/api/events?cursor=1');
      response.end('redirect');
    });
    const upstreamPort = await listen(upstream);
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    try {
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/instances/register',
        payload: {
          id: 'manual-bridge-redirect',
          projectName: 'cc-viewer',
          projectPath: '/home/opc/projects/ccvs/cc-viewer',
          url: `http://127.0.0.1:${upstreamPort}?token=abc`,
          port: upstreamPort,
          pid: 4321,
          source: 'manual',
          startedAt: '2026-04-22T10:00:00.000Z',
        },
      });
      const viewerUrl = new URL(registerResponse.json().data.instance.url);
      const bridgeId = viewerUrl.pathname.split('/')[2]!;
      const bridgePath = buildBridgeBasePath(bridgeId);

      const response = await app.inject({
        method: 'GET',
        url: `${bridgePath}/redirect?token=abc`,
        headers: { host: viewerUrl.host },
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe(`https://ccv-hub.test${bridgePath}/api/events?cursor=1`);
    } finally {
      await app.close();
      await close(upstream);
    }
  });

  it('strips viewer cookies, hop-by-hop headers, and hub internals before proxying viewer requests', async () => {
    const upstream = createServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        cookie: request.headers.cookie ?? null,
        proxyAuthorization: request.headers['proxy-authorization'] ?? null,
        transferEncoding: request.headers['transfer-encoding'] ?? null,
        xCcvHubAgentToken: request.headers['x-ccv-hub-agent-token'] ?? null,
      }));
    });
    const upstreamPort = await listen(upstream);
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    try {
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/instances/register',
        payload: {
          id: 'manual-bridge-headers',
          projectName: 'cc-viewer',
          projectPath: '/home/opc/projects/ccvs/cc-viewer',
          url: `http://127.0.0.1:${upstreamPort}?token=abc`,
          port: upstreamPort,
          pid: 4321,
          source: 'manual',
          startedAt: '2026-04-22T10:00:00.000Z',
        },
      });
      const viewerUrl = new URL(registerResponse.json().data.instance.url);
      const bridgeId = viewerUrl.pathname.split('/')[2]!;
      const bridgePath = buildBridgeBasePath(bridgeId);

      const response = await app.inject({
        method: 'GET',
        url: `${bridgePath}/api/events`,
        headers: {
          host: viewerUrl.host,
          cookie: `ccv_viewer_session_${bridgeId}=abc; other=value`,
          'proxy-authorization': 'Basic abc',
          'transfer-encoding': 'chunked',
          'x-ccv-hub-agent-token': 'proxy-secret',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        cookie: null,
        proxyAuthorization: null,
        transferEncoding: null,
        xCcvHubAgentToken: null,
      });
    } finally {
      await app.close();
      await close(upstream);
    }
  });
  it('bridges viewer POST bodies to the registered upstream with token', async () => {
    const upstream = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ url: request.url, body: JSON.parse(body) }));
      });
    });
    const upstreamPort = await listen(upstream);
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    try {
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/instances/register',
        payload: {
          id: 'manual-bridge-post',
          projectName: 'cc-viewer',
          projectPath: '/home/opc/projects/ccvs/cc-viewer',
          url: `http://127.0.0.1:${upstreamPort}?token=abc`,
          port: upstreamPort,
          pid: 4321,
          source: 'manual',
          startedAt: '2026-04-22T10:00:00.000Z',
        },
      });
      const viewerUrl = new URL(registerResponse.json().data.instance.url);
      const bridgeId = viewerUrl.pathname.split('/')[2]!;
      const bridgePath = buildBridgeBasePath(bridgeId);

      const response = await app.inject({
        method: 'POST',
        url: `${bridgePath}/api/resume-choice?token=abc&token=abc`,
        headers: { host: viewerUrl.host, cookie: `ccv_viewer_session_${bridgeId}=abc` },
        payload: { choice: 'continue' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        url: '/api/resume-choice?token=abc',
        body: { choice: 'continue' },
      });
    } finally {
      await app.close();
      await close(upstream);
    }
  });

  it('bridges viewer multipart uploads as raw bytes with token', async () => {
    const boundary = '----CcvHubUploadBoundary';
    const payload = Buffer.from([
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="pasted.png"',
      'Content-Type: image/png',
      '',
      'PNGDATA',
      `--${boundary}--`,
      '',
    ].join('\r\n'));
    const upstream = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => { chunks.push(chunk); });
      request.on('end', () => {
        const body = Buffer.concat(chunks);
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({
          url: request.url,
          contentType: request.headers['content-type'],
          contentLength: request.headers['content-length'],
          bodyHex: body.toString('hex'),
        }));
      });
    });
    const upstreamPort = await listen(upstream);
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    try {
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/instances/register',
        payload: {
          id: 'manual-bridge-upload',
          projectName: 'cc-viewer',
          projectPath: '/home/opc/projects/ccvs/cc-viewer',
          url: `http://127.0.0.1:${upstreamPort}?token=abc`,
          port: upstreamPort,
          pid: 4321,
          source: 'manual',
          startedAt: '2026-04-22T10:00:00.000Z',
        },
      });
      const viewerUrl = new URL(registerResponse.json().data.instance.url);
      const bridgeId = viewerUrl.pathname.split('/')[2]!;
      const bridgePath = buildBridgeBasePath(bridgeId);

      const response = await app.inject({
        method: 'POST',
        url: `${bridgePath}/api/upload?token=abc&token=abc`,
        headers: {
          host: viewerUrl.host,
          cookie: `ccv_viewer_session_${bridgeId}=abc`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        url: '/api/upload?token=abc',
        contentType: `multipart/form-data; boundary=${boundary}`,
        contentLength: String(payload.length),
        bodyHex: payload.toString('hex'),
      });
    } finally {
      await app.close();
      await close(upstream);
    }
  });

  it('bridges viewer websocket upgrades to the registered upstream with token', async () => {
    const upstream = createServer();
    upstream.on('upgrade', (request, socket) => {
      socket.write('HTTP/1.1 101 Switching Protocols\r\nupgrade: websocket\r\nconnection: Upgrade\r\n\r\n');
      socket.end(`upstream:${request.url}`);
    });
    const upstreamPort = await listen(upstream);
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    try {
      await app.listen({ port: 0, host: '127.0.0.1' });
      const address = app.server.address();
      const port = typeof address === 'object' && address ? address.port : 0;

      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/instances/register',
        payload: {
          id: 'manual-bridge-ws',
          projectName: 'cc-viewer',
          projectPath: '/home/opc/projects/ccvs/cc-viewer',
          url: `http://127.0.0.1:${upstreamPort}?token=abc`,
          port: upstreamPort,
          pid: 4321,
          source: 'manual',
          startedAt: '2026-04-22T10:00:00.000Z',
        },
      });
      const viewerUrl = new URL(registerResponse.json().data.instance.url);
      const bridgeId = viewerUrl.pathname.split('/')[2]!;
      const bridgePath = buildBridgeBasePath(bridgeId);

      const response = await readSocketUntil(port, [
        `GET ${bridgePath}/ws/terminal?session=1 HTTP/1.1`,
        `Host: ${viewerUrl.host}`,
        `Cookie: ccv_viewer_session_${bridgeId}=abc`,
        'Connection: Upgrade',
        'Upgrade: websocket',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n'), 'upstream:/ws/terminal?session=1&token=abc');

      expect(response).toContain('HTTP/1.1 101 Switching Protocols');
      expect(response).toContain('upstream:/ws/terminal?session=1&token=abc');
    } finally {
      await app.close();
      await close(upstream);
    }
  });

  it('bridges viewer websocket upgrades with the URL token', async () => {
    const upstream = createServer();
    upstream.on('upgrade', (request, socket) => {
      socket.write('HTTP/1.1 101 Switching Protocols\r\nupgrade: websocket\r\nconnection: Upgrade\r\n\r\n');
      socket.end(`upstream:${request.url}`);
    });
    const upstreamPort = await listen(upstream);
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    try {
      await app.listen({ port: 0, host: '127.0.0.1' });
      const address = app.server.address();
      const port = typeof address === 'object' && address ? address.port : 0;

      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/instances/register',
        payload: {
          id: 'manual-bridge-ws-url-token',
          projectName: 'cc-viewer',
          projectPath: '/home/opc/projects/ccvs/cc-viewer',
          url: `http://127.0.0.1:${upstreamPort}?token=abc`,
          port: upstreamPort,
          pid: 4321,
          source: 'manual',
          startedAt: '2026-04-22T10:00:00.000Z',
        },
      });
      const viewerUrl = new URL(registerResponse.json().data.instance.url);
      const bridgeId = viewerUrl.pathname.split('/')[2]!;
      const bridgePath = buildBridgeBasePath(bridgeId);

      const response = await readSocketUntil(port, [
        `GET ${bridgePath}/ws/terminal?session=1&token=abc HTTP/1.1`,
        `Host: ${viewerUrl.host}`,
        'Connection: Upgrade',
        'Upgrade: websocket',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n'), 'upstream:/ws/terminal?session=1&token=abc');

      expect(response).toContain('HTTP/1.1 101 Switching Protocols');
      expect(response).toContain('upstream:/ws/terminal?session=1&token=abc');
    } finally {
      await app.close();
      await close(upstream);
    }
  });

  it('requires authentication for viewer bridge websocket upgrades', async () => {
    const upstream = createServer();
    const upstreamPort = await listen(upstream);
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    try {
      await app.listen({ port: 0, host: '127.0.0.1' });
      const address = app.server.address();
      const port = typeof address === 'object' && address ? address.port : 0;

      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/instances/register',
        payload: {
          id: 'manual-bridge-ws-auth',
          projectName: 'cc-viewer',
          projectPath: '/home/opc/projects/ccvs/cc-viewer',
          url: `http://127.0.0.1:${upstreamPort}?token=abc`,
          port: upstreamPort,
          pid: 4321,
          source: 'manual',
          startedAt: '2026-04-22T10:00:00.000Z',
        },
      });
      const viewerUrl = new URL(registerResponse.json().data.instance.url);
      const bridgePath = viewerUrl.pathname.replace(/\/$/u, '');

      const response = await readSocketUntil(port, [
        `GET ${bridgePath}/ws/terminal?session=1 HTTP/1.1`,
        `Host: ${viewerUrl.host}`,
        'Connection: Upgrade',
        'Upgrade: websocket',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n'), '401 Unauthorized');

      expect(response).toContain('HTTP/1.1 401 Unauthorized');
    } finally {
      await app.close();
      await close(upstream);
    }
  });

  it('stops launcher instances through lifecycle action', async () => {
    const stop = vi.fn();
    const registry = new InstanceRegistry();
    registry.createRunning({
      id: 'launcher-stop',
      projectName: 'alpha',
      projectPath: '/tmp/alpha',
      url: 'http://127.0.0.1:4321',
      port: 4321,
      pid: 1001,
      source: 'launcher',
      startedAt: '2026-04-22T10:00:00.000Z',
      lastSeen: '2026-04-22T10:00:01.000Z',
      stop,
    });
    const app = buildServer({
      registry,
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/instances/launcher-stop/actions/stop',
      headers: await authHeaders(app),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, data: { action: 'stop', removed: true } });
    expect(stop).toHaveBeenCalledWith('SIGTERM');
    expect(registry.listRunning()).toHaveLength(0);
    expect(registry.get('launcher-stop')?.internalStatus).toBe('stopping');

    await app.close();
  });


  it('upgrades graceful stop to SIGKILL when the child does not exit', () => {
    vi.useFakeTimers();
    try {
      const child = new FakeChildProcess();
      const stop = createStopHandle(child as never);

      stop('SIGTERM');
      vi.advanceTimersByTime(3000);

      expect(child.kill).toHaveBeenNthCalledWith(1, 'SIGTERM');
      expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL');
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps stop handle failures to lifecycle errors', async () => {
    const registry = new InstanceRegistry();
    registry.createRunning({
      id: 'stop-throws',
      projectName: 'alpha',
      projectPath: '/tmp/alpha',
      url: 'http://127.0.0.1:4321',
      port: 4321,
      pid: 1001,
      source: 'launcher',
      startedAt: '2026-04-22T10:00:00.000Z',
      lastSeen: '2026-04-22T10:00:01.000Z',
      stop: vi.fn(() => {
        throw new Error('kill failed');
      }),
    });
    const app = buildServer({
      registry,
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/instances/stop-throws/actions/stop',
      headers: await authHeaders(app),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toEqual({
      code: 'LIFECYCLE_FAILED',
      message: 'Failed to control instance lifecycle',
    });
    expect(registry.get('stop-throws')?.internalStatus).toBe('running');

    await app.close();
  });

  it('force stops instances with SIGKILL', async () => {
    const stop = vi.fn();
    const registry = new InstanceRegistry();
    registry.createRunning({
      id: 'force-stop',
      projectName: 'alpha',
      projectPath: '/tmp/alpha',
      url: 'http://127.0.0.1:4321',
      port: 4321,
      pid: 1001,
      source: 'launcher',
      startedAt: '2026-04-22T10:00:00.000Z',
      lastSeen: '2026-04-22T10:00:01.000Z',
      stop,
    });
    const app = buildServer({
      registry,
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/instances/force-stop/actions/force-stop',
      headers: await authHeaders(app),
    });

    expect(response.statusCode).toBe(200);
    expect(stop).toHaveBeenCalledWith('SIGKILL');

    await app.close();
  });

  it('rejects lifecycle stop for instances without a trusted stop handle', async () => {
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    try {
      await app.inject({
        method: 'POST',
        url: '/api/instances/register',
        payload: {
          id: 'manual-stop',
          projectName: 'cc-viewer',
          projectPath: '/tmp',
          url: 'http://127.0.0.1:7008?token=abc',
          port: 7008,
          pid: 4321,
          source: 'manual',
          startedAt: '2026-04-22T10:00:00.000Z',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/instances/manual-stop/actions/stop',
        headers: await authHeaders(app),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toEqual({
        code: 'LIFECYCLE_FAILED',
        message: 'Instance cannot be stopped by ccv-hub',
      });
    } finally {
      await app.close();
    }
  });

  it('requires panel auth for hub control APIs without a panel session', async () => {
    const registry = new InstanceRegistry();
    registry.createRunning({
      id: 'bridge-owned',
      projectName: 'alpha',
      projectPath: '/tmp/alpha',
      url: 'https://ccv-hub.test/viewer/1234567890abcdef1234567890abcdef/?token=abc',
      upstreamUrl: 'http://127.0.0.1:4321?token=abc',
      bridgeId: '1234567890abcdef1234567890abcdef',
      port: 4321,
      pid: 1001,
      source: 'launcher',
      startedAt: '2026-04-22T10:00:00.000Z',
      lastSeen: '2026-04-22T10:00:01.000Z',
      stop: vi.fn(),
    });
    const app = buildServer({
      registry,
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/instances/bridge-owned/actions/stop',
      headers: { host: 'ccv-hub.test' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
    expect(registry.get('bridge-owned')?.internalStatus).toBe('running');

    await app.close();
  });

  it('keeps launcher records isolated from manual register and unregister flows', async () => {
    const project = await mkdtemp(join(tmpdir(), 'ccv-hub-launcher-owned-'));
    const stop = vi.fn();
    const registry = new InstanceRegistry();
    registry.createRunning({
      id: 'launcher-owned',
      projectName: 'alpha',
      projectPath: project,
      url: 'http://127.0.0.1:4321',
      port: 4321,
      pid: 1001,
      source: 'launcher',
      startedAt: '2026-04-22T10:00:00.000Z',
      lastSeen: '2026-04-22T10:00:01.000Z',
      stop,
    });
    const app = buildServer({
      registry,
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    try {
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/instances/register',
        payload: {
          id: 'logger-shadow',
          projectName: 'alpha',
          projectPath: project,
          url: 'http://127.0.0.1:7008?token=abc',
          port: 7008,
          pid: 4321,
          source: 'logger',
          startedAt: '2026-04-22T11:00:00.000Z',
        },
      });
      const unregisterResponse = await app.inject({
        method: 'POST',
        url: '/api/instances/unregister',
        payload: { projectPath: project, port: 4321 },
      });

      expect(registerResponse.statusCode).toBe(200);
      expect(registerResponse.json().data.instance.id).toBe('launcher-owned');
      expect(registerResponse.json().data.instance.port).toBe(4321);
      expect(registry.get('launcher-owned')?.instance.source).toBe('launcher');
      expect(registry.get('launcher-owned')?.stop).toBe(stop);
      expect(unregisterResponse.statusCode).toBe(200);
      expect(unregisterResponse.json()).toEqual({ ok: true, data: { removed: false } });
      expect(registry.get('launcher-owned')?.internalStatus).toBe('running');
    } finally {
      await app.close();
      await rm(project, { recursive: true, force: true });
    }
  });

  it('blocks same-path launches while the previous process is stopping', async () => {
    const stop = vi.fn();
    const registry = new InstanceRegistry();
    registry.createRunning({
      id: 'stopping-one',
      projectName: 'tmp',
      projectPath: '/tmp',
      url: 'http://127.0.0.1:4321',
      port: 4321,
      pid: 1001,
      source: 'launcher',
      startedAt: '2026-04-22T10:00:00.000Z',
      lastSeen: '2026-04-22T10:00:01.000Z',
      stop,
    });
    registry.stop('stopping-one', 'stop');
    const launch = vi.fn();
    const app = buildServer({
      registry,
      launcher: { launch },
      auth: authConfig,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/instances',
      headers: await authHeaders(app),
      payload: { projectPath: '/tmp' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('LIFECYCLE_PENDING');
    expect(launch).not.toHaveBeenCalled();

    await app.close();
  });

  it('normalizes external launcher source claims to manual', async () => {
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    const registerResponse = await app.inject({
      method: 'POST',
      url: '/api/instances/register',
      payload: {
        id: 'external-launcher-claim',
        projectName: 'cc-viewer',
        projectPath: '/home/opc/projects/ccvs/cc-viewer',
        url: 'http://10.0.0.212:7010?token=abc',
        port: 7010,
        pid: 4323,
        source: 'launcher',
        startedAt: '2026-04-22T10:00:00.000Z',
      },
    });
    const unregisterResponse = await app.inject({
      method: 'POST',
      url: '/api/instances/unregister',
      payload: { port: 7010, projectPath: '/home/opc/projects/ccvs/cc-viewer', source: 'launcher' },
    });

    expect(registerResponse.statusCode).toBe(200);
    expect(registerResponse.json().data.instance.source).toBe('manual');
    expect(unregisterResponse.statusCode).toBe(200);
    expect(unregisterResponse.json()).toEqual({ ok: true, data: { removed: true } });

    await app.close();
  });

  it('registers logger instances and removes them by source on unregister', async () => {
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    const registerResponse = await app.inject({
      method: 'POST',
      url: '/api/instances/register',
      payload: {
        id: 'logger-7009',
        projectName: 'cc-viewer',
        projectPath: '/home/opc/projects/ccvs/cc-viewer',
        url: 'http://10.0.0.212:7009?token=abc',
        port: 7009,
        pid: 4322,
        source: 'logger',
        startedAt: '2026-04-22T10:00:00.000Z',
      },
    });
    const wrongSourceUnregisterResponse = await app.inject({
      method: 'POST',
      url: '/api/instances/unregister',
      payload: { port: 7009, projectPath: '/home/opc/projects/ccvs/cc-viewer' },
    });
    const unregisterResponse = await app.inject({
      method: 'POST',
      url: '/api/instances/unregister',
      payload: { port: 7009, projectPath: '/home/opc/projects/ccvs/cc-viewer', source: 'logger' },
    });

    expect(registerResponse.statusCode).toBe(200);
    expect(registerResponse.json().data.instance.source).toBe('logger');
    expect(wrongSourceUnregisterResponse.statusCode).toBe(200);
    expect(wrongSourceUnregisterResponse.json()).toEqual({ ok: true, data: { removed: false } });
    expect(unregisterResponse.statusCode).toBe(200);
    expect(unregisterResponse.json()).toEqual({ ok: true, data: { removed: true } });

    await app.close();
  });

  it('installs the hub plugin into the cc-viewer user plugin directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ccv-hub-plugin-install-'));
    const source = join(root, 'ccv-hub-plugin.mjs');
    await writeFile(source, '/** [CCV_HUB_MANAGED_PLUGIN] */\nexport default { name: "ccv-hub" };\n');

    try {
      const result = await installHubPlugin({ sourcePath: source, claudeConfigDir: root, logDir: '', allowSourceOverride: true });
      const target = join(root, 'cc-viewer', 'plugins', 'ccv-hub-plugin.mjs');

      expect(result).toEqual({ targetPath: target, installed: true, reason: 'created' });
      await expect(readFile(target, 'utf8')).resolves.toBe('/** [CCV_HUB_MANAGED_PLUGIN] */\nexport default { name: "ccv-hub" };\n');
      await expect(installHubPlugin({ sourcePath: source, claudeConfigDir: root, logDir: '', allowSourceOverride: true })).resolves.toEqual({
        targetPath: target,
        installed: false,
        reason: 'current',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects symlink plugin targets during install', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ccv-hub-plugin-symlink-'));
    const source = join(root, 'source.mjs');
    const outside = join(root, 'outside.mjs');
    const targetDir = join(root, 'cc-viewer', 'plugins');
    const target = join(targetDir, 'ccv-hub-plugin.mjs');
    await mkdir(targetDir, { recursive: true });
    await writeFile(source, '/** [CCV_HUB_MANAGED_PLUGIN] */\nexport default {};\n');
    await writeFile(outside, '/** [CCV_HUB_MANAGED_PLUGIN] */\nexport default { name: "outside" };\n');
    await symlink(outside, target);

    try {
      await expect(installHubPlugin({ sourcePath: source, claudeConfigDir: root, logDir: '', allowSourceOverride: true })).rejects.toThrow('Expected regular file');
      await expect(readFile(outside, 'utf8')).resolves.toBe('/** [CCV_HUB_MANAGED_PLUGIN] */\nexport default { name: "outside" };\n');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps custom same-name hub plugin files untouched', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ccv-hub-plugin-custom-'));
    const source = join(root, 'source.mjs');
    const target = join(root, 'cc-viewer', 'plugins', 'ccv-hub-plugin.mjs');
    await mkdir(join(root, 'cc-viewer', 'plugins'), { recursive: true });
    await writeFile(source, '/** [CCV_HUB_MANAGED_PLUGIN] */\nexport default {};\n');
    await writeFile(target, 'export default { name: "custom" };\n');

    try {
      const result = await installHubPlugin({ sourcePath: source, claudeConfigDir: root, logDir: '', allowSourceOverride: true });

      expect(result).toEqual({ targetPath: target, installed: false, reason: 'custom' });
      await expect(readFile(target, 'utf8')).resolves.toBe('export default { name: "custom" };\n');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('registers external instances and removes them on unregister', async () => {
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    const registerResponse = await app.inject({
      method: 'POST',
      url: '/api/instances/register',
      payload: {
        id: 'manual-7008',
        projectName: 'cc-viewer',
        projectPath: '/home/opc/projects/ccvs/cc-viewer',
        url: 'http://10.0.0.212:7008?token=abc',
        port: 7008,
        pid: 4321,
        source: 'manual',
        startedAt: '2026-04-22T10:00:00.000Z',
      },
    });

    expect(registerResponse.statusCode).toBe(200);
    const registeredInstance = registerResponse.json().data.instance;
    expect(registeredInstance).toMatchObject({
      id: 'manual-7008',
      source: 'manual',
    });
    expect(registeredInstance.url).toMatch(/^https:\/\/ccv-hub\.test\/viewer\/[a-f0-9]{32}\/\?token=abc$/u);

    const unregisterResponse = await app.inject({
      method: 'POST',
      url: '/api/instances/unregister',
      payload: { port: 7008, projectPath: '/home/opc/projects/ccvs/cc-viewer' },
    });

    expect(unregisterResponse.statusCode).toBe(200);
    expect(unregisterResponse.json()).toEqual({ ok: true, data: { removed: true } });

    const listResponse = await app.inject({ method: 'GET', url: '/api/instances', headers: await authHeaders(app) });
    expect(listResponse.json().data.instances).toHaveLength(0);

    await app.close();
  });

  it('lists allowed host directories and filters hidden entries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ccv-hub-paths-'));
    await mkdir(join(root, 'visible-project'));
    await mkdir(join(root, '.ssh'));
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
      pathBrowser: new HostPathBrowser([root]),
    });

    try {
      const headers = await authHeaders(app);
      const rootsResponse = await app.inject({ method: 'GET', url: '/api/host-paths/roots', headers });
      const listResponse = await app.inject({ method: 'GET', url: `/api/host-paths/list?path=${encodeURIComponent(root)}`, headers });

      expect(rootsResponse.statusCode).toBe(200);
      expect(rootsResponse.json().data.roots).toEqual([{ name: root.split('/').at(-1), path: root, readable: true }]);
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().data.entries.map((entry: { name: string }) => entry.name)).toEqual(['visible-project']);
    } finally {
      await app.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects host path browsing outside allowed roots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ccv-hub-paths-'));
    const outside = await mkdtemp(join(tmpdir(), 'ccv-hub-outside-'));
    await symlink(outside, join(root, 'outside-link'));
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
      pathBrowser: new HostPathBrowser([root]),
    });

    try {
      const headers = await authHeaders(app);
      const outsideResponse = await app.inject({ method: 'GET', url: `/api/host-paths/list?path=${encodeURIComponent(outside)}`, headers });
      const rootResponse = await app.inject({ method: 'GET', url: `/api/host-paths/list?path=${encodeURIComponent(root)}`, headers });

      expect(outsideResponse.statusCode).toBe(400);
      expect(outsideResponse.json().error.code).toBe('INVALID_PATH');
      expect(rootResponse.json().data.entries).toHaveLength(0);
    } finally {
      await app.close();
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('rejects relative project paths', async () => {
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/instances',
      headers: await authHeaders(app),
      payload: { projectPath: 'relative/path' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      ok: false,
      error: {
        code: 'INVALID_PATH',
        message: 'Project path is invalid',
      },
    });

    await app.close();
  });

  it('returns the existing instance when the same project path is launched twice', async () => {
    const launch = vi.fn().mockResolvedValue({
      projectName: 'tmp',
      url: 'http://127.0.0.1:4321',
      port: 4321,
      pid: 321,
      stop: vi.fn(),
      onExit: vi.fn(),
    });
    const app = buildServer({
      auth: authConfig,
      launcher: { launch },
    });

    const headers = await authHeaders(app);
    const firstResponse = await app.inject({
      method: 'POST',
      url: '/api/instances',
      headers,
      payload: { projectPath: '/tmp' },
    });
    const secondResponse = await app.inject({
      method: 'POST',
      url: '/api/instances',
      headers,
      payload: { projectPath: '/tmp' },
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(secondResponse.json().data.instance.id).toBe(firstResponse.json().data.instance.id);

    await app.close();
  });

  it('reserves the project path while a launch is starting', async () => {
    let resolveLaunch: (value: {
      projectName: string;
      url: string;
      port: number;
      pid: number;
      stop: () => void;
      onExit: (listener: () => void) => void;
    }) => void;
    const launch = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveLaunch = resolve;
    }));
    const app = buildServer({
      auth: authConfig,
      launcher: { launch },
    });

    const headers = await authHeaders(app);
    const first = app.inject({
      method: 'POST',
      url: '/api/instances',
      headers,
      payload: { projectPath: '/tmp' },
    });
    const second = app.inject({
      method: 'POST',
      url: '/api/instances',
      headers,
      payload: { projectPath: '/tmp' },
    });

    await vi.waitFor(() => expect(launch).toHaveBeenCalledTimes(1));

    resolveLaunch!({
      projectName: 'tmp',
      url: 'http://127.0.0.1:4321',
      port: 4321,
      pid: 321,
      stop: vi.fn(),
      onExit: vi.fn(),
    });
    const [firstResponse, secondResponse] = await Promise.all([first, second]);

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.json().data.instance.id).toBe(firstResponse.json().data.instance.id);
    await app.close();
  });

  it('keeps one registered instance per real project path and preserves bridge id', async () => {
    const project = await mkdtemp(join(tmpdir(), 'ccv-hub-project-'));
    const link = `${project}-link`;
    const upstream = createServer((_, response) => response.end('ok'));
    const firstPort = await listen(upstream);
    await symlink(project, link);
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    try {
      const firstResponse = await app.inject({
        method: 'POST',
        url: '/api/instances/register',
        payload: {
          id: 'manual-first',
          projectName: 'project',
          projectPath: project,
          url: `http://127.0.0.1:${firstPort}?token=abc`,
          port: firstPort,
          pid: 4321,
          source: 'manual',
          startedAt: '2026-04-22T10:00:00.000Z',
        },
      });
      const secondResponse = await app.inject({
        method: 'POST',
        url: '/api/instances/register',
        payload: {
          id: 'manual-second',
          projectName: 'project',
          projectPath: link,
          url: `http://127.0.0.1:${firstPort}?token=def`,
          port: firstPort,
          pid: 4322,
          source: 'manual',
          startedAt: '2026-04-22T11:00:00.000Z',
        },
      });
      const listResponse = await app.inject({ method: 'GET', url: '/api/instances', headers: await authHeaders(app) });

      expect(firstResponse.statusCode).toBe(200);
      expect(secondResponse.statusCode).toBe(200);
      expect(secondResponse.json().data.instance.id).toBe('manual-first');
      expect(new URL(secondResponse.json().data.instance.url).pathname).toBe(new URL(firstResponse.json().data.instance.url).pathname);
      expect(secondResponse.json().data.instance.port).toBe(firstPort);
      expect(listResponse.json().data.instances).toHaveLength(1);
    } finally {
      await app.close();
      await close(upstream);
      await rm(link, { force: true });
      await rm(project, { recursive: true, force: true });
    }
  });

  it('passes launch options to the launcher', async () => {
    const launch = vi.fn().mockResolvedValue({
      projectName: 'cc-viewer',
      url: 'http://127.0.0.1:4321',
      port: 4321,
      pid: 321,
      stop: vi.fn(),
      onExit: vi.fn(),
    });
    const app = buildServer({
      auth: authConfig,
      launcher: { launch },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/instances',
      headers: await authHeaders(app),
      payload: {
        projectPath: '/tmp',
        options: {
          mode: 'continue',
          prompt: 'hello',
          model: 'claude-sonnet-4-6',
          dangerouslySkipPermissions: true,
          allowDangerouslySkipPermissions: true,
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(launch).toHaveBeenCalledWith('/tmp', {
      mode: 'continue',
      prompt: 'hello',
      model: 'claude-sonnet-4-6',
      dangerouslySkipPermissions: true,
      allowDangerouslySkipPermissions: true,
    });

    await app.close();
  });

  it('creates instance after successful launch and removes it on exit', async () => {
    const listeners: Array<() => void> = [];
    const app = buildServer({
      auth: authConfig,
      launcher: {
        launch: vi.fn().mockResolvedValue({
          projectName: 'cc-viewer',
          url: 'http://127.0.0.1:4321',
          port: 4321,
          pid: 321,
          stop: vi.fn(),
          onExit: (listener: () => void) => {
            listeners.push(listener);
          },
        }),
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/instances',
      headers: await authHeaders(app),
      payload: { projectPath: '/tmp' },
    });

    expect(response.statusCode).toBe(200);
    const created = response.json();
    expect(created.ok).toBe(true);
    expect(created.data.instance.port).toBe(4321);

    listeners[0]?.();

    const listResponse = await app.inject({ method: 'GET', url: '/api/instances', headers: await authHeaders(app) });
    const listJson = listResponse.json();
    expect(listJson.data.instances).toHaveLength(0);

    await app.close();
  });

  it('builds launch argv from cc-viewer options', () => {
    expect(buildLaunchArgs('/opt/ccv/cli.js', {
      mode: 'resume',
      prompt: 'inspect this project',
      model: 'claude-opus-4-7',
      dangerouslySkipPermissions: true,
      allowDangerouslySkipPermissions: true,
    })).toEqual([
      '/opt/ccv/cli.js',
      '--no-open',
      '-r',
      '-p',
      'inspect this project',
      '--model',
      'claude-opus-4-7',
      '--d',
      '--ad',
    ]);
  });

  it('builds launch env from the host process environment', () => {
    const originalPath = process.env.PATH;
    const originalHome = process.env.HOME;
    const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;

    process.env.PATH = '/custom/bin:/usr/bin';
    process.env.HOME = '/home/opc';
    delete process.env.CLAUDE_CONFIG_DIR;

    try {
      const env = buildLaunchEnv();

      expect(env.HOME).toBe('/home/opc');
      expect(env.CLAUDE_CONFIG_DIR).toBe('/home/opc/.claude');
      expect(env.PATH).toBe('/custom/bin:/usr/bin');
      expect(env.CCV_HUB_PLUGIN_DISABLED).toBe('1');
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      if (originalClaudeConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
    }
  });
});
