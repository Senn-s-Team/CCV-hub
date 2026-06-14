/**
 * [INPUT]: 依赖 FastifyInstance 路由能力、共享注册契约、bridge URL 生成、实例注册表与错误归一
 * [OUTPUT]: 对外提供 registerExternalInstanceRoute，用于挂载 /api/instances/register POST
 * [POS]: hub-service 的外部实例登记面，负责接收带 token 的 cc-viewer 插件实例，并保持 launcher 实例的路径所有权
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { registerInstanceRequestSchema, type RegisterInstanceRequest, type RegisterInstanceResponse } from '@ccv-hub/shared-contracts';
import { buildBridgeUrl, createBridgeIdentity } from '../domain/bridge-url.js';
import { assertProjectPath } from '../domain/path-validator.js';
import { createAppError, toFailureResponse } from '../domain/error-mapper.js';
import type { InstanceRegistry } from '../domain/instance-registry.js';

export function registerExternalInstanceRoute(app: FastifyInstance, registry: InstanceRegistry): void {
  app.post<{ Body: RegisterInstanceRequest }>('/api/instances/register', async (request, reply): Promise<RegisterInstanceResponse> => {
    try {
      const payload = registerInstanceRequestSchema.parse(request.body);
      if (!new URL(payload.url).searchParams.has('token')) {
        throw createAppError('REGISTER_FAILED', 'Instance URL token is required');
      }
      const projectPath = assertProjectPath(payload.projectPath);
      const source = payload.source === 'logger' ? 'logger' : 'manual';
      const now = new Date().toISOString();
      const existing = registry.findActiveByProjectPath(projectPath);
      if (existing?.instance.source === 'launcher') {
        return {
          ok: true,
          data: {
            instance: existing.instance,
          },
        };
      }
      const instanceId = existing?.instance.id ?? payload.id ?? randomUUID();
      const bridgeId = existing?.bridgeId ?? createBridgeIdentity().id;
      const record = existing
        ? registry.updateRunning(instanceId, {
          projectName: payload.projectName,
          projectPath,
          url: buildBridgeUrl(bridgeId, payload.url),
          upstreamUrl: payload.url,
          bridgeId,
          port: payload.port,
          pid: payload.pid,
          source,
          startedAt: existing.instance.startedAt,
          lastSeen: now,
          stop: existing.stop,
        })
        : registry.createRunning({
          id: instanceId,
          projectName: payload.projectName,
          projectPath,
          url: buildBridgeUrl(bridgeId, payload.url),
          upstreamUrl: payload.url,
          bridgeId,
          port: payload.port,
          pid: payload.pid,
          source,
          startedAt: payload.startedAt ?? now,
          lastSeen: now,
        });

      return {
        ok: true,
        data: {
          instance: record!.instance,
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
