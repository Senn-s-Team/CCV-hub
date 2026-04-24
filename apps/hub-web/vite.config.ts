/**
 * [INPUT]: 依赖 Vite React 插件与本地 hub-service 地址，依赖 Vitest 配置类型
 * [OUTPUT]: 对外提供 hub-web 的 Vite 配置，定义 React 集成、开发端口、可配置 Hub 主机名、API/bridge/WebSocket 代理、受信任访问域名与测试环境
 * [POS]: hub-web 的前端构建入口配置，负责把浏览器开发流量、Hub 主机识别、viewer bridge HTTP/WebSocket 流量与受信任入口主机名收敛到本地服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

type HubRoutingConfig = {
  hubHost: string;
  publicDomain: string;
  viewerPrefix: string;
};

const proxyTarget = process.env.CCV_HUB_PROXY_TARGET ?? 'http://127.0.0.1:4318';
const publicDomain = process.env.CCV_HUB_PUBLIC_DOMAIN ?? 'paas.996667.xyz';
const viewerPrefix = process.env.CCV_HUB_VIEWER_SUBDOMAIN_PREFIX ?? 'ccv-';
const hubHost = process.env.CCV_HUB_PUBLIC_HOST ?? `ccv-hub.${publicDomain}`;
const allowedHosts = [hubHost, `.${publicDomain}`];
const routingConfig = { hubHost, publicDomain, viewerPrefix };

export const isViewerHostForConfig = (config: HubRoutingConfig, host = '') => {
  const normalizedHost = host.split(':')[0]?.toLowerCase() ?? '';
  return (
    normalizedHost !== config.hubHost &&
    normalizedHost.startsWith(config.viewerPrefix) &&
    normalizedHost.endsWith(`.${config.publicDomain}`)
  );
};

export const shouldProxyToHubServiceForConfig = (config: HubRoutingConfig, host = '', url = '') =>
  isViewerHostForConfig(config, host) || url.startsWith('/api');

export const isViewerHost = (host = '') => isViewerHostForConfig(routingConfig, host);

export const shouldProxyToHubService = (host = '', url = '') =>
  shouldProxyToHubServiceForConfig(routingConfig, host, url);

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
