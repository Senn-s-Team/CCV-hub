# ccv-hub 接口契约

## 1. 文档目的

本文定义 `ccv-hub` 本地服务接口契约，固定网页、插件和 Agent 之间的数据格式与调用边界。

## 2. 约定原则

- 只返回运行中实例。
- 返回结果按 `startedAt` 降序排序。
- Hub 控制面 API 使用管理员 session。
- viewer bridge 使用实例 URL token，首次验证后设置 bridge 维度 viewer cookie。
- `instance.url` 是公开可打开地址，默认形态为 `https://<CCV_HUB_PUBLIC_HOST>/viewer/<bridgeId>/?token=<token>`。

## 3. Instance

```json
{
  "id": "ins_01HXYZ",
  "projectName": "my-project",
  "projectPath": "/home/opc/projects/my-project",
  "url": "https://<CCV_HUB_PUBLIC_HOST>/viewer/1234567890abcdef1234567890abcdef/?token=abc",
  "port": 4321,
  "pid": 12345,
  "status": "running",
  "source": "launcher",
  "startedAt": "2026-04-22T10:00:00.000Z",
  "lastSeen": "2026-04-22T10:00:05.000Z",
  "canStop": true
}
```

字段说明：

- `id`: 实例唯一标识。
- `projectName`: 项目名，用于列表主展示。
- `projectPath`: 项目绝对路径，用于区分同名项目。
- `url`: 最佳可打开地址，默认返回 viewer path 公网 bridge 地址；内部 upstream 地址不对页面暴露。
- `port`: 实例本机监听端口，用于诊断、回退与路由桥接。
- `pid`: 实例进程号。
- `status`: 页面可见状态，当前固定为 `running`。
- `source`: 实例来源，支持 `launcher`、`logger` 与 `manual`。
- `startedAt`: 启动时间，用于默认排序。
- `lastSeen`: 最近确认时间，用于内部状态收敛。
- `canStop`: Hub 是否持有可信停止句柄。

## 4. 通用响应格式

成功响应：

```json
{ "ok": true, "data": {} }
```

