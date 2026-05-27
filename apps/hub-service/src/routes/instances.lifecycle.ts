/**
 * [INPUT]: 依赖 FastifyInstance 路由能力、共享生命周期契约、实例注册表与错误归一
 * [OUTPUT]: 对外提供 registerInstanceLifecycleRoute，用于挂载 /api/instances/:id/actions/:action POST
 * [POS]: hub-service 的实例生命周期控制面，负责停止 hub 启动并持有停止句柄的运行中实例
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { FastifyInstance } from 'fastify';
import { lifecycleActionSchema, type LifecycleAction, type LifecycleInstanceResponse } from '@ccv-hub/shared-contracts';
import { createAppError, toFailureResponse } from '../domain/error-mapper.js';
import type { InstanceRegistry } from '../domain/instance-registry.js';

function stopInstance(registry: InstanceRegistry, id: string, action: LifecycleAction): LifecycleInstanceResponse {
  const record = registry.get(id);
  if (!record || record.internalStatus !== 'running') {
    throw createAppError('LIFECYCLE_FAILED', 'Instance is not running');
  }
  if (!record.stop) {
    throw createAppError('LIFECYCLE_FAILED', 'Instance cannot be stopped by ccv-hub');
  }

  if (!registry.stop(id, action)) {
    throw createAppError('LIFECYCLE_FAILED');
  }

  return {
    ok: true,
    data: {
      action,
      removed: true,
    },
  };
}

export function registerInstanceLifecycleRoute(app: FastifyInstance, registry: InstanceRegistry): void {
  app.post<{ Params: { id: string; action: string } }>('/api/instances/:id/actions/:action', async (request, reply): Promise<LifecycleInstanceResponse> => {
    try {
      const action = lifecycleActionSchema.parse(request.params.action);
      return stopInstance(registry, request.params.id, action);
    } catch (error) {
      const failure = toFailureResponse(error, 'LIFECYCLE_FAILED');
      reply.code(400);
      return failure;
    }
  });
}
