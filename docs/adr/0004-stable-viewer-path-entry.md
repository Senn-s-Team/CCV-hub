# ADR 0004 - viewer 入口迁移到稳定 Hub path

## Status
Accepted — implemented in 2026-06 path-entry migration

## Context

随机 viewer host 形态会为每个实例生成一个新站点身份。浏览器信誉系统容易把高熵随机 host 识别成钓鱼站模式，即使 TLS、HTTPS、HSTS 与服务端链路都健康，也可能出现 Safe Browsing 误伤。

Hub 已经有稳定公网 host、面板鉴权与 viewer bridge。`bridgeId` 仍然是实例查找键，upstream URL 仍然保存真实 cc-viewer 地址与 token。

## Decision

viewer URL 统一使用稳定 Hub host 的 path：

```text
https://<CCV_HUB_PUBLIC_HOST>/viewer/<bridgeId>/?token=<token>
```

公网入口、开发代理、部署模板与 smoke 验证都只承认该 path 形态。

## Consequences

- 新实例只依赖一个稳定公网 host，降低浏览器信誉系统误伤概率。
- Edge 配置收敛为同 host `/viewer/*` 反代。
- Hub 控制面 API 继续由 Hub session 保护，viewer path 继续由 upstream token 与 bridge cookie 保护。
- viewer cookie 绑定 bridgeId，cookie path 收敛到 `/viewer/<bridgeId>`。
- path bridge 转发时剥离 `/viewer/<bridgeId>` 前缀，cc-viewer upstream 继续看到根路径。

## Implementation notes

- `CCV_HUB_PUBLIC_HOST` 是 URL 的 host 来源，生产环境必须配置。
- `CCV_HUB_VIEWER_PATH_PREFIX` 默认 `/viewer`，规范化为单前导 slash、无尾随 slash。
- `viewer-bridge` 只按 path 解析实例。
- `Location` 响应头从 upstream origin 改写到公开 `/viewer/<bridgeId>` base。
- smoke 与部署模板使用 viewer base path 拼接 SSE 和 WebSocket URL。

## Review trigger

- 真实 cc-viewer 前端产生根路径 `/assets`、`/api` 或 `/ws` 请求且浏览器验证失败。
- Hub host 需要同时承载多个 path prefix 或多租户路由。
