/**
 * [INPUT]: 依赖 FastifyInstance 路由能力、路径校验、bridge URL 生成、实例注册表与统一入口启动器
 * [OUTPUT]: 对外提供 registerCreateInstanceRoute，用于挂载 /api/instances POST
 * [POS]: hub-service 的实例创建面，负责启动成功后登记并回传公开实例
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { CreateInstanceRequest, CreateInstanceResponse } from '@ccv-hub/shared-contracts';
import { assertProjectPath } from '../domain/path-validator.js';
import { createAppError, toFailureResponse } from '../domain/error-mapper.js';
import { buildBridgeUrl, createBridgeIdentity } from '../domain/bridge-url.js';
import type { InstanceRegistry } from '../domain/instance-registry.js';
import type { ViewerLauncher } from '../launcher/ccv-launcher.js';

export function registerCreateInstanceRoute(app: FastifyInstance, registry: InstanceRegistry, launcher: ViewerLauncher): void {
  app.post<{ Body: CreateInstanceRequest }>('/api/instances', async (request, reply): Promise<CreateInstanceResponse> => {
    let instanceId: string | undefined;

    try {
      const projectPath = assertProjectPath(request.body.projectPath);
      const launchResult = await launcher.launch(projectPath);
      const now = new Date().toISOString();
      instanceId = randomUUID();

      const bridgeIdentity = createBridgeIdentity();
      registry.createStarting({
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
      registry.markRunning(instanceId, now);

      launchResult.onExit(() => {
        registry.markExited(instanceId!, new Date().toISOString());
        registry.markRemoved(instanceId!);
      });

      const record = registry.get(instanceId);
      if (!record) {
        throw createAppError('REGISTER_FAILED');
      }

      return {
        ok: true,
        data: {
          instance: record.instance,
        },
      };
    } catch (error) {
      if (instanceId) {
        registry.discard(instanceId);
      }
      const failure = toFailureResponse(error, 'START_FAILED');
      const statusCode = failure.error.code === 'INVALID_PATH' ? 400 : 500;
      reply.code(statusCode);
      return failure;
    }
  });
}
