# ADR 0003 - 公网路由桥接从增强阶段进入当前实现

## Status
Accepted — implementation entered current scope on 2026-04-24 and completed public viewer link verification on 2026-04-25

## Context
`ccv-hub` 当前 MVP 的核心闭环是：统一入口启动 `cc-viewer`、自动登记运行中实例、在总览页中打开实例、复制链接、筛选项目、在实例退出后完成列表收敛。系统设计文档中已经补充了一条未来能力：通过 Dokploy + Traefik + bridge，把实例 URL 升级为公网最佳可打开地址，并复用 `cc-viewer` 的 `localUrl`、`serverStarted`、`serverStopping` hook。

文档同时指出一个关键前提：必须先验证 Dokploy bridge 能稳定访问宿主机上的动态端口。这意味着公网能力成立依赖额外网络条件、路由桥接与运行时验证。

## Decision
首版先完成本地闭环。2026-04-24 用户明确要求安装推荐公网方案后，Dokploy + Traefik + Hub bridge 路由桥接进入当前实现。`url` 字段表示“当前最佳可打开地址”，在 bridge 可用时优先返回公网 viewer bridge 地址；ADR 0004 已把新 URL 形态迁移到稳定 Hub host path。

## Why
- 当前 PRD 验收项全部可以在本地单机环境中完成，不依赖公网链路。
- bridge 方案引入外部网络与路由层不确定性，会扩大首版排障范围。
- coding agent 在没有明确网络前提时更容易越界，把增强项混入 MVP，导致实现变重、分支变多。
- 先把本地实例发现与列表闭环做稳，再把公网访问当作独立实验推进，节奏更干净。

## Consequences
### Positive
- MVP 范围保持清晰，交付风险更低。
- 本地实例发现、启动、登记、打开、复制、收敛可以先独立闭环。
- 公网 bridge 故障时，本地实例发现与列表主路径仍可独立排障。
- 对 coding agent 来说，首版边界更清楚，更容易避免过度设计。

### Tradeoffs
- 首版复制链接默认给出本地地址，跨机器访问收益后置。
- 当前实现需要验证公网入口、nginx/Caddy path 反代、host.docker.internal 回连与 WebSocket upgrade 链路。
- `url` 的公网优先语义依赖 Hub registry 内部保留 raw upstream。
- Hub 页面启动 viewer 的路径依赖宿主机 systemd 服务继承 `opc` 用户环境。

## Rejected alternatives
### 直接把 bridge 纳入首版主路径
该方案会让 MVP 依赖 Dokploy 网络、Traefik 路由、bridge 服务、宿主机端口转发和 hook 集成的整体可用性。当前阶段这条链路过长，收益与风险不平衡。

## Implementation notes
- 当前 `Instance.url` 使用 `https://<CCV_HUB_PUBLIC_HOST>/viewer/<bridgeId>/?token=<token>` 形式的公网 viewer path。
- registry 内部保留 raw upstream URL，用于反代和存活探测。
- `hub-service` 在宿主机 systemd 中运行，Web/Dokploy 容器只负责入口代理并通过 `host.docker.internal:4318` 回连；该边界用于保留单一宿主机 Claude 环境。
- `port` 保持真实 viewer 监听端口语义。
- 与公网桥接相关的复用点保留在文档中：
  - `cc-viewer/server.js:2474`
  - `cc-viewer/server.js:2938`
  - `cc-viewer/server.js:3254`
  - `cc-viewer/lib/plugin-loader.js:13`
  - `cc-viewer/lib/plugin-loader.js:14`
  - `cc-viewer/lib/plugin-loader.js:15`
- Dokploy bridge PoC 已进入当前实现并完成实机验证：Hub 首页、`/api/instances`、viewer HTML/JS/CSS、业务 API、SSE 与 WebSocket 均可通过公网 viewer bridge 访问。
- 后续增强聚焦安全与运维收口，包括 token 暴露面、重复 token 参数、结构化日志、健康细节与更完整的观测基线。

## Review trigger
出现以下任一条件时，重新评估此决策：

- viewer bridge 的 token 暴露策略需要收口
- Dokploy / Traefik / nginx 路由结构发生调整
- Hub bridge 需要支持更多域名、协议或多机部署
