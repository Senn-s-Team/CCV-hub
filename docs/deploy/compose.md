# Docker Compose 部署

Docker Compose 是 ccv-hub 的默认开源自托管路径。

## 1. 拓扑

```text
Docker Compose: ccv-hub-web image
  |
  v
Host systemd: ccv-hub-agent
  |
  v
Host process: cc-viewer
```

Web 容器只承载静态页面、`/api` 代理和 viewer 子域名入口。Agent 保持宿主机 systemd 运行，继续使用宿主机 Claude 配置、项目目录和 `cc-viewer` CLI。

## 2. 产物

- `ccv-hub-web:vX.Y.Z`
- `ccv-hub-agent-vX.Y.Z.tar.gz`
- `deploy/docker-compose.standalone.yml`
- `.env.example`
- `deploy/.env.agent.example`

## 3. Agent 安装

```bash
sudo tar -xzf ccv-hub-agent-vX.Y.Z.tar.gz -C /opt/ccv-hub-agent/releases/vX.Y.Z
sudo ln -sfn /opt/ccv-hub-agent/releases/vX.Y.Z /opt/ccv-hub-agent/current
sudo install -m 0600 deploy/.env.agent.example /etc/ccv-hub/.env.agent
sudo install -m 0644 deploy/ccv-hub-agent.service /etc/systemd/system/ccv-hub-agent.service
sudo systemctl daemon-reload
sudo systemctl enable --now ccv-hub-agent
```

`/etc/ccv-hub/.env.agent` 必填：

```env
CCV_HUB_HOST=0.0.0.0
CCV_HUB_PORT=4318
CCV_HUB_PUBLIC_PROTOCOL=https
CCV_HUB_PUBLIC_HOST=hub.example.com
CCV_HUB_PUBLIC_DOMAIN=example.com
CCV_HUB_PUBLIC_DOMAIN_REGEX=example\.com
CCV_HUB_VIEWER_SUBDOMAIN_PREFIX=ccv-
CCV_HUB_AGENT_PROXY_TOKEN=change-me-to-a-random-secret
CCV_HUB_AUTH_PASSWORD=change-me
CCV_HUB_SESSION_SECRET=change-me-to-a-long-random-secret
CCV_HUB_PATH_ROOTS=/home/user/projects
CCV_CLI_PATH=/opt/cc-viewer/current/cli.js
CLAUDE_CONFIG_DIR=/home/user/.claude
HOME=/home/user
```

## 4. Web 启动

正式环境使用 `.env` 保存 release Web 变量；开发环境使用 `.env.dev`。宿主机 Agent 使用 `/etc/ccv-hub/.env.agent`，从 `deploy/.env.agent.example` 初始化。

```bash
cp -n .env.example .env
$EDITOR .env

docker compose --env-file .env -f deploy/docker-compose.standalone.yml up -d
```

`.env` 必填：

```env
CCV_HUB_WEB_IMAGE=ccv-hub-web:vX.Y.Z
CCV_HUB_WEB_PORT=4317
CCV_HUB_AGENT_UPSTREAM=http://host.docker.internal:4318
CCV_HUB_PUBLIC_PROTOCOL=https
CCV_HUB_PUBLIC_HOST=hub.example.com
CCV_HUB_PUBLIC_DOMAIN=example.com
CCV_HUB_PUBLIC_DOMAIN_REGEX=example\.com
CCV_HUB_VIEWER_SUBDOMAIN_PREFIX=ccv-
```

上游反代把 `https://hub.example.com` 和 `https://ccv-*.example.com` 转发到宿主机 `${CCV_HUB_WEB_PORT}`。

## 5. 验证

```bash
docker compose --env-file .env.example -f deploy/docker-compose.standalone.yml config
docker compose --env-file .env -f deploy/docker-compose.standalone.yml config
curl -fsS http://127.0.0.1:4318/api/health
curl -fsS http://127.0.0.1:4317/api/health
```

Smoke path：

1. Hub 首页加载。
2. `/api/health` 返回成功。
3. `/api/instances` 返回统一结构。
4. 合法路径启动 `cc-viewer`。
5. viewer 子域名加载 HTML、JS、CSS。
6. viewer API、SSE、WebSocket 可用。
7. stop 后实例列表收敛。
