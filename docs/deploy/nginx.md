# Nginx 部署

Nginx 适合已有 VPS、已有证书和传统静态站点部署。

## 1. 拓扑

```text
Nginx
  |-- hub.example.com -> /var/www/ccv-hub/current
  |-- hub.example.com/api -> 127.0.0.1:4318
  |-- ccv-*.example.com -> 127.0.0.1:4318
```

Nginx 提供静态 Web、API 反代和 viewer wildcard bridge。Agent 运行在宿主机 systemd。

## 2. 使用的模板

- `deploy/nginx.hub.conf.example`
- `deploy/.env.agent.example`

Web tarball 解压建议目录：

```text
/var/www/ccv-hub/releases/vX.Y.Z
/var/www/ccv-hub/current -> /var/www/ccv-hub/releases/vX.Y.Z
```

## 3. Agent 环境

```env
CCV_HUB_HOST=127.0.0.1
CCV_HUB_PORT=4318
CCV_HUB_PUBLIC_PROTOCOL=https
CCV_HUB_PUBLIC_HOST=hub.example.com
CCV_HUB_PUBLIC_DOMAIN=example.com
CCV_HUB_PUBLIC_DOMAIN_REGEX=example\.com
CCV_HUB_VIEWER_SUBDOMAIN_PREFIX=ccv-
CCV_HUB_URL=http://127.0.0.1:4318
CCV_HUB_AGENT_PROXY_TOKEN=change-me-to-a-random-secret
```

## 4. Nginx 配置

```bash
sudo install -m 0644 deploy/nginx.hub.conf.example /etc/nginx/conf.d/ccv-hub.conf
sudo nginx -t
sudo systemctl reload nginx
```

配置需要替换：

- `hub.example.com`
- `~^ccv-[a-f0-9]{32}\.example\.com$`
- `/var/www/ccv-hub/current`
- `http://127.0.0.1:4318`

viewer bridge 必须保留：

- `proxy_http_version 1.1`
- `Upgrade` / `Connection`
- `proxy_buffering off`
- 长 `proxy_read_timeout`

## 5. 验证

```bash
sudo nginx -t
curl -fsS https://hub.example.com/api/health
curl -fsS https://hub.example.com/api/instances
```

Smoke path：

1. Hub 首页从静态目录加载。
2. `/api/health` 和 `/api/instances` 经 Nginx 到达 Agent。
3. viewer 子域名匹配 wildcard server。
4. viewer HTML、API、SSE、WebSocket 保持可用。
5. stop 后实例列表收敛。
