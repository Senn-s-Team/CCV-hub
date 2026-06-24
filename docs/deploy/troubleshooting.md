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
- release 目录必须通过 `scripts/install-agent-release.sh` 安装，安装过程会执行 `bun install --production --frozen-lockfile`。
- `Cannot find package 'fastify'` 表示当前 release 缺少 production 依赖，重新执行 `bun run deploy:service`。
- `/etc/ccv-hub/.env.agent` 权限为 `600`，属主为 `root:root`。
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
- Dokploy/Compose 容器回连宿主机 Agent 时，Agent 推荐 `CCV_HUB_HOST=0.0.0.0`，并通过防火墙阻止公网直连 `4318`。
- 防火墙只需要允许反向代理或 Web 容器访问 Agent。

## 3. 登录后仍然 401

检查：

```bash
curl -i https://<CCV_HUB_PUBLIC_HOST>/api/auth/me
curl -i -H 'content-type: application/json' -d '{"password":"change-me"}' https://<CCV_HUB_PUBLIC_HOST>/api/auth/login
```

处理：

- `CCV_HUB_AUTH_PASSWORD` 与 smoke/login 使用的密码保持一致。
- `CCV_HUB_SESSION_SECRET` 在 Agent 重启前后保持稳定。
- HTTPS 部署中 cookie 带 `Secure`，本地 HTTP smoke 使用 `CCV_HUB_PUBLIC_PROTOCOL=http`。
- 管理员 session 默认使用 host-only cookie；只有专用父域需要跨子域面板会话时才设置 `CCV_HUB_COOKIE_DOMAIN`。

## 4. Hub 首页可打开，API 失败

检查：

```bash
curl -i https://<CCV_HUB_PUBLIC_HOST>/api/health
curl -i https://<CCV_HUB_PUBLIC_HOST>/api/instances
```

处理：

- 反向代理必须把 `/api` 转发到 Agent。
- 代理必须保留 `Host`、`Upgrade`、`Connection` 与流式响应。
- Web 容器模式中 `CCV_HUB_AGENT_PROXY_TOKEN` 与 Agent 一致。

## 5. 启动实例失败

检查：

```bash
journalctl -u ccv-hub-agent -n 200 --no-pager
curl -i -H 'content-type: application/json' -d '{"projectPath":"/home/user/projects/my-project"}' https://<CCV_HUB_PUBLIC_HOST>/api/instances
```

处理：

- `projectPath` 使用绝对路径。
- 路径位于 `CCV_HUB_PATH_ROOTS` allowlist 内。
- `CCV_CLI_PATH` 可由 systemd 环境执行。
- Agent 运行用户拥有项目目录读取权限。

## 6. viewer path 404

检查：

```bash
curl -i https://<CCV_HUB_PUBLIC_HOST>/viewer/<bridgeId>/
```

处理：

- Hub 主域名指向 Web 入口。
- Caddy/Nginx/Traefik 已配置 `/viewer/` path 反代。
- `CCV_HUB_PUBLIC_HOST` 与 `CCV_HUB_VIEWER_PATH_PREFIX` 和代理规则一致。
- 实例仍在 `/api/instances` 返回列表中。

## 7. 公网返回 OpenResty/Traefik 默认 404

检查：

```bash
docker compose --env-file .env.dev -f deploy/docker-compose.hub.yml ps ccv-hub-web
docker inspect -f '{{json .Config.Labels}}' $(docker compose --env-file .env.dev -f deploy/docker-compose.hub.yml ps -q ccv-hub-web)
curl -i https://<CCV_HUB_PUBLIC_HOST>/api/health
```

处理：

- public dev、Dokploy 与 Traefik 场景使用 `deploy/docker-compose.hub.yml`。
- `traefik.enable=true`、`traefik.http.routers.ccv-hub-secure.rule=Host(...)` 与 `traefik.http.services.ccv-hub-web.loadbalancer.server.port=80` 必须出现在 active container labels 中。
- `CCV_HUB_PUBLIC_HOST` 与实际公网域名保持一致。
- `CCV_HUB_DOCKER_NETWORK` 指向 Traefik 所在 Docker network。
- 执行 `bun run deploy:dev` 让脚本清理遗留 standalone 容器并输出 label evidence。

