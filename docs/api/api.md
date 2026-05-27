# ccv-hub 接口契约

## 1. 文档目的

本文定义 `ccv-hub` 自用 MVP 的本地服务接口契约，目标是固定网页、CLI 和本地服务之间的数据格式与调用边界。本文只覆盖 MVP 必需接口，不展开鉴权、远程调用和高级控制能力。

## 2. 接口边界

### 2.1 范围内

- 运行中实例列表读取
- 宿主机路径浏览
- 启动新实例
- 外部实例注册与注销
- 健康检查
- 统一错误返回格式
- 实例对象字段定义

### 2.2 范围外

- 远程 API
- 历史实例查询
- 高级筛选接口
- 多用户权限控制
- 复杂生命周期管理命令

## 3. 约定原则

- 只返回运行中实例
- 返回结果优先服务当前总览页 MVP
- 默认排序由服务端保证为最近启动时间降序
- `stale` 与 `exited` 属于系统内部收敛状态，不作为页面列表结果返回
- Hub 控制面 API 使用管理员会话；viewer bridge 使用实例 URL token，并在首次验证后设置实例级 viewer cookie

## 4. 实例对象

### 4.1 Instance

```json
{
  "id": "ins_01HXYZ...",
  "projectName": "my-project",
  "projectPath": "/home/opc/projects/my-project",
  "url": "https://ccv-ins-01hxyz.paas.996667.xyz/?token=abc",
  "port": 4321,
  "pid": 12345,
  "status": "running",
  "source": "launcher",
  "startedAt": "2026-04-22T10:00:00.000Z",
  "lastSeen": "2026-04-22T10:00:05.000Z"
}
```

### 4.2 字段说明

- `id`: 实例唯一标识
- `projectName`: 项目名，用于列表主展示
- `projectPath`: 项目绝对路径，用于区分同名项目
- `url`: 最佳可打开地址，优先返回 viewer 子域名公网 bridge 地址；内部 upstream 地址不对页面暴露
- `port`: 实例本机监听端口，用于诊断、回退与路由桥接
- `pid`: 实例进程号
- `status`: 第一版固定返回 `running`
- `source`: 实例来源，第一版至少支持 `launcher` 与 `manual`
- `startedAt`: 启动时间，用于默认排序
- `lastSeen`: 最近确认时间，用于内部状态收敛

## 5. 通用响应格式

### 5.1 成功响应

```json
{
  "ok": true,
  "data": {}
}
```

