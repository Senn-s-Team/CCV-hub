# ccv-hub release 验证清单

## 1. 目标

把每次 release 的构建、部署、验证和回滚演练收敛为同一组可重复动作。清单覆盖 Web 控制面、宿主机 Agent、viewer bridge 和平台模板。

## 2. Release 前检查

1. 固定版本号：`vX.Y.Z`。
2. 安装依赖：`bun install --frozen-lockfile`。
3. 类型与测试：`bun run lint && bun run test && bun run build`。
4. 打包 Web：`bun run release:web -- vX.Y.Z`。
5. 打包 Agent：`bun run release:agent -- vX.Y.Z`。
6. 构建 Web image：`docker build -f apps/hub-web/Dockerfile -t ccv-hub-web:vX.Y.Z .`。
7. 生成 checksums：`sha256sum build/*vX.Y.Z* > build/checksums.txt`。

## 3. 模板验证

```bash
docker compose --env-file .env.example -f deploy/docker-compose.hub.yml config
docker compose --env-file .env.example -f deploy/docker-compose.standalone.yml config
caddy adapt --config deploy/Caddyfile.example
nginx -t
kubectl apply --dry-run=client -f deploy/kubernetes-web.yaml
```

`.env.example` 只用于模板完整性验证；正式 Docker Compose 使用 `.env`，Dokploy 使用平台环境变量面板。Nginx 验证使用部署机的站点目录，把 `deploy/nginx.hub.conf.example` 渲染为实际 server 配置后执行。

## 4. Agent 验证

```bash
sudo ./scripts/install-agent-release.sh build/ccv-hub-agent-vX.Y.Z.tar.gz vX.Y.Z
sudo systemctl status ccv-hub-agent
curl -fsS http://127.0.0.1:4318/api/health
```

期望：

- systemd service 为 active。
- `/api/health` 返回 `{ "ok": true, "data": { "status": "ok" } }`。
- journal 中有启动日志和请求日志。

## 5. Web 验证

Docker/Dokploy：

```bash
CCV_HUB_WEB_IMAGE=ccv-hub-web:vX.Y.Z docker compose --env-file .env -f deploy/docker-compose.standalone.yml up -d
curl -fsS https://<CCV_HUB_PUBLIC_HOST>/
```

Docker Compose 使用正式 `.env`；Dokploy 使用同一组变量写入环境变量面板。

Nginx/Caddy 静态部署：

1. 解包 `ccv-hub-web-vX.Y.Z.tar.gz` 到版本目录。
2. 切换 Web 静态目录 symlink。
3. reload 反向代理。
4. 打开 Hub 首页。

## 6. Release rehearsal

真实环境 rehearsal 使用同一个入口完成构建、打包、模板验证、smoke 与证据记录：

```bash
CCV_HUB_SMOKE_BASE_URL=https://<CCV_HUB_PUBLIC_HOST> \
CCV_HUB_SMOKE_PASSWORD='change-me' \
CCV_HUB_SMOKE_CHECK_HOME=1 \
CCV_HUB_SMOKE_CHECK_INVALID_PATH=1 \
CCV_HUB_SMOKE_PROJECT_PATH=/home/user/projects/my-project \
CCV_HUB_SMOKE_STOP_AFTER_LAUNCH=1 \
bun run release:rehearsal -- vX.Y.Z
```

输出证据：

```text
build/checksums-vX.Y.Z.txt
build/release-rehearsal-vX.Y.Z.json
```

`release-rehearsal` report 需要记录所有命令为 `passed`，`smokeEnvironment` 中的目标部署变量为 `set`。Web image 构建可通过 `CCV_HUB_REHEARSAL_DOCKER_IMAGE=1` 纳入同一次 rehearsal。

## 7. Smoke test

基础检查：

```bash
bun run smoke:release
```

带鉴权检查：

```bash
CCV_HUB_SMOKE_BASE_URL=https://<CCV_HUB_PUBLIC_HOST> \
CCV_HUB_SMOKE_PASSWORD='change-me' \
CCV_HUB_SMOKE_CHECK_HOME=1 \
CCV_HUB_SMOKE_CHECK_INVALID_PATH=1 \
bun run smoke:release
```

带 launch、viewer 和 stop 检查：

```bash
CCV_HUB_SMOKE_BASE_URL=https://<CCV_HUB_PUBLIC_HOST> \
CCV_HUB_SMOKE_PASSWORD='change-me' \
CCV_HUB_SMOKE_PROJECT_PATH=/home/user/projects/my-project \
CCV_HUB_SMOKE_STOP_AFTER_LAUNCH=1 \
bun run smoke:release
```

已有 viewer 地址检查：

```bash
CCV_HUB_SMOKE_BASE_URL=https://<CCV_HUB_PUBLIC_HOST> \
CCV_HUB_SMOKE_PASSWORD='change-me' \
CCV_HUB_SMOKE_VIEWER_URL='https://<CCV_HUB_PUBLIC_HOST>/viewer/<bridgeId>/?token=...' \
bun run smoke:release
```

脚本输出 `[ok]` 代表对应阶段通过，`[skip]` 代表缺少可选环境变量。`CCV_HUB_SMOKE_CHECK_HOME=1` 会检查 Hub 首页，`CCV_HUB_SMOKE_CHECK_INVALID_PATH=1` 会检查非法启动路径错误结构。viewer 深度 smoke 要求 HTML 返回 `200 text/html`，SSE 返回 `200 text/event-stream`；HTTPS SSE 使用 HTTP/2 header 检查，HTTP 或 HTTPS viewer WebSocket 必须完成 `101 Switching Protocols` handshake。

## 8. 手工深度验证

1. 打开 Hub 首页。
2. 登录面板。
3. 访问 `/api/instances`，确认只返回 `running`。
4. 从启动弹窗选择 allowlist 内项目。
5. 打开返回的 viewer path。
6. 刷新 viewer 页面，确认 HTML、JS、CSS、字体与图片资源都经 `/viewer/<bridgeId>/` 加载。
7. 观察 viewer API 请求返回 2xx。
8. 观察 `/events` SSE 长连接保持。
9. 使用 `smoke:release` 的 TLS WebSocket handshake 结果或浏览器 DevTools 确认 WebSocket upgrade 成功。
10. 停止实例后轮询列表，确认实例消失。
11. 查看 Agent journal，确认注册、bridge、停止记录。

## 9. 回滚演练

Agent：

```bash
sudo ln -sfn /opt/ccv-hub-agent/releases/vX.Y.Z-prev /opt/ccv-hub-agent/current
sudo systemctl restart ccv-hub-agent
curl -fsS http://127.0.0.1:4318/api/health
bun run smoke:release
```

Web Docker/Dokploy：

```bash
CCV_HUB_WEB_IMAGE=ccv-hub-web:vX.Y.Z-prev docker compose --env-file .env -f deploy/docker-compose.standalone.yml up -d
bun run smoke:release
```

Web 静态目录：

```bash
sudo ln -sfn /var/www/ccv-hub/releases/vX.Y.Z-prev /var/www/ccv-hub/current
sudo systemctl reload nginx
bun run smoke:release
```

Kubernetes：

```bash
kubectl rollout undo deployment/ccv-hub-web
kubectl rollout status deployment/ccv-hub-web
bun run smoke:release
```

## 10. 发布判定

Release 通过条件：

- 构建、测试、打包全部成功。
- 平台模板 config 验证成功。
- Agent health 与实例列表成功。
- Hub 首页成功。
- launch、viewer bridge、stop 收敛在目标部署环境成功。
- 至少完成一次 Agent 或 Web 回滚演练。
