/**
 * [INPUT]: 依赖 FastifyInstance 路由能力、共享注销契约、实例注册表与错误归一
 * [OUTPUT]: 对外提供 registerUnregisterInstanceRoute，用于挂载 /api/instances/unregister POST
 * [POS]: hub-service 的外部实例注销面，负责接收 cc-viewer 插件上报的手动停止事件
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { FastifyInstance } from 'fastify';
import { unregisterInstanceRequestSchema, type UnregisterInstanceRequest, type UnregisterInstanceResponse } from '@ccv-hub/shared-contracts';
import { toFailureResponse } from '../domain/error-mapper.js';
import type { InstanceRegistry } from '../domain/instance-registry.js';

export function registerUnregisterInstanceRoute(app: FastifyInstance, registry: InstanceRegistry): void {
  app.post<{ Body: UnregisterInstanceRequest }>('/api/instances/unregister', async (request, reply): Promise<UnregisterInstanceResponse> => {
    try {
      const payload = unregisterInstanceRequestSchema.parse(request.body);
      return {
        ok: true,
        data: {
          removed: registry.removeMatching(payload),
        },
      };
    } catch (error) {
      reply.code(400);
      return toFailureResponse(error, 'UNREGISTER_FAILED');
    }
  });
}
