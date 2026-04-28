# Caddy 部署

Caddy 适合希望自动 HTTPS 和少量配置的 VPS 部署。

## 1. 拓扑

```text
Caddy
  |-- hub.example.com -> ccv-hub-web static or container
  |-- ccv-*.example.com -> host ccv-hub-agent bridge
```

Caddy 负责 TLS、主域名和 viewer wildcard。Agent 运行在宿主机 systemd。

## 2. 使用的模板

- `deploy/Caddyfile.example`
- `deploy/.env.agent.example`

Web 可以使用两种入口：

1. Web image 运行在 `127.0.0.1:4317`。
2. Web tarball 解压到 `/var/www/ccv-hub/current`。

## 3. Agent 环境

```env
CCV_HUB_HOST=127.0.0.1
CCV_HUB_PORT=4318
CCV_HUB_PUBLIC_PROTOCOL=https
CCV_HUB_PUBLIC_HOST=hub.example.com
CCV_HUB_PUBLIC_DOMAIN=example.com
CCV_HUB_PUBLIC_DOMAIN_REGEX=example\.com
CCV_HUB_VIEWER_SUBDOMAIN_PREFIX=ccv-
CCV_HUB_AGENT_PROXY_TOKEN=change-me-to-a-random-secret
```

## 4. Caddy 配置

复制 `deploy/Caddyfile.example` 到 `/etc/caddy/Caddyfile`，替换：

- `hub.example.com`
- `*.example.com`
- `/var/www/ccv-hub/current`
- `127.0.0.1:4318`

Caddy 的 wildcard HTTPS 需要 DNS challenge。使用普通 HTTP 或内部网络测试时，可以先只启用主域名。

## 5. 验证

```bash
caddy adapt --config deploy/Caddyfile.example
curl -fsS https://hub.example.com/api/health
```

Smoke path：

1. Hub 主域名证书生效。
2. `/api/health` 经 Caddy 转发到 Agent。
3. viewer wildcard 域名证书生效。
4. viewer HTML、API、SSE、WebSocket 经 Caddy 到达 Agent bridge。