错误响应：

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_PATH",
    "message": "Project path is invalid"
  }
}
```

错误码：

- `INVALID_PATH`: 项目路径无效。
- `START_FAILED`: 启动失败。
- `REGISTER_FAILED`: 实例登记失败。
- `LIST_FAILED`: 实例列表读取失败。
- `UNREGISTER_FAILED`: 实例注销失败。
- `LIFECYCLE_FAILED`: 实例生命周期控制失败。
- `LIFECYCLE_PENDING`: 实例正在停止中。
- `HOST_PATH_FAILED`: 宿主机路径读取失败。
- `UNAUTHORIZED`: 鉴权失败。
- `AUTH_NOT_CONFIGURED`: Hub 鉴权未配置。
- `INTERNAL_ERROR`: 未归类内部错误。

## 5. 控制面接口

### 5.1 `GET /api/health`

健康检查，公开可读。

```json
{ "ok": true, "data": { "status": "ok" } }
```

### 5.2 `GET /api/auth/me`

返回 Hub 面板鉴权状态。

```json
{ "ok": true, "data": { "authenticated": true, "configured": true } }
```

### 5.3 `POST /api/auth/login`

请求体：

```json
{ "password": "change-me" }
```

成功后设置 Hub session cookie。

### 5.4 `POST /api/auth/logout`

清除 Hub session cookie。

### 5.5 `GET /api/instances`

返回当前所有运行中实例。

```json
{
  "ok": true,
  "data": {
    "instances": [
      {
        "id": "ins_01HXYZ",
        "projectName": "my-project",
        "projectPath": "/home/opc/projects/my-project",
        "url": "https://<CCV_HUB_PUBLIC_HOST>/viewer/1234567890abcdef1234567890abcdef/?token=abc",
        "port": 4321,
        "pid": 12345,
        "status": "running",
        "source": "launcher",
        "startedAt": "2026-04-22T10:00:00.000Z",
        "lastSeen": "2026-04-22T10:00:05.000Z",
        "canStop": true
      }
    ]
  }
}
```

约束：

- 只返回运行中实例。
- 服务端按 `startedAt` 降序排序。
- `url` 返回 viewer path 公网 bridge 地址。
- 接口只接受 Hub 面板 session；viewer token 无法访问该接口。

### 5.6 `POST /api/instances`

通过路径启动新实例。

请求体：

```json
{ "projectPath": "/home/opc/projects/my-project" }
```

约束：

- 输入路径必须是绝对路径。
- 服务端以真实绝对路径作为 active 实例唯一键。
- 同一真实绝对路径只允许一个 active 实例；重复启动返回现有实例。
- 启动成功后才返回 `instance`。
- `instance.url` 使用当前 `CCV_HUB_PUBLIC_HOST + CCV_HUB_VIEWER_PATH_PREFIX + bridgeId` 生成。

### 5.7 `POST /api/instances/:id/actions/:action`

控制 Hub 自身启动且持有停止句柄的实例。

支持动作：

- `stop`
- `force-stop`

成功响应：

```json
{ "ok": true, "data": { "action": "stop", "removed": true } }
```

### 5.8 `GET /api/host-paths/roots`

返回允许页面浏览的宿主机项目根目录。

```json
{
  "ok": true,
  "data": {
    "roots": [
      { "name": "projects", "path": "/home/opc/projects", "readable": true }
    ]
  }
}
```

### 5.9 `GET /api/host-paths/list?path=/home/opc/projects`

返回 allowlist 内某个宿主机目录的直接子目录。

约束：

- `path` 必须是 allowlist 内绝对目录。
- 服务端使用 `realpath` 校验符号链接逃逸。
- 只返回目录。
- 过滤 `.ssh`、`.gnupg`、`.claude`、`.config`、`.git`、`node_modules`。
- 单次最多返回 200 个目录。

## 6. 插件注册接口

### 6.1 `POST /api/instances/register`

外部 cc-viewer 插件或手动流程注册运行中实例。

请求体：

```json
{
  "id": "manual-7008",
  "projectName": "my-project",
  "projectPath": "/home/opc/projects/my-project",
  "url": "http://127.0.0.1:7008?token=abc",
  "port": 7008,
  "pid": 12345,
  "source": "logger",
  "startedAt": "2026-04-22T10:00:00.000Z"
}
```

约束：

- `url` 必须带 upstream token。
- `source` 支持 `logger` 与 `manual`，外部传入 `launcher` 会归一为 `manual`。
- 返回的公开 `instance.url` 使用 viewer path bridge 地址。
- 本机插件注册路径允许本机绕过 Hub 面板 session。

### 6.2 `POST /api/instances/unregister`

外部 cc-viewer 插件注销实例。

请求体：

```json
{
  "id": "/home/opc/projects/my-project:7008",
  "pid": 12345,
  "port": 7008,
  "projectPath": "/home/opc/projects/my-project",
  "source": "logger"
}
```

约束：

- 至少提供一个匹配字段。
- `source` 缺省按 `manual` 处理，logger 插件注销时显式传入 `logger`。
- 匹配成功后实例从运行列表移除。
- 重复注销返回 `removed: false`。

## 7. viewer bridge 访问

公开入口：

```text
GET /viewer/<bridgeId>/?token=<token>
GET /viewer/<bridgeId>/assets/app.js
GET /viewer/<bridgeId>/api/events?cursor=1
GET /viewer/<bridgeId>/ws/terminal
```

约束：

- `bridgeId` 是 32 位 hex，来自实例注册表。
- 首次请求必须带有效 upstream `token` 查询参数。
- 首次验证成功后，Hub bridge 设置 `ccv_viewer_session_<bridgeId>` cookie。
- Cookie path 固定为 `/viewer/<bridgeId>`，`HttpOnly`、`SameSite=Lax`，HTTPS 下带 `Secure`。
- Hub 转发时剥离 `/viewer/<bridgeId>` 前缀，cc-viewer upstream 继续看到 `/`、`/api/*`、`/assets/*` 与 `/ws/*`。
- Hub 转发时自动覆盖请求中的 `token`，使用真实 upstream token。
- `Location` 响应头会从 upstream origin 改写为公开 `/viewer/<bridgeId>` base。

## 8. 状态约定

页面可见状态：

- `running`

系统内部状态：

- `starting`
- `stale`
- `removed`
- `exited`

内部状态只用于服务端控制与清理。

## 9. 前后端责任边界

服务端负责路径校验、实例启动/停止、外部注册注销、运行中过滤、排序、错误结构、Hub session 与 viewer bridge token/cookie。

前端负责渲染实例列表、本地项目名筛选、打开/复制链接、启动弹窗与生命周期动作触发。