### 5.2 错误响应

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_PATH",
    "message": "Project path is invalid"
  }
}
```

### 5.3 错误码建议

- `INVALID_PATH`: 项目路径无效
- `START_FAILED`: 启动失败
- `REGISTER_FAILED`: 实例登记失败
- `LIST_FAILED`: 实例列表读取失败
- `UNREGISTER_FAILED`: 实例注销失败
- `LIFECYCLE_FAILED`: 实例生命周期控制失败
- `LIFECYCLE_PENDING`: 实例正在停止中
- `HOST_PATH_FAILED`: 宿主机路径读取失败
- `INTERNAL_ERROR`: 未归类内部错误

## 6. 接口清单

### 6.1 `GET /api/health`

用于本地服务健康检查。

成功响应：

```json
{
  "ok": true,
  "data": {
    "status": "ok"
  }
}
```

### 6.2 `GET /api/instances`

返回当前所有运行中实例。

成功响应：

```json
{
  "ok": true,
  "data": {
    "instances": [
      {
        "id": "ins_01HXYZ...",
        "projectName": "my-project",
        "projectPath": "/home/opc/projects/my-project",
        "url": "https://ccv-ins-01hxyz.paas.996667.xyz/?token=abc",
        "port": 4321,
        "pid": 12345,
        "status": "running",
        "source": "launcher",
        "startedAt": "2026-04-22T10:00:00.000Z",
        "lastSeen": "2026-04-22T10:00:05.000Z"
      }
    ]
  }
}
```

约束：
- 只返回运行中实例
- 服务端已按 `startedAt` 降序排序
- 第一版不接受筛选参数，由前端本地做项目名筛选
- `url` 优先返回 viewer 子域名公网 bridge 地址

### 6.3 `GET /api/host-paths/roots`

返回允许页面浏览的宿主机项目根目录。

成功响应：

```json
{
  "ok": true,
  "data": {
    "roots": [
      {
        "name": "projects",
        "path": "/home/opc/projects",
        "readable": true
      }
    ]
  }
}
```

约束：
- 根目录来自服务端 allowlist，默认由 `CCV_HUB_PATH_ROOTS` 配置
- 返回路径是宿主机真实路径
- 接口受面板鉴权保护

### 6.4 `GET /api/host-paths/list?path=/home/opc/projects`

返回 allowlist 内某个宿主机目录的直接子目录。

成功响应：

```json
{
  "ok": true,
  "data": {
    "currentPath": "/home/opc/projects",
    "parentPath": null,
    "entries": [
      {
        "name": "ccvs",
        "path": "/home/opc/projects/ccvs",
        "readable": true
      }
    ]
  }
}
```

约束：
- `path` 必须是 allowlist 内的绝对目录
- 服务端使用 `realpath` 校验符号链接逃逸
- 只返回目录，不返回文件
- 过滤 `.ssh`、`.gnupg`、`.claude`、`.config`、`.git`、`node_modules`
- 单次最多返回 200 个目录

### 6.5 `POST /api/instances`

用于通过路径启动新实例。

请求体：

```json
{
  "projectPath": "/home/opc/projects/my-project"
}
```

成功响应：

```json
{
  "ok": true,
  "data": {
    "instance": {
      "id": "ins_01HXYZ...",
      "projectName": "my-project",
      "projectPath": "/home/opc/projects/my-project",
      "url": "https://ccv-ins-01hxyz.paas.996667.xyz/?token=abc",
      "port": 4321,
      "pid": 12345,
      "status": "running",
      "source": "launcher",
      "startedAt": "2026-04-22T10:00:00.000Z",
      "lastSeen": "2026-04-22T10:00:05.000Z"
    }
  }
}
```

失败响应示例：

```json
{
  "ok": false,
  "error": {
    "code": "START_FAILED",
    "message": "Failed to start cc-viewer"
  }
}
```

约束：
- 输入路径必须是绝对路径，服务端以真实绝对路径作为实例唯一键
- 同一真实绝对路径只允许一个 active 实例；重复启动返回现有实例
- 启动成功后才返回 `instance`
- 半状态实例不得返回给页面
- 返回的 `instance.url` 应与当前可打开地址保持一致，优先使用 viewer 子域名公网 bridge 地址

### 6.6 `POST /api/instances/:id/actions/:action`

用于控制 hub 启动并持有停止句柄的运行中实例生命周期。当前 `action` 取值为 `stop` 或 `force-stop`。

成功响应：

```json
{
  "ok": true,
  "data": {
    "action": "stop",
    "removed": true
  }
}
```

失败响应示例：

```json
{
  "ok": false,
  "error": {
    "code": "LIFECYCLE_FAILED",
    "message": "Instance cannot be stopped by ccv-hub"
  }
}
```

约束：
- `stop` 向 hub 自身启动的实例发送 `SIGTERM`，短暂宽限后仍未退出则升级为 `SIGKILL`
- `force-stop` 向 hub 自身启动的实例发送 `SIGKILL`
- 手动上报实例只通过 unregister 收敛，不由 lifecycle 接口按 pid 停止
- 停止请求成功后实例退出运行列表，真实绝对路径 active 占用保留到进程退出事件收敛

### 6.7 `POST /api/instances/register`

用于接收 `cc-viewer` 插件上报的手动启动实例。

请求体：

```json
{
  "id": "/home/opc/projects/my-project:7008",
  "projectName": "my-project",
  "projectPath": "/home/opc/projects/my-project",
  "url": "http://10.0.0.212:7008?token=abc",
  "port": 7008,
  "pid": 12345,
  "source": "manual",
  "startedAt": "2026-04-22T10:00:00.000Z"
}
```

成功响应沿用 `POST /api/instances` 的 `instance` 结构。

约束：
- 只登记已启动成功的实例
- `projectPath` 按真实绝对路径归一；同一路径重复上报更新既有实例并保持 bridge 地址稳定
- `url` 由上报方提供 raw upstream 地址，Hub 对页面返回 viewer 子域名公网 bridge 地址
- `source` 默认值为 `manual`

### 6.8 `POST /api/instances/unregister`

用于接收 `cc-viewer` 插件上报的手动停止事件。

请求体：

```json
{
  "id": "/home/opc/projects/my-project:7008",
  "pid": 12345,
  "port": 7008,
  "projectPath": "/home/opc/projects/my-project"
}
```

成功响应：

```json
{
  "ok": true,
  "data": {
    "removed": true
  }
}
```

约束：
- 至少提供一个匹配字段
- 匹配成功后实例从运行列表移除
- 重复注销返回 `removed: false`

### 6.9 viewer bridge 子域名访问

用于打开 `instance.url` 指向的 cc-viewer 实例页面，HTTP、SSE 与 WebSocket 都通过 Hub Agent 反向代理到对应 upstream。

约束：
- 请求 Host 必须匹配 `CCV_HUB_VIEWER_SUBDOMAIN_PREFIX + bridgeId + CCV_HUB_PUBLIC_DOMAIN`
- 首次请求必须带有效 upstream `token` 查询参数
- 首次验证成功后，Hub bridge 设置 host-only `ccv_viewer_session` cookie，用于后续静态资源、SSE 与 WebSocket 请求
- Hub 转发时自动把 upstream token 注入目标请求，页面不负责维护 raw upstream token

## 7. 状态约定

### 7.1 对页面可见状态

- `running`

### 7.2 系统内部状态

- `starting`
- `stale`
- `removed`
- `exited`

这些状态可用于内部控制与清理，不作为 `GET /api/instances` 的页面结果返回。

## 8. 前后端责任边界

### 8.1 服务端负责

- 校验路径
- 启动实例
- 停止 hub 自身启动并持有停止句柄的实例
- 登记实例
- 接收外部实例注册与注销事件
- 过滤非运行中实例
- 按启动时间排序
- 返回统一错误结构
- 提供可覆盖 Hub 主域名和 viewer 子域名的管理员 session cookie

### 8.2 前端负责

- 渲染实例列表
- 本地执行项目名关键字筛选
- 触发打开与复制链接
- 处理空状态和错误状态展示

## 9. 验证方式

1. 请求 `GET /api/health` 可得到健康响应。
2. 启动 1 个实例后，请求 `GET /api/instances` 返回 1 条 `running` 记录。
3. 连续启动多个实例后，返回顺序符合最近启动优先。
4. 提交非法路径到 `POST /api/instances` 返回统一错误格式。
5. 实例退出后，`GET /api/instances` 不再返回该实例。
6. 外部实例注册后，`GET /api/instances` 返回带 token 的 viewer 子域名公网 bridge 地址。
7. 外部实例注销后，`GET /api/instances` 不再返回该实例。
8. Dokploy viewer 子域名路由可用时，`url` 返回公网 bridge 地址。
9. Hub bridge 访问 upstream 时自动保留或补充 token，`port` 保持 viewer 监听端口语义。
10. 无有效 token 或实例级 viewer cookie 访问 viewer 子域名 HTTP 或 WebSocket 入口返回 401。
