/**
 * [INPUT]: 依赖 FastifyInstance 路由能力、InstanceRegistry 存活清理、列表读取与错误归一
 * [OUTPUT]: 对外提供 registerListInstancesRoute，用于挂载 /api/instances GET
 * [POS]: hub-service 的实例查询面，负责先清理死亡实例，再向页面暴露 running 且已排序的公共列表
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { FastifyInstance } from 'fastify';
import type { ListInstancesResponse } from '@ccv-hub/shared-contracts';
import { toFailureResponse } from '../domain/error-mapper.js';
import type { InstanceRegistry } from '../domain/instance-registry.js';

export function registerListInstancesRoute(app: FastifyInstance, registry: InstanceRegistry): void {
  app.get('/api/instances', async (_, reply): Promise<ListInstancesResponse> => {
    try {
      await registry.removeDeadRunningInstances();
      return {
        ok: true,
        data: {
          instances: registry.listRunning(),
        },
      };
    } catch (error) {
      reply.code(500);
      return toFailureResponse(error, 'LIST_FAILED');
    }
  });
}
