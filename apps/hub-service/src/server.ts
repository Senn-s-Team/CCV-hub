/**
 * [INPUT]: 依赖 Fastify、鉴权路由、宿主机路径路由、本地/外部实例路由、viewer bridge 路由、Hub 插件安装器、bridge 配置校验、实例注册表与统一入口启动器
 * [OUTPUT]: 对外提供 buildServer、startServer 与默认 CLI 启动入口
 * [POS]: hub-service 的装配根，把鉴权、显式启用的 logger 插件播种、领域、路由与基础设施收敛为可运行本地服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { fileURLToPath } from 'node:url';
import { createLogger } from './infra/logger.js';
import { InstanceRegistry } from './domain/instance-registry.js';
import { installHubPlugin } from './domain/hub-plugin-installer.js';
import { CcvLauncher, type ViewerLauncher } from './launcher/ccv-launcher.js';
import { resolveAuthConfig, type AuthConfig } from './domain/auth-session.js';
import { createBridgeConfig } from './domain/bridge-url.js';
import { HostPathBrowser } from './domain/host-path-browser.js';
import { registerAuthRoutes, registerPanelAuthGuard } from './routes/auth.js';
import { registerHealthRoute } from './routes/health.js';
import { registerHostPathRoutes } from './routes/host-paths.js';
import { registerListInstancesRoute } from './routes/instances.get.js';
import { registerCreateInstanceRoute } from './routes/instances.post.js';
import { registerInstanceLifecycleRoute } from './routes/instances.lifecycle.js';
import { registerExternalInstanceRoute } from './routes/instances.register.js';
import { registerUnregisterInstanceRoute } from './routes/instances.unregister.js';
import { registerViewerBridgeRoute } from './routes/viewer-bridge.js';

export type BuildServerOptions = {
  registry?: InstanceRegistry;
  launcher?: ViewerLauncher;
  auth?: AuthConfig;
  pathBrowser?: HostPathBrowser;
};

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const logger = createLogger();
  const app = Fastify({ logger: false });
  const registry = options.registry ?? new InstanceRegistry();
  const launcher = options.launcher ?? new CcvLauncher();
  createBridgeConfig();
  const auth = options.auth ?? resolveAuthConfig();
  const pathBrowser = options.pathBrowser ?? new HostPathBrowser(['/home/opc/projects']);

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
  registerAuthRoutes(app, auth);
  registerPanelAuthGuard(app, auth);
  registerHostPathRoutes(app, pathBrowser);
  registerListInstancesRoute(app, registry);
  registerCreateInstanceRoute(app, registry, launcher);
  registerInstanceLifecycleRoute(app, registry);
  registerExternalInstanceRoute(app, registry);
  registerUnregisterInstanceRoute(app, registry);
  registerViewerBridgeRoute(app, registry);

  return app;
}

export async function startServer(): Promise<FastifyInstance> {
  let pluginInstall: Awaited<ReturnType<typeof installHubPlugin>> | undefined;
  if (process.env.CCV_HUB_PLUGIN_AUTO_INSTALL === '1') {
    try {
      pluginInstall = await installHubPlugin();
    } catch (error) {
      console.error('[ccv-hub] plugin install failed:', error);
    }
  }

  const app = buildServer({ pathBrowser: await HostPathBrowser.fromEnv() });
  const port = Number(process.env.CCV_HUB_PORT ?? '4318');
  const host = process.env.CCV_HUB_HOST ?? '127.0.0.1';
  await app.listen({ port, host });
  if (pluginInstall) {
    app.log.info({ targetPath: pluginInstall.targetPath, reason: pluginInstall.reason }, 'ccv-hub plugin install checked');
  }
  return app;
}

const entryPath = process.argv[1] ? fileURLToPath(new URL(import.meta.url)) === process.argv[1] : false;

if (entryPath) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
