/**
 * [INPUT]: 依赖 vitest、node:http、hub-service 服务装配与 launcher 环境构造函数
 * [OUTPUT]: 对外提供 hub-service 路由、启动 URL、外部注册、存活清理与启动环境回归测试
 * [POS]: hub-service 的测试入口，负责验证健康接口、实例列表、创建/注册流程、URL 投影与启动环境收敛
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { buildServer } from '../src/server.js';
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

describe('hub-service routes', () => {
  it('returns health response', async () => {
    const app = buildServer({
      launcher: { launch: vi.fn() },
    });

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      data: { status: 'ok' },
    });

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
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/api/instances' });
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
    });

    const response = await app.inject({ method: 'GET', url: '/api/instances' });

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
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/api/instances' });

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

  it('registers external instances and removes them on unregister', async () => {
    const app = buildServer({
      launcher: { launch: vi.fn() },
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
    expect(registerResponse.json().data.instance).toMatchObject({
      id: 'manual-7008',
      url: 'http://10.0.0.212:7008?token=abc',
      source: 'manual',
    });

    const unregisterResponse = await app.inject({
      method: 'POST',
      url: '/api/instances/unregister',
      payload: { port: 7008, projectPath: '/home/opc/projects/ccvs/cc-viewer' },
    });

    expect(unregisterResponse.statusCode).toBe(200);
    expect(unregisterResponse.json()).toEqual({ ok: true, data: { removed: true } });

    const listResponse = await app.inject({ method: 'GET', url: '/api/instances' });
    expect(listResponse.json().data.instances).toHaveLength(0);

    await app.close();
  });

  it('rejects relative project paths', async () => {
    const app = buildServer({
      launcher: { launch: vi.fn() },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/instances',
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
      payload: { projectPath: '/tmp' },
    });

    expect(response.statusCode).toBe(200);
    const created = response.json();
    expect(created.ok).toBe(true);
    expect(created.data.instance.port).toBe(4321);

    listeners[0]?.();

    const listResponse = await app.inject({ method: 'GET', url: '/api/instances' });
    const listJson = listResponse.json();
    expect(listJson.data.instances).toHaveLength(0);

    await app.close();
  });

  it('builds launch env with host Claude paths', () => {
    const originalPath = process.env.PATH;
    const originalHome = process.env.HOME;
    const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;

    process.env.PATH = '/usr/bin';
    process.env.HOME = '/root';
    delete process.env.CLAUDE_CONFIG_DIR;

    try {
      const env = buildLaunchEnv();

      expect(env.HOME).toBe('/home/opc');
      expect(env.CLAUDE_CONFIG_DIR).toBe('/home/opc/.claude');
      expect(env.PATH).toContain('/home/linuxbrew/.linuxbrew/bin');
      expect(env.PATH).toContain('/home/opc/.local/bin');
      expect(env.PATH).toContain('/home/opc/.bun/bin');
      expect(env.PATH).toContain('/usr/bin');
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
