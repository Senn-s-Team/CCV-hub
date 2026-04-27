# ccv-hub 开源部署改进进度

## 1. 当前目标

把当前偏 dev 的 Dokploy 部署演进为开源项目可复用的部署体系。最终主路径是 `ccv-hub-web` 容器化或静态化，`ccv-hub-agent` 宿主机 systemd 化，平台适配层支持 Local、Docker Compose、Dokploy、Caddy、Nginx 与未来 Kubernetes。

## 2. 执行原则

- 先冻结架构边界，再改配置和代码。
- 先支持通用 Docker Compose + systemd Agent，再把 Dokploy 作为平台适配。
- 先让 release 可验证、可回滚，再扩展更多平台模板。
- 所有新增文件和目录变更必须同步对应 `CLAUDE.md`。

## 3. 阶段进度

| 阶段 | 范围 | 状态 | 产出 | 验证 |
|---|---|---|---|---|
| Phase 1 | 文档与边界冻结 | completed | `docs/deploy/overview.md`, `modes.md`, `release-plan.md`, `progress.md` | 文档已创建并同步 L1/L2 |
| Phase 2 | 配置模板化 | completed | release compose、nginx template、agent env template | Task A 已模板化并通过变量链复核 |
| Phase 3 | Agent release 化 | completed | build artifact runtime、release systemd unit、current symlink 安装结构、Agent tarball 打包脚本、安装脚本 | `node dist/server.js`、release tarball health check、Docker build、systemd verify 均通过 |
| Phase 4 | Web release 化 | completed | image-only compose、Web 静态 tarball、无源码挂载 Web 容器 | `bun run release:web -- v0.0.0-test`、tarball 内容检查、Docker build、compose config、容器 smoke 均通过 |
| Phase 5 | 平台适配补齐 | completed | Compose/Dokploy/Caddy/Nginx/Kubernetes 文档、standalone compose、Caddy/Nginx/Kubernetes 模板 | 每个平台有 smoke path；compose config 已纳入验证路径 |
| Phase 6 | 发布验证自动化 | completed | `scripts/smoke-release.mjs`、`smoke:release`、release checklist、rollback checklist、troubleshooting | `node --check scripts/smoke-release.mjs`、`bun run lint`、`bun run test`、临时 Agent 鉴权 smoke 均通过 |

## 4. 已完成记录

### 2026-04-27

- 确认当前 dev 部署模型：Dokploy/Traefik 托管 `hub-web`，宿主机 systemd 托管 `hub-service`，nginx 通过 `host.docker.internal:4318` 回连 Agent。
- 确认开源部署边界：`hub-service` 对外应表达为 `ccv-hub-agent`，默认保留宿主机运行。
- 新增 `docs/deploy/` L2 文档目录。
- 新增部署总览、部署模式拆分、release 方案和进度文档。
- 完成 Task A 配置模板化：compose、nginx、systemd 与 `.env.example` 统一使用可覆盖的域名、端口、路径和 viewer 前缀变量。
- 完成 Task A 命令复核：Traefik HostRegexp、nginx server_name、Agent viewer URL 与 `.env.example` 使用同一组域名、domain regex、viewer 前缀和 upstream 变量。
- 完成 Task B release baseline：`shared-contracts` 和 `hub-service` 改为 `src -> dist` 构建，`node apps/hub-service/dist/server.js` 可启动并返回 `/api/health`。
- systemd 单元已指向 `/opt/ccv-hub-agent/current/apps/hub-service` 与 `/etc/ccv-hub/agent.env`，Docker Agent 镜像已改为构建后运行 `dist/server.js`。
- 完成 Task B Agent release 打包：新增 `deploy/ccv-hub-agent.service`、`deploy/agent.env.example`、`scripts/package-agent-release.mjs`、`scripts/install-agent-release.sh`，`bun run release:agent -- v0.0.0-test` 可产出 tarball。
- 完成 Task B 端到端验证：tarball 内容检查、解包后 `bun install --production`、携带宿主机 `CCV_CLI_PATH` 启动 `dist/server.js`、`/api/health`、Docker build、systemd verify、workspace test/build 均通过。
- 完成 Task C Web release 化：`deploy/docker-compose.hub.yml` 改为 image-only 部署，移除 Web 容器源码挂载，新增 `scripts/package-web-release.mjs` 与 `release:web`，Web tarball 固定包含 `dist/` 与 nginx 模板；`bun run --filter hub-web build`、`bun run release:web -- v0.0.0-test`、tarball 内容检查、`docker build`、`docker compose config`、容器首页/API/mounts smoke 均通过。
- 完成 Task D 平台适配补齐：新增 `compose.md`、`dokploy.md`、`caddy.md`、`nginx.md`、`kubernetes.md` 五个平台文档，新增 `docker-compose.standalone.yml`、`Caddyfile.example`、`nginx.hub.conf.example`、`kubernetes-web.yaml` 四个部署模板；Compose/Dokploy/Caddy/Nginx/Kubernetes 均给出宿主机 Agent 主路径和 smoke path。
- 完成 Task D 模板验证：`docker compose -f deploy/docker-compose.hub.yml config` 与 `docker compose --env-file .env.example -f deploy/docker-compose.standalone.yml config` 通过；当前环境未安装 `caddy`、`nginx`、`kubectl`，对应模板保留文档化验证命令。

### 2026-04-28

