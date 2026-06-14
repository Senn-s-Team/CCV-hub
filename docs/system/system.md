# ccv-hub 系统设计

## 1. 文档目的

本文定义 `ccv-hub` 自用 MVP 的系统设计，目标是明确系统由哪些组件构成、每个组件负责什么、实例如何启动和登记、页面如何读取运行中实例，以及异常情况下系统如何收敛。本文只覆盖 MVP 必需的系统边界，不展开后续扩展能力。

## 2. 系统目标与边界

### 2.1 系统目标

- 在本机汇总当前正在运行的 `cc-viewer` 实例
- 通过 `ccv-hub` 统一入口启动新实例
- 保证同一真实绝对路径只存在一个 active `cc-viewer` 实例
- 让启动弹窗在服务端 allowlist 内选择宿主机项目路径
- 让启动弹窗保留浏览器本地最近使用路径并筛选当前目录列表
- 让总览页读取实例列表并支持打开、复制、筛选和停止 hub 启动的实例
- 在实例退出或被停止后，从运行中列表中移除

### 2.2 系统边界

- 单机运行
- 不修改 `cc-viewer` 源码
- `cc-viewer` 继续负责单实例内容展示
- `ccv-hub` 负责实例启动入口、宿主机路径选择、实例登记、实例列表、hub 启动实例停止、总览页和 viewer 子域名桥接
- 第一版不覆盖远程机器、历史实例和复杂生命周期管理

## 3. 组件划分

### 3.1 CLI 启动器

`ccv-hub` 命令作为统一入口启动器，负责接收项目路径、触发 `cc-viewer` 启动，并把新实例交给本地服务登记。

### 3.2 本地常驻服务

本地服务是系统的协调中心，负责维护运行中实例目录、更新实例状态、向网页暴露本地接口，并在实例退出后清理列表。

### 3.3 实例注册表

实例注册表是当前运行实例的真相源，保存实例基础元数据，并为总览页提供稳定的数据读取来源。

### 3.4 Web 总览页

Web 总览页负责展示运行中实例列表，提供筛选、打开、复制链接和“启动新实例”交互。

## 4. 组件职责

### 4.1 CLI 启动器职责

- 接收项目路径
- 校验路径是否可用于启动
- 启动目标 `cc-viewer` 实例
- 获取启动后的实例元数据
- 将实例元数据提交给本地服务

### 4.2 本地服务职责

- 维护运行中实例集合
- 提供 allowlist 内宿主机路径浏览接口
- 提供实例查询接口
- 提供实例登记接口
- 提供实例生命周期停止接口
- 提供实例移除或状态收敛逻辑
- 在网页读取失败时提供明确错误边界

### 4.3 实例注册表职责

- 保存实例 `id`
- 保存项目名和项目路径
- 保存公网 `url`、内部 upstream URL、`port`、`pid`
- 保存 `status`、`source`
- 保存 `startedAt`、`lastSeen`

### 4.4 Web 总览页职责

- 读取本地服务返回的实例列表
- 默认按最近启动时间降序展示
- 按项目名关键字筛选
- 触发打开、复制链接和停止动作
- 通过路径输入弹窗请求启动新实例
- 在启动弹窗内读取常用根目录、浏览宿主机目录、筛选当前目录列表并使用浏览器本地最近路径

## 5. 运行流程

### 5.1 启动新实例流程

用户在总览页点击“启动新实例” → 输入项目路径、选择最近路径或从宿主机目录浏览器选择路径 → 网页将启动请求发送给本地服务 → 本地服务把路径归一为真实绝对路径并检查 active 实例 → 已存在则返回现有实例 → 未存在则调用 `ccv-hub` 启动逻辑 → `cc-viewer` 启动成功 → 本地服务登记实例 → 新实例出现在总览页，路径写入浏览器本地最近路径

### 5.2 加载实例列表流程

用户打开总览页 → 网页向本地服务请求运行中实例列表 → 本地服务从实例注册表读取当前实例 → 返回给网页 → 网页按最近启动时间排序后渲染列表

### 5.3 打开实例流程

用户在列表中点击打开 → 网页使用实例公网子域名在新标签页打开目标 `cc-viewer` 页面 → Hub bridge 按 Host 反代到内部 upstream

### 5.4 复制链接流程

用户在列表中点击复制链接 → 网页复制当前实例链接到剪贴板

### 5.5 停止实例流程

