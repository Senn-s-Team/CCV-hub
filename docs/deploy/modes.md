# ccv-hub 部署模式拆分

## 1. Local Mode

Local Mode 面向个人开发机、本机试用和开发联调。

运行形态：

```text
localhost web
  |
  v
localhost agent
  |
  v
local cc-viewer
```

职责：

- 直接运行 `hub-web` 开发服务器或静态构建产物。
- 直接运行 `ccv-hub-agent`。
- 使用本机 `~/.claude`、项目目录和 `cc-viewer` CLI；启用 `CCV_HUB_PLUGIN_AUTO_INSTALL=1` 后由 Agent 同步 Hub 插件以发现 logger 模式实例。

验收：

- `GET /api/health` 返回成功。
- 页面能读取运行中实例。
- 页面能启动合法路径下的 `cc-viewer`。
- viewer 页面、API、SSE、WebSocket 全部通过本地地址可用。

## 2. Docker Compose Mode

Docker Compose Mode 是开源自托管主路径，详见 `compose.md`。

运行形态：

```text
Docker Compose: ccv-hub-web
Host systemd: ccv-hub-agent
Host process: cc-viewer
```

职责：

- Compose 启动 image-only Web 容器。
- systemd 启动 Agent。
- Web 容器通过 `host.docker.internal` 或宿主机网关访问 Agent。

模板：

- `deploy/docker-compose.standalone.yml`
- `deploy/.env.agent.example`

必需配置：

- `CCV_HUB_PUBLIC_HOST`
- `CCV_HUB_PUBLIC_DOMAIN`
- `CCV_HUB_PUBLIC_DOMAIN_REGEX`
- `CCV_HUB_VIEWER_SUBDOMAIN_PREFIX`
- `CCV_HUB_AGENT_UPSTREAM`
- `CCV_HUB_AGENT_PROXY_TOKEN`

验收：

- Web 容器无需挂载项目源码。
- Web 容器无需挂载 `~/.claude`。
- Agent 可以启动、停止和收敛 `cc-viewer` 实例；启用 `CCV_HUB_PLUGIN_AUTO_INSTALL=1` 后也可以列出 logger 插件上报的运行中实例。
- viewer 子域名通过 Compose Web 入口或上游边缘代理转发到 Agent bridge。

## 3. Dokploy Mode

Dokploy Mode 是 Docker Compose Mode 的 Traefik 平台适配，详见 `dokploy.md`。

运行形态：

```text
Dokploy / Traefik
  |
  v
ccv-hub-web container
  |
  v
host ccv-hub-agent
```

职责：

- Dokploy 拉取 GitHub repo 或使用官方 Web 镜像。
- Traefik 管理主域名和 viewer wildcard 子域名。
- Agent 由宿主机 systemd 安装。

模板：

- `deploy/docker-compose.hub.yml`
- `deploy/.env.agent.example`

平台差异：

- 使用 Dokploy 网络名或 labels。
- 处理 `host.docker.internal:host-gateway`。
- 给 `ccv-*` viewer HostRegexp 设置低优先级路由。

验收：

- Hub 首页可通过 Dokploy 域名访问。
- `/api/instances` 经 Web 容器反代到 Agent。
- viewer 子域名经 Traefik 和 nginx 进入 Agent bridge。
- WebSocket upgrade 和 SSE 连接保持畅通。

## 4. Caddy Mode

Caddy Mode 面向希望自动 HTTPS 和最少配置的自托管用户，详见 `caddy.md`。

运行形态：

```text
Caddy
  |-- hub.example.com -> static web and /api proxy
  |-- ccv-*.example.com -> agent bridge
```

职责：

- Caddy 提供 HTTPS 与 wildcard 路由。
- Web 静态资源来自 tarball 或 Web 容器。
- Agent 保持宿主机 systemd。

模板：

- `deploy/Caddyfile.example`
- `deploy/.env.agent.example`

验收：

- 主域名自动签发证书。
- viewer wildcard 域名证书配置明确。
- `/api` 与 viewer bridge 均转发到 Agent。

## 5. Nginx Mode

Nginx Mode 面向传统 VPS、已有 Nginx 和 Certbot 的用户，详见 `nginx.md`。

运行形态：

```text
Nginx
  |-- / -> hub-web dist
  |-- /api -> 127.0.0.1:4318
  |-- ccv-*.domain -> 127.0.0.1:4318
```

职责：

- Nginx 服务静态资源。
- Nginx 处理 API 与 viewer bridge 反代。
- 用户自行管理 TLS 证书。

模板：

- `deploy/nginx.hub.conf.example`
- `deploy/.env.agent.example`

验收：

- `proxy_http_version 1.1`、`Upgrade`、`Connection`、`proxy_buffering off` 已配置。
- SSE 与 WebSocket 可持续连接。
- viewer wildcard server_name 与 `CCV_HUB_VIEWER_SUBDOMAIN_PREFIX` 一致。

## 6. Kubernetes Mode

Kubernetes Mode 是团队和高级用户场景，详见 `kubernetes.md`。

推荐边界：

```text
Kubernetes: ccv-hub-web, service, ingress, config
Host node: ccv-hub-agent
```

模板：

- `deploy/kubernetes-web.yaml`
- `deploy/.env.agent.example`

Agent 的默认形态是节点 systemd。DaemonSet Agent 是高级方向，需要每个节点都有 Claude Code 环境、项目目录、`cc-viewer` CLI 和明确的路径授权。

验收：

- Ingress 支持 Hub 主域名和 viewer wildcard。
- Web pod 可以访问目标节点上的 Agent endpoint。
- 调度策略能保证 Web 控制的 Agent 与目标宿主机匹配。

## 7. Advanced All-in-Docker Mode

Advanced All-in-Docker Mode 面向明确接受宿主机能力授权的高级用户。

需要能力：

- `network_mode: host`
- 挂载 `~/.claude`
- 挂载项目目录，且容器内路径与宿主机路径一致
- 挂载 `cc-viewer` CLI 或安装同版本 CLI
- 使用宿主机用户 UID/GID
- 可能需要 PID 可见性以改善 stop 行为

它能减少 systemd 依赖，同时会显著扩大容器权限面。

## 8. 官方支持优先级

第一批：

1. Local Mode
2. Docker Compose Mode
3. Dokploy Mode
4. Caddy Mode
5. Nginx Mode

第二批：

1. Kubernetes Mode
2. Advanced All-in-Docker Mode
