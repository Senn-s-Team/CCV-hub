/**
 * [INPUT]: 依赖 FastifyInstance 路由能力、共享注册契约、实例注册表与错误归一
 * [OUTPUT]: 对外提供 registerExternalInstanceRoute，用于挂载 /api/instances/register POST
 * [POS]: hub-service 的外部实例登记面，负责接收 cc-viewer 插件上报的手动启动实例
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { registerInstanceRequestSchema, type RegisterInstanceRequest, type RegisterInstanceResponse } from '@ccv-hub/shared-contracts';
import { toFailureResponse } from '../domain/error-mapper.js';
import type { InstanceRegistry } from '../domain/instance-registry.js';

export function registerExternalInstanceRoute(app: FastifyInstance, registry: InstanceRegistry): void {
  app.post<{ Body: RegisterInstanceRequest }>('/api/instances/register', async (request, reply): Promise<RegisterInstanceResponse> => {
    try {
      const payload = registerInstanceRequestSchema.parse(request.body);
      const now = new Date().toISOString();
      const record = registry.createRunning({
        id: payload.id ?? randomUUID(),
        projectName: payload.projectName,
        projectPath: payload.projectPath,
        url: payload.url,
        port: payload.port,
        pid: payload.pid,
        source: payload.source,
        startedAt: payload.startedAt ?? now,
        lastSeen: now,
      });

      return {
        ok: true,
        data: {
          instance: record.instance,
        },
      };
    } catch (error) {
      const failure = toFailureResponse(error, 'REGISTER_FAILED');
      if (failure.error.code === 'REGISTER_FAILED') {
        reply.code(400);
      }
      return failure;
    }
  });
}
