import { describe, expect, it, vi } from 'vitest';
import { buildServer } from '../src/server.js';
import { InstanceRegistry } from '../src/domain/instance-registry.js';

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
    const registry = new InstanceRegistry();
    registry.createStarting({
      id: 'old',
      projectName: 'alpha',
      projectPath: '/tmp/alpha',
      url: 'http://127.0.0.1:4001',
      port: 4001,
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
      url: 'http://127.0.0.1:4002',
      port: 4002,
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

    const response = await app.inject({ method: 'GET', url: '/api/instances' });
    const json = response.json();

    expect(response.statusCode).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.instances.map((instance: { id: string }) => instance.id)).toEqual(['new', 'old']);

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
});
