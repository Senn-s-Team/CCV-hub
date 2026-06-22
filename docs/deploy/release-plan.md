# ccv-hub release 部署方案

## 1. Release 定位

`ccv-hub` release 以开源自托管为目标，交付可版本化、可验证、可回滚的 Web 控制面和本机 Agent。

默认生产形态：

```text
ccv-hub-web image or static artifact
+
ccv-hub-agent tarball and systemd unit
+
reverse proxy templates
+
environment templates
```

## 2. Release 产物

每个 GitHub Release 产出：

```text
ghcr.io/<owner>/ccv-hub-web:vX.Y.Z
ccv-hub-web-vX.Y.Z.tar.gz
ccv-hub-agent-vX.Y.Z.tar.gz
deploy-templates-vX.Y.Z.zip
checksums.txt
```

产物职责：

- Web image：给 Docker Compose、Dokploy、Kubernetes 使用。
- Web tarball：给 Nginx/Caddy 静态部署使用。
- Agent tarball：给宿主机 systemd 安装使用，内含 `deploy/ccv-hub-plugin.mjs` 供 Agent 按 `CCV_LOG_DIR` 或 `CLAUDE_CONFIG_DIR` 同步到 cc-viewer 用户插件目录。
- deploy templates：提供 `docker-compose.hub.yml`、`docker-compose.standalone.yml`、`Caddyfile.example`、`nginx.hub.conf.example`、`kubernetes-web.yaml` 和 systemd/env 样例。
- checksums：用于下载校验。

## 3. 版本规则

- Web image tag、Agent tarball version、deploy templates version 使用同一个 `vX.Y.Z`。
- Agent API 与 Web 前端共享契约来自 `packages/shared-contracts`。
- release 分支只接受已通过 build、test、smoke test 的 commit。
- prod 部署只使用不可变 tag。

## 4. Agent 安装目录

推荐宿主机目录：

```text
/opt/ccv-hub-agent/
├── releases/
│   ├── v0.1.0/
│   └── v0.1.1/
└── current -> /opt/ccv-hub-agent/releases/v0.1.1

/etc/ccv-hub/
└── .env.agent

/etc/systemd/system/
└── ccv-hub-agent.service
```

systemd 指向 `current` symlink，回滚只切换 symlink 并重启服务。

## 5. Agent 环境变量模板

`/etc/ccv-hub/.env.agent`：

```env
CCV_HUB_ENV=production
CCV_HUB_HOST=0.0.0.0
CCV_HUB_PORT=4318

CCV_HUB_PUBLIC_PROTOCOL=https
CCV_HUB_PUBLIC_HOST=<CCV_HUB_PUBLIC_HOST>
CCV_HUB_VIEWER_PATH_PREFIX=/viewer
CCV_HUB_URL=http://127.0.0.1:4318
CCV_HUB_PLUGIN_AUTO_INSTALL=0

CCV_HUB_AGENT_PROXY_TOKEN=change-me-to-a-random-secret
CCV_HUB_AUTH_PASSWORD=change-me
CCV_HUB_SESSION_SECRET=change-me-to-a-long-random-secret

CCV_HUB_PATH_ROOTS=/home/user/projects
CCV_CLI_PATH=/opt/cc-viewer/current/cli.js
CLAUDE_CONFIG_DIR=/home/user/.claude
HOME=/home/user
LOG_LEVEL=info
```

权限：安装脚本会在首次安装时初始化 `/etc/ccv-hub/.env.agent`，升级时保留已有配置并收敛为 `0600 root:root`。

```bash
sudo chown root:root /etc/ccv-hub/.env.agent
sudo chmod 600 /etc/ccv-hub/.env.agent
```

## 6. Web 环境变量模板

Web 容器：

