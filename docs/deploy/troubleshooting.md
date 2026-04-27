# ccv-hub 部署故障排查

## 1. Agent 服务无法启动

检查：

```bash
systemctl status ccv-hub-agent
journalctl -u ccv-hub-agent -n 200 --no-pager
ls -l /opt/ccv-hub-agent/current
```

处理：

- `current` 必须指向存在的 release 目录。
- `/etc/ccv-hub/agent.env` 权限为 `600`，属主为 `root:root`。
- `CCV_CLI_PATH` 必须指向可执行的 cc-viewer CLI。
- `CLAUDE_CONFIG_DIR` 与 `HOME` 必须指向运行 Agent 的宿主机用户环境。

## 2. `/api/health` 失败

检查：

```bash
curl -v http://127.0.0.1:4318/api/health
ss -ltnp | grep 4318
```

处理：

- `CCV_HUB_HOST` 与 `CCV_HUB_PORT` 决定 Agent 监听地址。
- Docker Web 访问宿主机 Agent 时，`CCV_HUB_AGENT_UPSTREAM` 指向 `http://host.docker.internal:4318` 或部署机可达地址。
- 防火墙只需要允许反向代理或 Web 容器访问 Agent。

## 3. 登录后仍然 401

检查：

```bash
curl -i https://hub.example.com/api/auth/me
curl -i -H 'content-type: application/json' -d '{"password":"change-me"}' https://hub.example.com/api/auth/login
```

处理：

- `CCV_HUB_AUTH_PASSWORD` 与 smoke/login 使用的密码保持一致。
- `CCV_HUB_SESSION_SECRET` 在 Agent 重启前后保持稳定。
- HTTPS 部署中 cookie 带 `Secure`，本地 HTTP smoke 使用 `CCV_HUB_PUBLIC_PROTOCOL=http`。

## 4. Hub 首页可打开，API 失败

检查：

```bash
curl -i https://hub.example.com/api/health
curl -i https://hub.example.com/api/instances
```

处理：

- 反向代理必须把 `/api` 转发到 Agent。
- 代理必须保留 `Host`、`Upgrade`、`Connection` 与流式响应。
- Web 容器模式中 `CCV_HUB_AGENT_PROXY_TOKEN` 与 Agent 一致。

## 5. 启动实例失败

检查：

```bash
journalctl -u ccv-hub-agent -n 200 --no-pager
curl -i -H 'content-type: application/json' -d '{"projectPath":"/home/user/projects/my-project"}' https://hub.example.com/api/instances
```

处理：

- `projectPath` 使用绝对路径。
- 路径位于 `CCV_HUB_PATH_ROOTS` allowlist 内。
- `CCV_CLI_PATH` 可由 systemd 环境执行。
- Agent 运行用户拥有项目目录读取权限。

## 6. viewer 子域名 404

检查：

```bash
curl -i https://ccv-xxxx.example.com/
```

处理：

- DNS wildcard 指向 Web 入口。
- Caddy/Nginx/Traefik 已配置 viewer wildcard host。
- `CCV_HUB_PUBLIC_DOMAIN` 与 `CCV_HUB_VIEWER_SUBDOMAIN_PREFIX` 和代理规则一致。
- 实例仍在 `/api/instances` 返回列表中。

## 7. viewer API 或 SSE 断开

检查：

```bash
curl -N https://ccv-xxxx.example.com/api/events
```

处理：

- 代理关闭 SSE buffering。
- 代理超时时间覆盖长连接。
- bridge upstream 指向的 cc-viewer 端口仍在监听。
- `Location` rewrite 后仍停留在 viewer 子域名。

## 8. viewer WebSocket 失败

检查：

```bash
wscat -c 'wss://ccv-xxxx.example.com/ws/terminal?session=smoke'
```

处理：

- 代理传递 `Upgrade` 与 `Connection` 头。
- Traefik/Caddy/Nginx 的 WebSocket 支持已启用。
- HTTPS 部署使用 `wss://`。
- Agent bridge 能访问 cc-viewer upstream 端口。

## 9. 停止实例后列表仍显示

检查：

```bash
curl -s https://hub.example.com/api/instances
journalctl -u ccv-hub-agent -n 200 --no-pager
```

处理：

- Hub 启动的实例使用 `/api/instances/:id/actions/stop`。
- 手动上报实例由 cc-viewer 插件发送 unregister。
- 进程退出事件到达后，registry 才完全释放 active path。

## 10. 回滚后异常

检查：

```bash
ls -l /opt/ccv-hub-agent/releases
ls -l /opt/ccv-hub-agent/current
systemctl status ccv-hub-agent
bun run smoke:release
```

处理：

- Agent 回滚只切换 `current` symlink 并重启 systemd。
- Web 回滚只切换 image tag 或静态目录 symlink。
- 回滚后立即运行 health、instances、viewer bridge smoke。
