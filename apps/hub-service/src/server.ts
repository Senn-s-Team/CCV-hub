/**
 * [INPUT]: 依赖 Fastify、本地路由模块、实例注册表与统一入口启动器
 * [OUTPUT]: 对外提供 buildServer、startServer 与默认 CLI 启动入口
 * [POS]: hub-service 的装配根，把领域、路由与基础设施收敛为可运行本地服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { createLogger } from './infra/logger.js';
import { InstanceRegistry } from './domain/instance-registry.js';
import { CcvLauncher, type ViewerLauncher } from './launcher/ccv-launcher.js';
import { registerHealthRoute } from './routes/health.js';
import { registerListInstancesRoute } from './routes/instances.get.js';
import { registerCreateInstanceRoute } from './routes/instances.post.js';

export type BuildServerOptions = {
  registry?: InstanceRegistry;
  launcher?: ViewerLauncher;
};

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const logger = createLogger();
  const app = Fastify({ logger: false });
  const registry = options.registry ?? new InstanceRegistry();
  const launcher = options.launcher ?? new CcvLauncher();

  app.setErrorHandler((error, _, reply) => {
    logger.error({ err: error }, 'request failed');
    reply.status(500).send({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    });
  });

  registerHealthRoute(app);
  registerListInstancesRoute(app, registry);
  registerCreateInstanceRoute(app, registry, launcher);

  return app;
}

export async function startServer(): Promise<FastifyInstance> {
  const app = buildServer();
  const port = Number(process.env.CCV_HUB_PORT ?? '4318');
  const host = process.env.CCV_HUB_HOST ?? '127.0.0.1';
  await app.listen({ port, host });
  return app;
}

const entryPath = process.argv[1] ? fileURLToPath(new URL(import.meta.url)) === process.argv[1] : false;

if (entryPath) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
