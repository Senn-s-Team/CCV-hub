/**
 * [INPUT]: 依赖 Vite React 插件与本地 hub-service 地址，依赖 Vitest 配置类型
 * [OUTPUT]: 对外提供 hub-web 的 Vite 配置，定义 React 集成、开发端口、可配置 Hub 主机名、/api 与 /viewer path 代理、受信任访问域名与测试环境
 * [POS]: hub-web 的前端开发入口配置，生产公网 viewer WebSocket 与同 host /viewer 反代由 nginx.conf 承担
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

type HubRoutingConfig = {
  viewerPathPrefix: string;
};

const proxyTarget = process.env.CCV_HUB_PROXY_TARGET ?? 'http://127.0.0.1:4318';
const hubHost = process.env.CCV_HUB_PUBLIC_HOST;
const viewerPathPrefix = normalizeViewerPathPrefix(process.env.CCV_HUB_VIEWER_PATH_PREFIX);
const localAllowedHosts = ['localhost', '127.0.0.1'];
const allowedHosts = hubHost ? Array.from(new Set([hubHost, ...localAllowedHosts])) : localAllowedHosts;
const routingConfig = { viewerPathPrefix };

function normalizeViewerPathPrefix(value: string | undefined): string {
  const raw = value?.trim() || '/viewer';
  const prefixed = raw.startsWith('/') ? raw : `/${raw}`;
  return prefixed.replace(/\/+$/u, '') || '/viewer';
}

export const isViewerPathForConfig = (config: HubRoutingConfig, url = '') => {
  const pathname = new URL(url, 'http://localhost').pathname;
  return pathname === config.viewerPathPrefix || pathname.startsWith(`${config.viewerPathPrefix}/`);
};

export const shouldProxyToHubServiceForConfig = (config: HubRoutingConfig, url = '') =>
  url.startsWith('/api') || isViewerPathForConfig(config, url);

export const shouldProxyToHubService = (_host = '', url = '') =>
  shouldProxyToHubServiceForConfig(routingConfig, url);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173,
    host: '127.0.0.1',
    allowedHosts,
    proxy: {
      '^/.*': {
        target: proxyTarget,
        changeOrigin: false,
        ws: true,
        bypass: (request) => {
          if (shouldProxyToHubService(request.headers.host, request.url)) return undefined;
          return request.url;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
