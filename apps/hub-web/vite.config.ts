/**
 * [INPUT]: 依赖 Vite React 插件与本地 hub-service 地址，依赖 Vitest 配置类型
 * [OUTPUT]: 对外提供 hub-web 的 Vite 配置，定义 React 集成、开发端口、API 代理、受信任访问域名与测试环境
 * [POS]: hub-web 的前端构建入口配置，负责把浏览器开发流量与受信任入口主机名收敛到本地服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const proxyTarget = process.env.CCV_HUB_PROXY_TARGET ?? 'http://127.0.0.1:4318';
const allowedHosts = ['ccv-hub.paas.996667.xyz'];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173,
    host: '127.0.0.1',
    allowedHosts,
    proxy: {
      '/api': proxyTarget,
    },
  },
  test: {
    environment: 'jsdom',
  },
});