```env
CCV_HUB_PUBLIC_PROTOCOL=https
CCV_HUB_PUBLIC_HOST=<CCV_HUB_PUBLIC_HOST>
CCV_HUB_VIEWER_PATH_PREFIX=/viewer
CCV_HUB_AGENT_UPSTREAM=http://host.docker.internal:4318
CCV_HUB_AGENT_PROXY_TOKEN=change-me-to-the-agent-proxy-token
```

Web 静态部署：

- 构建时写入公共域名配置。
- 反向代理层负责把 `/api` 与 `/viewer/*` 转发到 Agent。
- 代理层注入 `X-CCV-Hub-Agent-Token`。

## 7. 发布流水线

### 7.1 构建

```bash
bun install --frozen-lockfile
bun run lint
bun run test
bun run build
```

### 7.2 打包

```bash
bun run release:web -- vX.Y.Z
bun run release:agent -- vX.Y.Z
docker build -f apps/hub-web/Dockerfile -t ccv-hub-web:vX.Y.Z .
docker save ccv-hub-web:vX.Y.Z | gzip > build/ccv-hub-web-vX.Y.Z.image.tar.gz
```

```text
apps/hub-web/dist + apps/hub-web/nginx.conf -> ccv-hub-web-vX.Y.Z.tar.gz
apps/hub-service/dist + package metadata + deploy/ccv-hub-agent.service + deploy/.env.agent.example + deploy/ccv-hub-plugin.mjs + scripts/install-agent-release.sh -> ccv-hub-agent-vX.Y.Z.tar.gz
deploy/docker-compose.hub.yml + deploy/docker-compose.standalone.yml + deploy/Caddyfile.example + deploy/nginx.hub.conf.example + deploy/kubernetes-web.yaml + systemd/env templates -> deploy-templates-vX.Y.Z.zip
```

Web tarball 内容固定为 `dist/` 静态资源与 `nginx/default.conf.template`，由 Nginx/Caddy 静态部署层接入 `/api` 与 `/viewer/*` 反向代理。

### 7.3 发布

- Push Web image 到 registry。
- 上传 Agent tarball 和 deploy templates 到 GitHub Release。
- 上传 checksums。
- 标记 release notes 中的 breaking config changes。

### 7.4 验证

Release 必跑 smoke test 通过 `bun run smoke:release` 执行，完整流程见 `docs/deploy/release-checklist.md`。

### 7.5 Release rehearsal

首个版本发布前执行真实环境 rehearsal：

```bash
CCV_HUB_SMOKE_BASE_URL=https://<CCV_HUB_PUBLIC_HOST> \
CCV_HUB_SMOKE_PASSWORD='change-me' \
CCV_HUB_SMOKE_CHECK_HOME=1 \
CCV_HUB_SMOKE_CHECK_INVALID_PATH=1 \
CCV_HUB_SMOKE_PROJECT_PATH=/home/user/projects/my-project \
CCV_HUB_SMOKE_STOP_AFTER_LAUNCH=1 \
bun run release:rehearsal -- vX.Y.Z
```

`release:rehearsal` 只编排既有验证入口：lint、test、build、Web/Agent 打包、Compose 模板验证与 `smoke:release`。执行后会生成：

```text
build/checksums-vX.Y.Z.txt
build/release-rehearsal-vX.Y.Z.json
```

`CCV_HUB_REHEARSAL_DOCKER_IMAGE=1` 可把 Web image build 纳入 rehearsal。


基础 smoke 覆盖：

1. Hub 首页可访问，可通过 `CCV_HUB_SMOKE_CHECK_HOME=1` 启用。
2. `GET /api/health` 返回服务存活结构。
3. `GET /api/auth/me` 返回鉴权配置状态。
4. `GET /api/instances` 返回统一运行中实例结构。
5. 非法路径返回 `INVALID_PATH`，可通过 `CCV_HUB_SMOKE_CHECK_INVALID_PATH=1` 启用。

深度 smoke 通过 `CCV_HUB_SMOKE_PROJECT_PATH` 或 `CCV_HUB_SMOKE_VIEWER_URL` 启用：

