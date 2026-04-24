/**
 * [INPUT]: 依赖 vitest 与 hub-web Vite 代理判定函数
 * [OUTPUT]: 对外提供 Hub API、Hub SPA 与 viewer 子域名代理分流回归测试
 * [POS]: hub-web 测试集的配置守卫，防止 Vite fallback 把 API JSON 请求误送到 HTML 入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { describe, expect, it } from 'vitest';
import { isViewerHost, shouldProxyToHubService } from '../../vite.config.js';

describe('vite proxy routing', () => {
  it('keeps hub page requests in the Vite SPA', () => {
    expect(isViewerHost('ccv-hub.paas.996667.xyz')).toBe(false);
    expect(shouldProxyToHubService('ccv-hub.paas.996667.xyz', '/')).toBe(false);
  });

  it('proxies hub API requests to hub-service', () => {
    expect(shouldProxyToHubService('ccv-hub.paas.996667.xyz', '/api/instances')).toBe(true);
  });

  it('proxies viewer subdomain requests to hub-service bridge', () => {
    expect(isViewerHost('ccv-manual-7008.paas.996667.xyz')).toBe(true);
    expect(shouldProxyToHubService('ccv-manual-7008.paas.996667.xyz', '/api/events')).toBe(true);
    expect(shouldProxyToHubService('ccv-manual-7008.paas.996667.xyz', '/assets/index.js')).toBe(true);
  });
});
