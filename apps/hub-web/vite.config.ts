/**
 * [INPUT]: 依赖 Vite React 插件与本地 hub-service 地址，依赖 Vitest 配置类型
 * [OUTPUT]: 对外提供 hub-web 的 Vite 配置，定义 React 集成、开发端口、可配置 Hub 主机名、API 代理、32 位 bridge id viewer HTTP 代理、受信任访问域名与测试环境
 * [POS]: hub-web 的前端开发入口配置，生产公网 viewer WebSocket 由 nginx.conf 承担
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
const publicDomain = process.env.CCV_HUB_PUBLIC_DOMAIN ?? 'example.com';
const viewerPrefix = process.env.CCV_HUB_VIEWER_SUBDOMAIN_PREFIX ?? 'ccv-';
const hubHost = process.env.CCV_HUB_PUBLIC_HOST ?? `ccv-hub.${publicDomain}`;
const allowedHosts = [hubHost, `.${publicDomain}`];
const routingConfig = { hubHost, publicDomain, viewerPrefix };

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const isViewerHostForConfig = (config: HubRoutingConfig, host = '') => {
  const normalizedHost = host.split(':')[0]?.toLowerCase() ?? '';
  const viewerHostPattern = new RegExp(
    `^${escapeRegExp(config.viewerPrefix)}[a-f0-9]{32}\\.${escapeRegExp(config.publicDomain)}$`,
  );

  return viewerHostPattern.test(normalizedHost);
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
        ws: false,
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
