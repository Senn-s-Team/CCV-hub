# Dokploy 部署

Dokploy 是 Docker Compose 部署的 Traefik 平台适配。

## 1. 拓扑

```text
Dokploy / Traefik
  |
  v
ccv-hub-web container
  |
  v
host ccv-hub-agent systemd
  |
  v
host cc-viewer process
```

Dokploy 管理 Web 容器、主域名和 viewer wildcard 路由。Agent 继续由宿主机 systemd 管理。

## 2. 使用的模板

- `deploy/docker-compose.hub.yml`
- `.env.example`
- `deploy/.env.agent.example`

`.env.example` 对应 Dokploy/Web 变量；`deploy/.env.agent.example` 对应宿主机 `/etc/ccv-hub/.env.agent`。

`deploy/docker-compose.hub.yml` 已包含：

- `host.docker.internal:host-gateway`
- Hub 主域名 Traefik router
- viewer 子域名 HostRegexp router
- viewer router 低优先级
- HTTP 入口统一 redirect 到 HTTPS
- 可覆盖 Dokploy 网络名 `${CCV_HUB_DOCKER_NETWORK}`

## 3. Dokploy 变量

`.env.example` 中的同名变量可以直接填入 Dokploy 环境变量面板：

```env
CCV_HUB_WEB_IMAGE=ccv-hub-web:vX.Y.Z
CCV_HUB_WEB_PORT=4317
CCV_HUB_DOCKER_NETWORK=dokploy-network
CCV_HUB_AGENT_UPSTREAM=http://host.docker.internal:4318
CCV_HUB_PUBLIC_PROTOCOL=https
CCV_HUB_PUBLIC_HOST=hub.example.com
CCV_HUB_PUBLIC_DOMAIN=example.com
CCV_HUB_VIEWER_SUBDOMAIN_PREFIX=ccv-
```

Agent 的 `/etc/ccv-hub/.env.agent` 使用同一组公网域名、viewer 前缀和 `CCV_HUB_AGENT_PROXY_TOKEN`。Dokploy 容器通过 `host.docker.internal:4318` 回连宿主机 Agent，Agent 需要监听容器可达地址，推荐 `CCV_HUB_HOST=0.0.0.0` 并用防火墙阻止公网直连 `4318`。

## 4. 域名

DNS 需要指向 Dokploy/Traefik 入口：

```text
hub.example.com
ccv-*.example.com
```

Traefik router 规则：

```text
Host(`hub.example.com`)
HostRegexp(`^ccv-[a-f0-9]{32}[.]example.com$`)
```

## 5. 验证

```bash
docker compose --env-file .env.example -f deploy/docker-compose.hub.yml config
curl -fsS https://hub.example.com/api/health
curl -fsS https://hub.example.com/api/instances
```

Smoke path：

1. Dokploy 首页域名打开 Hub。
2. `/api/instances` 经 Web 容器到达 Agent。
3. 新启动实例生成 `ccv-<id>.example.com` viewer URL。
4. viewer 子域名经 Traefik 进入 Web nginx，再进入 Agent bridge。
5. SSE 与 WebSocket 保持长连接。
