# ADR 0003 - 将公网路由桥接能力后置到增强阶段

## Status
Accepted

## Context
`ccv-hub` 当前 MVP 的核心闭环是：统一入口启动 `cc-viewer`、自动登记运行中实例、在总览页中打开实例、复制链接、筛选项目、在实例退出后完成列表收敛。系统设计文档中已经补充了一条未来能力：通过 Dokploy + Traefik + bridge，把实例 URL 升级为公网最佳可打开地址，并复用 `cc-viewer` 的 `localUrl`、`serverStarted`、`serverStopping` hook。

文档同时指出一个关键前提：必须先验证 Dokploy bridge 能稳定访问宿主机上的动态端口。这意味着公网能力成立依赖额外网络条件、路由桥接与运行时验证。

## Decision
首版**不把 Dokploy + Traefik + bridge 路由桥接纳入 MVP 主路径**。MVP 只要求本地地址可打开，公网桥接作为独立 PoC 和增强阶段工作流推进。`url` 字段在首版中表示“当前最佳可打开地址”，默认使用本地可达地址；公网验证通过后再升级为公网优先地址。

## Why
- 当前 PRD 验收项全部可以在本地单机环境中完成，不依赖公网链路。
- bridge 方案引入外部网络与路由层不确定性，会扩大首版排障范围。
- coding agent 在没有明确网络前提时更容易越界，把增强项混入 MVP，导致实现变重、分支变多。
- 先把本地实例发现与列表闭环做稳，再把公网访问当作独立实验推进，节奏更干净。

## Consequences
### Positive
- MVP 范围保持清晰，交付风险更低。
- 本地实例发现、启动、登记、打开、复制、收敛可以先独立闭环。
- 后续公网能力验证失败时，不会拖住首版主路径。
- 对 coding agent 来说，首版边界更清楚，更容易避免过度设计。

### Tradeoffs
- 首版复制链接默认给出本地地址，跨机器访问收益后置。
- 后续接入公网能力时仍需要补 bridge 服务与 hook 对接。
- `url` 的公网优先语义需要在增强阶段重新验证。

## Rejected alternatives
### 直接把 bridge 纳入首版主路径
该方案会让 MVP 依赖 Dokploy 网络、Traefik 路由、bridge 服务、宿主机端口转发和 hook 集成的整体可用性。当前阶段这条链路过长，收益与风险不平衡。

## Implementation notes
- 首版 `Instance.url` 直接使用本地可达地址。
- `port` 保持真实本机监听端口语义。
- 与公网桥接相关的复用点保留在文档中：
  - `cc-viewer/server.js:2474`
  - `cc-viewer/server.js:2938`
  - `cc-viewer/server.js:3254`
  - `cc-viewer/lib/plugin-loader.js:13`
  - `cc-viewer/lib/plugin-loader.js:14`
  - `cc-viewer/lib/plugin-loader.js:15`
- 在增强阶段单独做 Dokploy bridge PoC，验证页面、SSE、WebSocket 与 fallback。

## Review trigger
出现以下任一条件时，重新评估此决策：

- 本地 MVP 已稳定交付
- Dokploy bridge 已验证能稳定访问动态端口
- 用户对公网分享地址形成明确且高频的真实需求