## 8. viewer API 或 SSE 断开

检查：

```bash
curl -N https://<CCV_HUB_PUBLIC_HOST>/viewer/<bridgeId>/api/events
```

处理：

- 代理关闭 SSE buffering。
- 代理超时时间覆盖长连接。
- bridge upstream 指向的 cc-viewer 端口仍在监听。
- `Location` rewrite 后仍停留在 `/viewer/<bridgeId>` base。

## 9. viewer WebSocket 失败

检查：

```bash
wscat -c 'wss://<CCV_HUB_PUBLIC_HOST>/viewer/<bridgeId>/ws/terminal?session=smoke'
```

处理：

- 代理传递 `Upgrade` 与 `Connection` 头。
- Traefik/Caddy/Nginx 的 WebSocket 支持已启用。
- HTTPS 部署使用 `wss://`。
- Agent bridge 能访问 cc-viewer upstream 端口。

## 10. 停止实例后列表仍显示

检查：

```bash
curl -s https://<CCV_HUB_PUBLIC_HOST>/api/instances
journalctl -u ccv-hub-agent -n 200 --no-pager
```

处理：

- Hub 启动的实例使用 `/api/instances/:id/actions/stop`。
- 手动上报实例由 cc-viewer 插件发送 unregister。
- 进程退出事件到达后，registry 才完全释放 active path。


## 11. 回滚后异常

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

## 12. Agent proxy token drift

检查：

```bash
bun --env-file=.env.dev -e 'console.log(process.env.CCV_HUB_AGENT_PROXY_TOKEN ? "web-token-set" : "web-token-missing")'
bun --env-file=deploy/.env.agent.dev -e 'console.log(process.env.CCV_HUB_AGENT_PROXY_TOKEN ? "agent-dev-token-set" : "agent-dev-token-missing")'
sudo grep '^CCV_HUB_AGENT_PROXY_TOKEN=' /etc/ccv-hub/.env.agent >/dev/null && echo installed-token-set
bun run deploy:dev
```

处理：

- `.env.dev`、`deploy/.env.agent.dev` 与 `/etc/ccv-hub/.env.agent` 的 `CCV_HUB_AGENT_PROXY_TOKEN` 保持一致。
- `bun run deploy:dev` 在 preflight 阶段输出脱敏 hash 对比。
- 明确同步 dev env 到 systemd Agent 时执行 `CCV_HUB_SYNC_AGENT_ENV=1 bun run deploy:dev`。
- 同步模式会创建 `/etc/ccv-hub/.env.agent.backup-YYYYMMDD-HHMMSS`，只写入 dev redeploy 必需键并保留其他宿主机差异。

## 13. dev 部署流程失败

检查：

```bash
node --check scripts/deploy-dev-release.mjs
docker compose --env-file .env.dev -f deploy/docker-compose.hub.yml config
bun run deploy:dev
```

处理：

- `deploy:dev` 是 dev/public 稳定重新部署入口，固定执行预检、Agent 安装、显式 systemd 重启、Web image 重建、hub compose 发布、Traefik label evidence 与公网 smoke。
- `deploy:dev:service` 与 `deploy:dev:web` 作为低层兼容命令保留；service 安装阶段用 `CCV_HUB_AGENT_RESTART=0` 跳过脚本内重启，再由调用命令显式执行 `systemctl restart`。
- `dev:service` 固定加载 `deploy/.env.agent.dev`，用于源码 watch 调试。
- `dev:web` 固定加载 `.env.dev`，用于 Vite 开发代理。
- `smoke:dev` 固定加载 `deploy/.env.agent.dev`，默认验证本机 `http://127.0.0.1:4318` 的 health、auth 与 instances，并只在 dev wrapper 中从 `CCV_HUB_AUTH_PASSWORD` 派生 smoke 登录口令。
