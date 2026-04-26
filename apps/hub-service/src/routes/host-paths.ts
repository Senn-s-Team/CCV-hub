/**
 * [INPUT]: 依赖 FastifyInstance、共享宿主机路径响应契约与 HostPathBrowser
 * [OUTPUT]: 对外提供 registerHostPathRoutes，用于挂载 /api/host-paths/roots 与 /api/host-paths/list
 * [POS]: hub-service 的宿主机路径浏览路由，为启动弹窗提供 allowlist 内目录选择能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { FastifyInstance } from 'fastify';
import type { HostPathListResponse, HostPathRootsResponse } from '@ccv-hub/shared-contracts';
import { HostPathBrowser } from '../domain/host-path-browser.js';
import { toFailureResponse } from '../domain/error-mapper.js';

export function registerHostPathRoutes(app: FastifyInstance, browser: HostPathBrowser): void {
  app.get('/api/host-paths/roots', async (_, reply): Promise<HostPathRootsResponse> => {
    try {
      return {
        ok: true,
        data: {
          roots: browser.getRoots(),
        },
      };
    } catch (error) {
      reply.code(500);
      return toFailureResponse(error, 'HOST_PATH_FAILED');
    }
  });

  app.get('/api/host-paths/list', async (request, reply): Promise<HostPathListResponse> => {
    try {
      const rawPath = new URL(request.url, 'http://localhost').searchParams.get('path') ?? '';
      return {
        ok: true,
        data: await browser.list(rawPath),
      };
    } catch (error) {
      const failure = toFailureResponse(error, 'HOST_PATH_FAILED');
      reply.code(failure.error.code === 'INVALID_PATH' ? 400 : 500);
      return failure;
    }
  });
}
