# ccv-hub 系统设计

## 1. 系统目标与边界

`ccv-hub` 汇总同一台机器上正在运行的 `cc-viewer` 实例，提供统一列表、受控启动、打开、复制链接、停止与状态收敛能力。

边界：

- 单机运行。
- `cc-viewer` 继续负责单实例内容展示。
- `ccv-hub` 负责实例发现、路径选择、实例登记、实例列表、生命周期动作、总览页和 viewer bridge。
- Web 控制面使用 Hub session；viewer bridge 使用实例 upstream token。

## 2. 组件划分

### 2.1 `apps/hub-web`

React 总览页，负责实例列表、项目名筛选、启动弹窗、打开/复制链接、生命周期动作与轮询刷新。生产入口由 nginx 承载静态资源，并把 `/api/*` 与 `/viewer/*` 代理给 Agent。

### 2.2 `apps/hub-service`

Fastify Agent，负责健康检查、鉴权、宿主机路径浏览、实例启动、外部注册/注销、实例注册表、viewer bridge 与 Hub 插件播种。

### 2.3 `InstanceRegistry`

运行态真相源。以真实绝对 `projectPath` 管理 active 占用，以 `bridgeId` 管理公网 viewer 路由。

### 2.4 `packages/shared-contracts`

前后端共享 schema 与类型，固定 Instance、响应结构与错误码。

## 3. 运行流程

### 3.1 启动新实例

用户在总览页输入项目路径 → Web 调用 `POST /api/instances` → Agent 校验 allowlist 和 active 占用 → 启动 `cc-viewer` → 解析 upstream URL 与 token → 生成 `bridgeId` → 构造公开 URL：

```text
https://<CCV_HUB_PUBLIC_HOST>/viewer/<bridgeId>/?token=<token>
```

Agent 登记 `instance.url`、`upstreamUrl` 与 `bridgeId`，页面展示公开 URL。

### 3.2 logger/manual 注册

Hub 插件或手动流程调用 `POST /api/instances/register` 上报 raw upstream URL。Agent 要求 upstream URL 带 token，生成或复用 `bridgeId`，返回同样的 viewer path URL。

### 3.3 打开实例

用户点击打开 → 浏览器访问 `/viewer/<bridgeId>/?token=...` → viewer bridge 校验 token → 设置 `ccv_viewer_session_<bridgeId>` cookie → 反代到对应 cc-viewer upstream。

### 3.4 viewer 转发

viewer bridge 按 path 解析实例：

```text
/viewer/<id>/                     -> /
/viewer/<id>/assets/app.js        -> /assets/app.js
/viewer/<id>/api/events?cursor=1  -> /api/events?cursor=1
/viewer/<id>/ws/terminal          -> /ws/terminal
```

转发时自动覆盖 `token` 为真实 upstream token。`Location` 响应头改写到公开 `/viewer/<bridgeId>` base。

### 3.5 停止与收敛

Hub 启动的实例通过生命周期接口停止；插件上报实例通过 unregister 收敛；端口不可达或进程退出后 registry 释放 active path。

## 4. 数据模型

Instance 面向页面：

- `id`
- `projectName`
- `projectPath`
- `url`
- `port`
- `pid`
- `status`
- `source`
- `startedAt`
- `lastSeen`
- `canStop`

内部记录额外保存：

- `upstreamUrl`: cc-viewer 本机真实地址与 token。
- `bridgeId`: viewer bridge 查找键。
- `stop`: Hub 启动实例的可信停止句柄。

状态：

- 页面可见：`running`。
- 内部收敛：`starting`、`stopping`、`stale`、`removed`。

## 5. 鉴权边界

- `/api/auth/*`、`/api/instances/*`、`/api/host-paths/*` 使用 Hub session。
- `/api/instances/register` 与 `/api/instances/unregister` 允许本机插件绕过 Hub session。
- `/viewer/<bridgeId>/*` 使用 viewer upstream token 与 bridge cookie。
- viewer token 只授权 viewer bridge，无法访问 Hub 控制面 API。

## 6. 部署拓扑

```text
Browser
  |
  v
Public Web Entry: https://<CCV_HUB_PUBLIC_HOST>
  |-- /            -> hub-web static
  |-- /api/*       -> ccv-hub-agent
  |-- /viewer/*    -> ccv-hub-agent viewer bridge
  v
ccv-hub-agent on host
  |
  v
cc-viewer instances on host
```

Web 容器或静态入口不持有 `~/.claude`、项目源码和进程控制权。Agent 保留在宿主机，继承 Claude Code 用户环境。

## 7. 安全与运维原则

- Agent 端口只开放给受控入口访问。
- `/etc/ccv-hub/.env.agent` 使用 `0600` 权限。
- `CCV_HUB_PATH_ROOTS` 只包含明确授权的项目根目录。
- viewer cookie 使用 bridgeId 维度，Path 收敛到 `/viewer/<bridgeId>`。
- `CCV_HUB_PUBLIC_HOST` 是新 URL 的唯一稳定 host。

## 8. 验收基线

- `GET /api/instances` 返回 viewer path URL。
- `/viewer/<bridgeId>/?token=...` 可打开 viewer HTML。
- HTML、静态资源、API、SSE、multipart 上传与 WebSocket 均经 path bridge 成功转发。
- 缺少 token/cookie 的 viewer 请求返回 401。
- 只有 viewer cookie 的 Hub 控制面 API 请求返回 401。
