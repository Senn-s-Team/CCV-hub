/**
 * [INPUT]: 依赖 vitest 与 hub-web Vite 代理判定函数
 * [OUTPUT]: 对外提供 Hub API、可配置 Hub SPA 主机与 32 位 bridge id viewer 子域名代理分流回归测试
 * [POS]: hub-web 测试集的配置守卫，防止 Hub 改名后被识别为 viewer 子域名，防止 Vite fallback 把 API JSON 请求误送到 HTML 入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { describe, expect, it } from 'vitest';
import {
  isViewerHost,
  shouldProxyToHubService,
  shouldProxyToHubServiceForConfig,
} from '../../vite.config.js';

describe('vite proxy routing', () => {
  it('keeps hub page requests in the Vite SPA', () => {
    expect(isViewerHost('ccv-hub.paas.996667.xyz')).toBe(false);
    expect(shouldProxyToHubService('ccv-hub.paas.996667.xyz', '/')).toBe(false);
  });

  it('keeps configured hub page requests in the Vite SPA', () => {
    const config = {
      hubHost: 'ccv-hub-dev.paas.996667.xyz',
      publicDomain: 'paas.996667.xyz',
      viewerPrefix: 'ccv-',
    };

    expect(shouldProxyToHubServiceForConfig(config, 'ccv-hub-dev.paas.996667.xyz', '/')).toBe(false);
    expect(shouldProxyToHubServiceForConfig(config, 'ccv-hub-dev.paas.996667.xyz', '/api/instances')).toBe(true);
    expect(shouldProxyToHubServiceForConfig(config, 'ccv-manual-7008.paas.996667.xyz', '/')).toBe(false);
  });

  it('proxies hub API requests to hub-service', () => {
    expect(shouldProxyToHubService('ccv-hub.paas.996667.xyz', '/api/instances')).toBe(true);
  });

  it('proxies viewer subdomain requests to hub-service bridge', () => {
    const viewerHost = 'ccv-31b9745c782f47df97a90a3a226a9390.paas.996667.xyz';

    expect(isViewerHost(viewerHost)).toBe(true);
    expect(shouldProxyToHubService(viewerHost, '/api/events')).toBe(true);
    expect(shouldProxyToHubService(viewerHost, '/assets/index.js')).toBe(true);
  });

  it('keeps malformed viewer-like hosts in the Vite SPA', () => {
    expect(isViewerHost('ccv-manual-7008.paas.996667.xyz')).toBe(false);
    expect(isViewerHost('ccv-31b9745c782f47df97a90a3a226a939z.paas.996667.xyz')).toBe(false);
    expect(isViewerHost('ccv-31b9745c782f47df97a90a3a226a9390.example.com')).toBe(false);
  });
});