用户在列表中点击停止 → 网页向本地服务发送生命周期停止请求 → 本地服务确认实例仍在运行且持有可信停止句柄 → 本地服务向自身启动的 `cc-viewer` 子进程发送终止信号 → 实例从运行中列表移除并释放该路径的 active 占用

### 5.6 实例退出流程

`cc-viewer` 实例退出 → 本地服务感知退出或检测心跳失效 → 实例状态收敛为不可用 → 该实例从运行中列表移除

## 6. 数据流

```text
用户
  |
  | 启动新实例 / 查看列表 / 打开 / 复制 / 停止
  v
Web 总览页
  |
  | 本地请求
  v
本地常驻服务
  |\
  | \-- 维护实例注册表
  |
  \---- 调用 ccv-hub 启动器
            |
            v
         cc-viewer 实例
```

## 7. 运行时状态

### 7.1 starting

实例已收到启动请求，尚未完成可访问登记。

### 7.2 running

实例已成功启动并处于可访问状态。

### 7.3 stopping

实例已收到停止信号，仍保留路径占用，直到进程退出事件完成收敛。

### 7.4 stale

实例曾被登记，但当前状态已超时或心跳失效。第一版中该状态是内部过渡状态，用于帮助系统移除脏实例。

### 7.5 removed

实例已从运行中列表移除，不再对总览页可见。

## 8. 数据模型

实例注册表以真实绝对 `projectPath` 作为 active 实例唯一键；启动中的同路径请求共享同一个 pending 启动结果，`exited`、`stale` 与 `removed` 会释放该路径。

第一版实例对象建议包含以下字段：

- `id`
- `projectName`
- `projectPath`
- `url`
- `port`
- `pid`
- `status`
- `source`
- `startedAt`
- `canStop`

其中：
- `startedAt` 用于默认排序
- `lastSeen` 用于状态收敛
- `source` 用于页面展示实例来源
- `canStop` 用于标记 Hub 是否持有可信停止句柄

## 9. 异常处理

### 9.1 路径无效

输入路径不存在、不可访问或不满足启动条件时，启动请求直接失败，并向网页返回明确错误。

### 9.2 宿主机路径读取失败

路径浏览请求越过 allowlist、命中不可读目录或触发符号链接逃逸时，本地服务返回失败结果，网页在启动弹窗内保留当前输入并展示错误。

### 9.3 启动失败

`cc-viewer` 无法启动时，本地服务返回失败结果，网页在启动弹窗中展示失败状态。

### 9.4 登记失败

实例成功启动但登记失败时，本地服务应避免把半状态实例暴露给页面，并返回可理解错误。

### 9.5 链接失效

页面尝试打开的实例链接无效时，网页应保留该实例当前显示状态，并提示刷新或等待状态收敛。

### 9.6 异常退出

实例异常退出时，本地服务需要在可接受时间内把该实例从运行列表移除，避免长期脏数据。

## 10. 公网暴露设计

### 10.1 当前状态

公网 viewer 子域名桥接已进入当前实现并完成 2026-04-25 实机验证。在保持单机实例发现模型不变的前提下，Hub 已能为运行中的 `cc-viewer` 实例生成可公网访问的 viewer 子域名地址，并接入本机已有的 Dokploy + Traefik 路由体系。

### 10.2 设计原则

- 实例发现仍然限定在单机范围
- 公网地址生成由 `ccv-hub` 服务端根据实例 id 与 upstream token 统一负责
- `ccv-hub` 对页面只暴露公网 viewer 子域名，对服务端保留内部 upstream 地址
- Dokploy 作为统一公网入口，不为每个实例单独创建部署对象
- Dokploy 只管理 Web 容器，Hub service 由宿主机 systemd 承载
- Hub service 运行在宿主机用户环境中，负责以真实系统环境启动 `cc-viewer`
- 地址形态固定为 viewer 子域名，例如 `https://ccv-<bridgeId>.paas.996667.xyz/?token=<token>`

### 10.3 组件职责补充

#### 10.3.1 `cc-viewer` 插件层

启用 `CCV_HUB_PLUGIN_AUTO_INSTALL=1` 后，Hub service 启动时把带 `[CCV_HUB_MANAGED_PLUGIN]` 标记的 `deploy/ccv-hub-plugin.mjs` 同步到 `CCV_LOG_DIR/plugins/` 或 `CLAUDE_CONFIG_DIR/cc-viewer/plugins/`；若同名文件没有受管标记则保留用户自定义插件。`cc-viewer` 在服务启动后通过现有插件钩子把 raw upstream URL、端口、token 与项目路径上报给 Hub；Hub 生成公网 viewer 子域名并维护 bridge 映射。