1. 合法路径可以启动 `cc-viewer`。
2. viewer path 可加载 HTML、JS、CSS。
3. viewer API、SSE、WebSocket 可用，HTTPS viewer WebSocket 通过 TLS upgrade handshake 验证。
4. 停止实例后列表收敛。
5. Agent 日志中出现结构化注册、停止、bridge 记录。

平台模板验证：

- Compose：`docker compose --env-file .env.example -f deploy/docker-compose.standalone.yml config`。
- Dokploy：`docker compose --env-file .env.example -f deploy/docker-compose.hub.yml config`，并复核 Traefik Hub router 与 Web nginx `/viewer/` location。
- Caddy：`caddy adapt --config deploy/Caddyfile.example`。
- Nginx：`nginx -t` 使用 `deploy/nginx.hub.conf.example` 生成的站点配置。
- Kubernetes：`kubectl apply --dry-run=client -f deploy/kubernetes-web.yaml`。

## 8. 升级流程

Agent 升级：

```text
下载新 tarball
校验 checksum
解压到 /opt/ccv-hub-agent/releases/vX.Y.Z
切换 current symlink
systemctl restart ccv-hub-agent
运行 health check
```

Web 升级：

- Docker/Dokploy：切换 Web image tag。
- Nginx/Caddy：替换静态 Web tarball。
- Kubernetes：更新 Deployment image。

## 9. 回滚流程

Agent 回滚：

```bash
sudo ln -sfn /opt/ccv-hub-agent/releases/vX.Y.Z /opt/ccv-hub-agent/current
sudo systemctl restart ccv-hub-agent
```

Web 回滚：

- Docker/Dokploy：切回上一版 image tag。
- Nginx/Caddy：切回上一版静态目录。
- Kubernetes：rollout undo。

回滚后必须验证 `/api/health`、`/api/instances` 与 viewer bridge。

## 10. 阶段拆分

### Phase 1：文档与边界冻结

- 新增部署总览、部署模式和 release 文档。
- 明确 `ccv-hub-web` 与 `ccv-hub-agent` 边界。
- 明确 Dokploy 是平台适配器。

### Phase 2：配置模板化

- 抽离 dev 域名硬编码。
- 抽离 nginx viewer 域名硬编码。
- 新增 agent env 模板。
- 新增 release compose 模板。

### Phase 3：Agent release 化

- `hub-service` 构建产物可直接运行。
- systemd unit 指向构建产物。
- 安装目录改为 release/current symlink。
- 增加 health check 与版本输出。

### Phase 4：Web release 化

- Web image 使用不可变 tag。
- Web 容器移除源码挂载。
- nginx 使用模板生成配置。
- Dokploy 和 Compose 使用同一套变量名。

### Phase 5：平台适配补齐

- Docker Compose 官方样例：`docs/deploy/compose.md`、`deploy/docker-compose.standalone.yml`。
- Dokploy 官方样例：`docs/deploy/dokploy.md`、`deploy/docker-compose.hub.yml`。
- Caddy 官方样例：`docs/deploy/caddy.md`、`deploy/Caddyfile.example`。
- Nginx 官方样例：`docs/deploy/nginx.md`、`deploy/nginx.hub.conf.example`。
- Kubernetes Web 边界说明：`docs/deploy/kubernetes.md`、`deploy/kubernetes-web.yaml`。

### Phase 6：发布验证自动化

- 增加 `scripts/smoke-release.mjs` 与 `bun run smoke:release`。
- 增加 `docs/deploy/release-checklist.md`。
- 增加 `docs/deploy/troubleshooting.md`。
- 增加 Agent/Web 回滚演练步骤。

## 11. 首批实施建议

先实现 Phase 1 到 Phase 4。它们能把当前 dev 部署收口成正式 release 主路径，并为后续平台适配留出统一接口。

Phase 5 和 Phase 6 可以跟随第一版 release 之后推进。
