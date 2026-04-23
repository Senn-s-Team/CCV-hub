/**
 * [INPUT]: 依赖 Vite React 插件与本地 hub-service 地址，依赖 Vitest 配置类型
 * [OUTPUT]: 对外提供 hub-web 的 Vite 配置，定义开发端口、API 代理与测试环境
 * [POS]: hub-web 的前端构建入口配置，负责把浏览器开发流量收敛到本地服务
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173,
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:4318',
    },
  },
  test: {
    environment: 'jsdom',
  },
});
