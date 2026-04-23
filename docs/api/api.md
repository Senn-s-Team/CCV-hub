# ccv-hub 接口契约

## 1. 文档目的

本文定义 `ccv-hub` 自用 MVP 的本地服务接口契约，目标是固定网页、CLI 和本地服务之间的数据格式与调用边界。本文只覆盖 MVP 必需接口，不展开鉴权、远程调用和高级控制能力。

## 2. 接口边界

### 2.1 范围内

- 运行中实例列表读取
- 启动新实例
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
- 错误返回格式统一，便于网页直接展示

## 4. 实例对象

### 4.1 Instance

```json
{
  "id": "ins_01HXYZ...",
  "projectName": "my-project",
  "projectPath": "/home/opc/projects/my-project",
  "url": "https://ccv.example.com/view/9f3a...",
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
- `url`: 最佳可打开地址，优先返回公网代理地址；在公网暴露不可用时可回退为本地地址
- `port`: 实例本机监听端口，用于诊断、回退与路由桥接
- `pid`: 实例进程号
- `status`: 第一版固定返回 `running`
- `source`: 实例来源，第一版至少支持 `launcher`
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
        "url": "https://ccv.example.com/view/9f3a...",
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
- `url` 优先返回公网可打开地址，公网暴露未就绪时可返回本地地址

### 6.3 `POST /api/instances`

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
      "url": "https://ccv.example.com/view/9f3a...",
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
- 输入路径必须是绝对路径
- 启动成功后才返回 `instance`
- 半状态实例不得返回给页面
- 返回的 `instance.url` 应与当前可打开地址保持一致，优先使用公网路径路由地址

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
- 登记实例
- 过滤非运行中实例
- 按启动时间排序
- 返回统一错误结构

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
6. Dokploy 路径路由可用时，`url` 返回公网地址。
7. Dokploy 路径路由不可用时，`url` 可回退为本地地址，`port` 保持本机监听端口语义。
