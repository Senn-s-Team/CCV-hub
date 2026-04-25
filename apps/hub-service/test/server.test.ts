/**
 * [INPUT]: 依赖 vitest、node:http、node:net、hub-service 服务装配与 launcher 环境构造函数
 * [OUTPUT]: 对外提供 hub-service 路由、启动 URL、外部注册、viewer bridge、存活清理与启动环境回归测试
 * [POS]: hub-service 的测试入口，负责验证健康接口、实例列表、创建/注册流程、URL 投影、HTTP/WebSocket 桥接与启动环境收敛
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { buildServer } from '../src/server.js';
import type { AuthConfig } from '../src/domain/auth-session.js';
import { InstanceRegistry } from '../src/domain/instance-registry.js';
import { buildLaunchEnv, parseViewerUrl, resolveViewerUrl } from '../src/launcher/ccv-launcher.js';

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

const authConfig: AuthConfig = {
  password: 'secret',
  sessionSecret: 'test-session-secret',
  cookieName: 'ccv_hub_session',
  cookieSecure: false,
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

  it('protects hub host api even when hub host starts with the viewer prefix', async () => {
    const app = buildServer({
      launcher: { launch: vi.fn() },
      auth: authConfig,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/instances',
      headers: { host: 'ccv-hub-dev.paas.996667.xyz' },
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

  it('bridges viewer subdomain requests to the registered upstream with token', async () => {
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
      const bridgeHost = new URL(registerResponse.json().data.instance.url).host;

      const response = await app.inject({
        method: 'GET',
        url: '/api/events?cursor=1&token=evil',
        headers: { host: bridgeHost },
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
      const bridgeHost = new URL(registerResponse.json().data.instance.url).host;

      const response = await app.inject({
        method: 'POST',
        url: '/api/resume-choice?token=abc&token=abc',
        headers: { host: bridgeHost },
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
      const bridgeHost = new URL(registerResponse.json().data.instance.url).host;

      const response = await readSocketUntil(port, [
        'GET /ws/terminal?session=1 HTTP/1.1',
        `Host: ${bridgeHost}`,
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
    expect(registeredInstance.url).toMatch(/^https:\/\/ccv-[a-f0-9]{32}\.paas\.996667\.xyz\/\?token=abc$/u);

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
