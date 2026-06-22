/**
 * [INPUT]: 依赖 FastifyInstance 路由能力、路径校验、启动参数契约、bridge URL 生成、实例注册表与统一入口启动器
 * [OUTPUT]: 对外提供 registerCreateInstanceRoute，用于挂载 /api/instances POST
 * [POS]: hub-service 的实例创建面，负责启动成功后登记、生成稳定 path viewer URL 并回传公开实例
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { createInstanceRequestSchema, type CreateInstanceRequest, type CreateInstanceResponse } from '@ccv-hub/shared-contracts';
import { assertProjectPath } from '../domain/path-validator.js';
import { createAppError, toFailureResponse } from '../domain/error-mapper.js';
import { buildBridgeUrl, createBridgeIdentity } from '../domain/bridge-url.js';
import type { InstanceRegistry } from '../domain/instance-registry.js';
import type { ViewerLauncher } from '../launcher/ccv-launcher.js';

export function registerCreateInstanceRoute(app: FastifyInstance, registry: InstanceRegistry, launcher: ViewerLauncher): void {
  const pendingLaunches = new Map<string, Promise<CreateInstanceResponse>>();

  app.post<{ Body: CreateInstanceRequest }>('/api/instances', async (request, reply): Promise<CreateInstanceResponse> => {
    try {
      const body = createInstanceRequestSchema.parse(request.body);
      const projectPath = assertProjectPath(body.projectPath);
      const existing = registry.findActiveByProjectPath(projectPath);
      if (existing?.internalStatus === 'running') {
        return {
          ok: true,
          data: {
            instance: existing.instance,
          },
        };
      }
      if (existing?.internalStatus === 'stopping') {
        throw createAppError('LIFECYCLE_PENDING');
      }

      const pendingLaunch = pendingLaunches.get(projectPath);
      if (pendingLaunch) {
        return await pendingLaunch;
      }

      const launchPromise = createInstance(projectPath, body.options);
      pendingLaunches.set(projectPath, launchPromise);
      return await launchPromise.finally(() => pendingLaunches.delete(projectPath));
    } catch (error) {
      const failure = toFailureResponse(error, 'START_FAILED');
      const statusCode = failure.error.code === 'INVALID_PATH' || failure.error.code === 'LIFECYCLE_PENDING' ? 400 : 500;
      reply.code(statusCode);
      return failure;
    }
  });

  async function createInstance(projectPath: string, options: CreateInstanceRequest['options']): Promise<CreateInstanceResponse> {
    const launchResult = await launcher.launch(projectPath, options);
    const existing = registry.findActiveByProjectPath(projectPath);
    if (existing) {
      launchResult.stop();
      if (existing.internalStatus === 'stopping') {
        throw createAppError('LIFECYCLE_PENDING');
      }
      return {
        ok: true,
        data: {
          instance: existing.instance,
        },
      };
    }

    const now = new Date().toISOString();
    const instanceId = randomUUID();
    const bridgeIdentity = createBridgeIdentity();
    const record = registry.createRunning({
      id: instanceId,
      projectName: launchResult.projectName,
      projectPath,
      url: buildBridgeUrl(bridgeIdentity.id, launchResult.url),
      upstreamUrl: launchResult.url,
      bridgeId: bridgeIdentity.id,
      port: launchResult.port,
      pid: launchResult.pid,
      source: 'launcher',
      startedAt: now,
      lastSeen: now,
      stop: launchResult.stop,
    });

    launchResult.onExit(() => {
      registry.markExited(instanceId, new Date().toISOString());
      registry.markRemoved(instanceId);
    });

    const registered = registry.get(instanceId);
    if (!registered) {
      throw createAppError('REGISTER_FAILED');
    }

    return {
      ok: true,
      data: {
        instance: record.instance,
      },
    };
  }
}