- 完成 Task E 发布验证自动化：新增 `scripts/smoke-release.mjs` 与根脚本 `smoke:release`，基础 smoke 覆盖 `/api/health`、`/api/auth/me`、`/api/instances`，可选启用 Hub 首页、非法路径、launch、viewer HTTP/SSE/WebSocket 与 stop 收敛。
- 完成 release 验证文档：新增 `docs/deploy/release-checklist.md`，固化构建、打包、模板验证、Agent/Web 验证、smoke test、手工深度验证、Agent/Web/Kubernetes 回滚演练与发布判定。
- 完成故障排查文档：新增 `docs/deploy/troubleshooting.md`，覆盖 Agent 启动、health、鉴权、API 代理、启动实例、viewer 子域名、SSE、WebSocket、停止收敛与回滚异常。
- 完成 Task E 验证：`node --check scripts/smoke-release.mjs`、`bun run lint`、`bun run test`、临时 Agent 鉴权 smoke 均通过；未提供真实 viewer 环境，深度 viewer 与 stop 检查保留为部署环境 smoke path。

## 5. 下一步任务拆分

### Task A：配置模板化

目标：把 dev 域名、端口、路径、viewer 前缀从部署文件中抽离。

文件范围：

- `deploy/docker-compose.hub.yml`
- `apps/hub-web/nginx.conf`
- `deploy/ccv-hub-service.service`
- `.env.example`
- `deploy/CLAUDE.md`

验收：

- dev 配置仍可表达当前环境。
- release 配置可以替换域名、端口和 viewer 前缀。
- nginx viewer wildcard 不再绑定单一私有域名。

### Task B：Agent release 化

目标：让 `apps/hub-service` 使用构建产物运行，形成可安装 Agent。已完成 release baseline、tarball 打包、安装脚本与验证闭环。

文件范围：

- `apps/hub-service/package.json`
- `apps/hub-service/tsconfig.json`
- `deploy/ccv-hub-agent.service`
- `deploy/ccv-hub-service.service`
- `deploy/agent.env.example`
- `scripts/package-agent-release.mjs`
- `scripts/install-agent-release.sh`

验收：

- `bun run --filter hub-service build` 产出可执行 JS。
- `node dist/server.js` 可启动服务。
- systemd unit 指向 release/current 目录。
- `bun run release:agent -- v0.0.0-test` 产出可安装 tarball。
- tarball 解包后 `bun install --production` 与 `/api/health` 验证通过。

### Task C：Web release 化

目标：让 `hub-web` 成为独立 release 镜像或静态 tarball。已完成 image-only compose、Web tarball 打包命令与无源码挂载运行路径。

文件范围：

- `apps/hub-web/Dockerfile`
- `apps/hub-web/nginx.conf`
- `deploy/docker-compose.hub.yml`
- `scripts/package-web-release.mjs`
- `package.json`
- `.env.example`

验收：

- Web 容器不挂载项目源码。
- Web image 可用 tag 部署。
- `/api` 与 viewer bridge 都能代理到 Agent。

### Task D：平台适配文档与模板

目标：补齐通用开源部署入口。已完成五个平台文档与四个部署模板，默认保持 Docker Compose/Web 容器 + 宿主机 systemd Agent。

文件范围：

- `docs/deploy/modes.md`
- `docs/deploy/compose.md`
- `docs/deploy/dokploy.md`
- `docs/deploy/caddy.md`
- `docs/deploy/nginx.md`
- `docs/deploy/kubernetes.md`
- `deploy/docker-compose.standalone.yml`
- `deploy/Caddyfile.example`
- `deploy/nginx.hub.conf.example`
- `deploy/kubernetes-web.yaml`

验收：

- 用户可以按 Docker Compose + systemd Agent 完成部署。
- Dokploy 文档只描述平台差异。
- Caddy/Nginx 给出可复制反代样例。
- Kubernetes 文档固定 Web 控制面边界，Agent 保持节点 systemd。

### Task E：验证与回滚

目标：形成 release 前后可重复执行的验证流程。已完成 smoke 脚本、release checklist、rollback checklist 与 troubleshooting 文档。

文件范围：

- `docs/deploy/release-plan.md`
- `docs/deploy/release-checklist.md`
- `docs/deploy/troubleshooting.md`
- `scripts/smoke-release.mjs`
- `package.json`
- `scripts/CLAUDE.md`
- `docs/deploy/CLAUDE.md`

验收：

- Hub health、auth、instances、非法路径、launch、viewer HTML/API/SSE/WebSocket、stop 收敛均有验证步骤。
- Agent、Web 和 Kubernetes 均有回滚步骤。
- `bun run smoke:release` 可在部署前后复用。

## 6. 当前阻塞项

暂无。Phase 6 已完成，下一阶段进入首个版本发布前的真实环境 release rehearsal。

## 7. 风险记录

- Agent 容器化会扩大权限面，需要保留为高级模式。
- Kubernetes 只能先承载 Web 控制面，Agent 需要节点级宿主机能力。
- Task A 的变量模板要求 Traefik HostRegexp、nginx server_name 与 Agent viewer URL 使用同一组域名和 viewer 前缀变量。
- `shared-contracts` 到 dist 导出会要求消费者先构建共享契约，当前已在 hub-web/hub-service 脚本中显式预构建。

## 8. Subagent 分工建议

- Explore agent：审计硬编码配置、路径、端口和部署文件引用。
- Plan agent：设计 release artifact 与安装目录结构。
- General agent：实现模板文件、systemd unit、构建脚本与 smoke checklist。
- Main agent：做最终架构裁剪、文档同构检查、测试验证和任务状态更新。
