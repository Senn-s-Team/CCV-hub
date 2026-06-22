/**
 * [INPUT]: 依赖 vitest 与 hub-web Vite 代理判定函数
 * [OUTPUT]: 对外提供 Hub SPA、Hub API 与 /viewer path 代理分流回归测试
 * [POS]: hub-web 测试集的配置守卫，防止 Vite fallback 把 API/Viewer 请求误送到 HTML 入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { describe, expect, it } from 'vitest';
import {
  shouldProxyToHubService,
  shouldProxyToHubServiceForConfig,
} from '../../vite.config.js';

describe('vite proxy routing', () => {
  it('keeps hub page requests in the Vite SPA', () => {
    expect(shouldProxyToHubService('ccv-hub.test', '/')).toBe(false);
  });

  it('keeps configured hub page requests in the Vite SPA', () => {
    const config = { viewerPathPrefix: '/viewer' };

    expect(shouldProxyToHubServiceForConfig(config, '/')).toBe(false);
    expect(shouldProxyToHubServiceForConfig(config, '/api/instances')).toBe(true);
    expect(shouldProxyToHubServiceForConfig(config, '/viewer/31b9745c782f47df97a90a3a226a9390/')).toBe(true);
  });

  it('proxies hub API requests to hub-service', () => {
    expect(shouldProxyToHubService('ccv-hub.test', '/api/instances')).toBe(true);
  });

  it('proxies viewer path requests to hub-service bridge', () => {
    const bridgeId = '31b9745c782f47df97a90a3a226a9390';

    expect(shouldProxyToHubService('ccv-hub.test', `/viewer/${bridgeId}/`)).toBe(true);
    expect(shouldProxyToHubService('ccv-hub.test', `/viewer/${bridgeId}/assets/index.js`)).toBe(true);
  });

  it('keeps viewer-like sibling paths in the Vite SPA', () => {
    expect(shouldProxyToHubService('ccv-hub.test', '/viewerish/31b9745c782f47df97a90a3a226a9390/')).toBe(false);
  });
});