#### 10.3.2 Hub viewer bridge

Hub service 内置 viewer bridge，由宿主机 systemd 以 `opc` 用户运行并监听 `0.0.0.0:4318`，按 `ccv-*` 子域名 Host 查找实例注册表，并把 HTTP/SSE/WebSocket 转发到对应 `cc-viewer` upstream。Dokploy/Web 容器通过 `host.docker.internal:4318` 回连该服务；这个混合边界用于保留唯一宿主机 Claude 环境。

#### 10.3.3 `ccv-hub` 本地服务与页面

`ccv-hub` 继续维护单机实例注册表，但实例对象中的 `url` 语义升级为“最佳可打开地址”，因此可以直接展示公网代理地址。

### 10.4 运行流程补充

#### 10.4.1 公网地址生成流程

用户在 Hub 页面选择项目 → 宿主机 `ccv-hub-service` 以 `opc` 用户环境启动 `ccv` → `cc-viewer` 绑定端口并生成访问 token → Hub 生成 `https://ccv-<bridgeId>.paas.996667.xyz/?token=<token>` → `ccv-hub` 登记并展示该地址

用户在任意项目通过 logger hook 使用 `claude` 或手动启动 `ccv` → `cc-viewer` 插件在 `serverStarted` 阶段把 raw upstream 注册到 Hub → Hub 生成公网 viewer 子域名 → `ccv-hub` 登记并展示该地址

#### 10.4.2 实例停止流程

`cc-viewer` 实例退出 → 插件在 `serverStopping` 阶段注销 Hub 映射 → Hub bridge 停止解析该 viewer 子域名 → `ccv-hub` 把该实例从运行中列表移除

### 10.5 关键复用点

- `cc-viewer/server.js:2474` — `/api/local-url` 作为分享地址出口
- `cc-viewer/server.js:2938` — `serverStarted` hook 作为路由注册时机
- `cc-viewer/server.js:3254` — `serverStopping` hook 作为路由清理时机
- `cc-viewer/lib/plugin-loader.js:11` — 已有 `localUrl`、`serverStarted`、`serverStopping` hook 定义
- `ccv-hub/prototype/docker-compose.yml` — 已有 Dokploy + Traefik 网络接入模式

### 10.6 验证基线与后续观察

2026-04-25 实机验证已确认 Dokploy / Traefik viewer 子域名可以路由到 Hub bridge，Web 容器可以通过 `host.docker.internal:4318` 回连宿主机 Hub service，Hub bridge 可以访问宿主机动态启动的 `cc-viewer` upstream，viewer 页面静态资源、业务 API、SSE 与 WebSocket 均可用。

后续观察项集中在安全与运维边界：viewer URL token 暴露面、重复 `token` 查询参数、结构化日志、健康信息细化，以及 Dokploy / Traefik / nginx 路由变更后的回归验证。

## 11. 关键约束

- 单机范围内运行
- 本地服务持有运行实例真相源
- 第一版只面向运行中实例
- 默认排序规则固定为最近启动优先
- 不为 MVP 添加历史视图、详情页或复杂控制流
- 公网暴露不改变实例发现边界，只改变实例可打开地址
- Dokploy 路由层故障时，实例仍应保持本地可访问

## 12. 验证方式

1. 通过 `ccv-hub` 启动 1 个项目后，总览页出现该实例。
2. 连续启动多个项目后，总览页可同时展示多个实例。
3. 列表默认按最近启动时间降序排列。
4. 点击打开可进入正确实例页面。
5. 点击复制链接可得到正确地址。
6. 输入非法路径时，启动弹窗展示明确错误。
7. 实例退出后，列表在可接受时间内更新。
8. `GET /api/instances` 返回 viewer 子域名公网地址。
9. 通过 viewer 子域名公网地址访问实例时，HTML、静态资源、业务 API、SSE 与 WebSocket 行为保持正常。
10. Hub 页面启动的 `cc-viewer` 继承宿主机 `opc` 用户环境，命令解析与宿主机 terminal 保持一致。
11. Dokploy / Traefik / nginx 路由变更后，按 `progress.md` 中的公网 viewer 链路验证基线回归。
12. Dokploy bridge 不可用时，内部 upstream 仍可用于服务端诊断与存活收敛。
