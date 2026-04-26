import { describe, expect, it } from 'vitest';
import {
  apiFailureSchema,
  createInstanceRequestSchema,
  createInstanceResponseSchema,
  errorCodeSchema,
  healthResponseSchema,
  hostPathListResponseSchema,
  hostPathRootsResponseSchema,
  instanceSchema,
  lifecycleInstanceResponseSchema,
  listInstancesResponseSchema,
} from '../src/index.js';

describe('shared contracts', () => {
  it('parses instance payload from api docs', () => {
    const instance = instanceSchema.parse({
      id: 'ins_01HXYZ',
      projectName: 'my-project',
      projectPath: '/home/opc/projects/my-project',
      url: 'http://127.0.0.1:4321',
      port: 4321,
      pid: 12345,
      status: 'running',
      source: 'launcher',
      startedAt: '2026-04-22T10:00:00.000Z',
      lastSeen: '2026-04-22T10:00:05.000Z',
      canStop: true,
    });

    expect(instance.projectName).toBe('my-project');
  });

  it('parses health response', () => {
    const response = healthResponseSchema.parse({
      ok: true,
      data: { status: 'ok' },
    });

    expect(response.data.status).toBe('ok');
  });

  it('parses list instances response', () => {
    const response = listInstancesResponseSchema.parse({
      ok: true,
      data: {
        instances: [
          {
            id: 'ins_01HXYZ',
            projectName: 'my-project',
            projectPath: '/home/opc/projects/my-project',
            url: 'http://127.0.0.1:4321',
            port: 4321,
            pid: 12345,
            status: 'running',
            source: 'launcher',
            startedAt: '2026-04-22T10:00:00.000Z',
            lastSeen: '2026-04-22T10:00:05.000Z',
            canStop: true,
          },
        ],
      },
    });

    if (!response.ok) {
      throw new Error('expected success response');
    }

    expect(response.data.instances).toHaveLength(1);
  });

  it('parses host path browser responses', () => {
    const roots = hostPathRootsResponseSchema.parse({
      ok: true,
      data: {
        roots: [{ name: 'projects', path: '/home/opc/projects', readable: true }],
      },
    });
    const list = hostPathListResponseSchema.parse({
      ok: true,
      data: {
        currentPath: '/home/opc/projects',
        parentPath: null,
        entries: [{ name: 'ccvs', path: '/home/opc/projects/ccvs', readable: true }],
      },
    });

    if (!roots.ok || !list.ok) {
      throw new Error('expected success response');
    }

    expect(roots.data.roots[0]?.path).toBe('/home/opc/projects');
    expect(list.data.entries[0]?.name).toBe('ccvs');
  });

  it('parses create instance request and response', () => {
    const request = createInstanceRequestSchema.parse({
      projectPath: '/home/opc/projects/my-project',
    });

    expect(request.projectPath).toBe('/home/opc/projects/my-project');

    const response = createInstanceResponseSchema.parse({
      ok: true,
      data: {
        instance: {
          id: 'ins_01HXYZ',
          projectName: 'my-project',
          projectPath: '/home/opc/projects/my-project',
          url: 'http://127.0.0.1:4321',
          port: 4321,
          pid: 12345,
          status: 'running',
          source: 'launcher',
          startedAt: '2026-04-22T10:00:00.000Z',
          lastSeen: '2026-04-22T10:00:05.000Z',
      canStop: true,
        },
      },
    });

    if (!response.ok) {
      throw new Error('expected success response');
    }

    expect(response.data.instance.pid).toBe(12345);
  });

  it('parses lifecycle response', () => {
    const response = lifecycleInstanceResponseSchema.parse({
      ok: true,
      data: {
        action: 'stop',
        removed: true,
      },
    });

    if (!response.ok) {
      throw new Error('expected success response');
    }

    expect(response.data.action).toBe('stop');
  });

  it('parses failure response', () => {
    const failure = apiFailureSchema.parse({
      ok: false,
      error: {
        code: 'INVALID_PATH',
        message: 'Project path is invalid',
      },
    });

    expect(failure.error.code).toBe('INVALID_PATH');
    expect(errorCodeSchema.options).toContain('LIFECYCLE_FAILED');
    expect(errorCodeSchema.options).toContain('LIFECYCLE_PENDING');
  });
});
