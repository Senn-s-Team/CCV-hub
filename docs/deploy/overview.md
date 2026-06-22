# ccv-hub 开源部署总览

## 1. 目标

`ccv-hub` 的开源部署目标是让用户可以在任意自托管环境中部署公网控制面，同时保留本机 Claude Code、项目目录、`cc-viewer` 动态端口与进程生命周期控制能力。

最终形态采用稳定的二层模型：

```text
Browser
  |
  v
Public Web Entry
  |
  v
ccv-hub-web
  |
  v
ccv-hub-agent on host
  |
  v
cc-viewer instances on host
```

## 2. 核心角色

### 2.1 `ccv-hub-web`

`ccv-hub-web` 是公网控制面，负责静态页面、同域 API 入口、viewer path 入口与边缘反代配置。

它可以运行在 Docker、Dokploy、Kubernetes、传统 Nginx/Caddy 静态站或本地开发服务器中。它不持有宿主机 Claude 配置、不读取项目源码、不直接启动 `cc-viewer`。

### 2.2 `ccv-hub-agent`

`ccv-hub-agent` 是本机能力代理，当前代码位置仍是 `apps/hub-service`。它负责读取宿主机项目目录、继承 Claude Code 用户环境、启动 `cc-viewer`、在显式启用后按 `CCV_LOG_DIR` 或 `CLAUDE_CONFIG_DIR` 把带受管标记的 Hub 插件同步到 cc-viewer 用户插件目录、维护运行中实例注册表、停止自身启动的实例、反代动态 viewer 端口。

它默认运行在宿主机 systemd 中，因为这些能力天然属于宿主机。

### 2.3 平台适配器

平台适配器负责把公网入口接到 `ccv-hub-web` 与 `ccv-hub-agent`。官方适配器应覆盖 Local、Docker Compose、Dokploy、Caddy、Nginx，Kubernetes 作为高级场景保留。

## 3. 默认推荐拓扑

开源 release 的主路径是 Docker Compose 或 Dokploy 部署 `ccv-hub-web`，宿主机 systemd 部署 `ccv-hub-agent`。

```text
Browser
  |
  v
Traefik / Nginx / Caddy
  |
  v
ccv-hub-web container or static site
  |  /api and /viewer/* paths
  v
127.0.0.1:4318 or host.docker.internal:4318
  |
  v
ccv-hub-agent systemd service
  |
  v
cc-viewer per project process
```

这条边界保留了容器部署的便利，也避免把 `~/.claude`、项目源码、宿主机进程控制权塞进公网容器。

## 4. 当前 dev 部署与开源部署差距

当前 dev 部署已经验证了 Dokploy + Traefik + nginx + host service 的公网链路，但仍带有私有环境假设：

- Web 与 Agent 域名绑定来自 `.env`、`.env.dev`、`/etc/ccv-hub/.env.agent` 或平台环境变量面板。
- `4317`、`4318`、`/home/opc/projects/ccvs`、`/home/opc/.claude`、`/etc/ccv-hub` 与 `dokploy-network` 绑定当前机器。
- `hub-service` 当前 systemd 以 `tsx src/server.ts` 运行源码。
- `hub-web` 当前 release 入口仍偏向现场 build 与 dev 域名。
- Docker 化 `hub-service` 会引入 Claude 配置挂载、项目路径一致性、host network、PID 可见性和信号控制问题。

## 5. 设计原则

- Web 层可替换，Agent 层稳定掌握宿主机能力。
- 平台适配可以增加，Agent 协议保持统一。
- 正式 release 使用 tag 化镜像、tag 化 agent artifact、固定配置模板和可回滚部署目录。
- 所有域名、端口、路径、token、viewer path 前缀都来自环境变量或模板。
- `ccv-hub-agent` 对公网只暴露经过反代保护的 API 与 viewer bridge。
- `~/.claude`、项目源码和 Claude 登录态只留在宿主机。

## 6. 安全边界

入口分三层令牌或会话：

```text
User -> Hub Web/API: password and session
Web proxy -> Agent: agent proxy token
User -> Viewer: per-instance viewer token
```

生产环境要求：

- agent 监听端口默认按部署模式收口：本机反代使用 `127.0.0.1`，Dokploy/Compose 容器回连使用 `0.0.0.0` 与受控 host gateway。
- 防火墙阻止公网直连 agent 端口。
- `/etc/ccv-hub/.env.agent` 使用 `0600` 权限。
- viewer path 通过 bridge id 与 token 访问具体 upstream。
- 路径浏览严格受 `CCV_HUB_PATH_ROOTS` 限制。

## 7. 命名策略

对外产品命名采用：

```text
ccv-hub-web    = dashboard / public entry
ccv-hub-agent  = local machine capability daemon
cc-viewer      = per-project viewer
```

代码可以逐步从 `hub-service` 过渡到 `agent` 命名。文档优先使用 `agent` 表达真实职责。

## 8. 成功标准

- 用户可以不使用 Dokploy 完成部署。
- Docker Compose + systemd Agent 成为通用自托管主路径。
- Dokploy 文档成为平台适配说明。
- Caddy/Nginx 提供可复制的官方样例。
- release 产物包含 Web 镜像、Agent tarball、systemd unit、反代模板和环境变量模板。
- 任何平台部署都复用同一套 Agent API 与 viewer bridge 行为。
