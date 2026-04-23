/**
 * [INPUT]: 依赖 FastifyInstance 的路由注册能力与 shared-contracts 的健康响应类型
 * [OUTPUT]: 对外提供 registerHealthRoute，用于挂载 /api/health
 * [POS]: hub-service 的最小健康探针，为前端与测试提供可达性确认
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@ccv-hub/shared-contracts';

export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/api/health', async (): Promise<HealthResponse> => ({
    ok: true,
    data: {
      status: 'ok',
    },
  }));
}
