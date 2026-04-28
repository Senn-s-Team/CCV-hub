# ccv-hub

本机 `cc-viewer` 实例总览台：发现、启动、打开和复制同一台机器上的 Claude Code viewer 实例。

`ccv-hub` 面向经常同时打开多个项目、多个 Claude Code 会话的开发者。它提供一个统一入口，查看当前运行中的 `cc-viewer`，并通过 Web 控制面启动允许路径下的新实例。

## 核心能力

- **实例总览**：展示当前运行中的 `cc-viewer` 实例，按启动时间排序。
- **统一入口**：从 Hub 页面一键打开 viewer，复制访问链接。
- **受控启动**：通过宿主机 Agent 在路径 allowlist 内启动 `cc-viewer`。
- **公网控制面**：Hub Web 可部署到 Docker Compose、Dokploy、Caddy、Nginx 或 Kubernetes 入口。
- **宿主机能力边界**：Agent 保留在宿主机，负责 Claude Code 环境、项目目录、进程生命周期和 viewer bridge。
- **共享契约**：前后端共用 `@ccv-hub/shared-contracts`，用 zod 固定实例模型、响应结构和错误码。

## 架构

```text
Browser
  |
  v
ccv-hub-web
  |
  v
ccv-hub-agent / hub-service
  |
  v
cc-viewer instances
```

### 组件职责

- `apps/hub-web/`：React + Vite 总览页，负责实例列表、筛选、启动弹窗、复制与轮询刷新。
- `apps/hub-service/`：Fastify 本地 Agent，负责健康检查、实例注册表、路径校验、启动 `cc-viewer` 与 viewer bridge。
- `packages/shared-contracts/`：共享 schema 与类型定义，保证 Web 和 Agent 的 API 契约一致。
- `deploy/`：Compose、Dokploy、Caddy、Nginx、Kubernetes、systemd 与插件模板。
- `scripts/`：Agent/Web release 打包、rehearsal 和 smoke 验证脚本。

## 快速开始

### 前置条件

- Bun `1.3.10`
- Node.js `>=24.0.0`
- Claude Code：先按 [Claude Code 官方安装文档](https://code.claude.com/docs/en/setup) 安装并完成登录，确认 `claude --version` 可用。
- cc-viewer：按 [cc-viewer GitHub](https://github.com/weiesky/cc-viewer) / [npm package](https://www.npmjs.com/package/cc-viewer) 安装 CLI：

```bash
npm install -g cc-viewer --registry=https://registry.npmjs.org
ccv -h
```

- 本机 Claude Code 配置目录，通常是 `~/.claude`

### 安装依赖

```bash
bun install
```

### 启动开发 Web

```bash
bun run dev:web
```

### 启动本地 Agent

```bash
bun run dev:service
```

默认开发形态是本机 Web 调用本机 Agent，再由 Agent 管理本机 `cc-viewer` 实例。

## 常用命令

```bash
bun run build             # 构建所有 workspace
bun run test              # 运行所有测试
bun run lint              # TypeScript 检查
bun run dev:web           # 启动 Hub Web 开发服务器
bun run dev:service       # 启动 Hub Agent 开发服务器
bun run release:agent     # 打包宿主机 Agent release
bun run release:web       # 打包 Web release
bun run release:rehearsal # 执行 release 演练
bun run smoke:release     # 执行 release smoke 验证
```

## 配置

根目录提供 Web/adapter 配置模板：

```bash
cp .env.example .env.dev
```

宿主机 Agent 使用 release 模板：

```bash
cp deploy/.env.agent.example /etc/ccv-hub/.env.agent
```

关键变量：

- `CCV_HUB_PUBLIC_HOST`：Hub 对外主域名。
- `CCV_HUB_PUBLIC_DOMAIN`：viewer 子域名所在根域名。
- `CCV_HUB_VIEWER_SUBDOMAIN_PREFIX`：viewer 子域名前缀，默认 `ccv-`。
- `CCV_HUB_AGENT_UPSTREAM`：Web 容器或入口访问 Agent 的 upstream。
- `CCV_HUB_AGENT_PROXY_TOKEN`：Web 到 Agent 的代理令牌。
- `CCV_HUB_AUTH_PASSWORD`：Hub 登录密码。
- `CCV_HUB_SESSION_SECRET`：Hub 会话密钥。
- `CCV_HUB_PATH_ROOTS`：Agent 允许启动 viewer 的项目根路径列表。
- `CCV_CLI_PATH`：`cc-viewer` CLI 入口。
- `CLAUDE_CONFIG_DIR`：Claude Code 配置目录。

正式环境请使用强随机值填充 token、password 和 session secret，并收紧 `.env.agent` 文件权限。

## 部署模式

`ccv-hub` 的推荐边界是 Web 控制面和宿主机 Agent 分层：

```text
Public Web Entry
  |
  v
ccv-hub-web container / static site
  |
  v
ccv-hub-agent on host
  |
  v
cc-viewer per project process
```

支持路径：

- **Local Mode**：本机开发和试用。
- **Docker Compose Mode**：通用自托管主路径，Web 运行在容器，Agent 运行在宿主机 systemd。
- **Dokploy Mode**：基于 Dokploy / Traefik 的 Compose 适配。
- **Caddy Mode**：自动 HTTPS 与 wildcard 路由。
- **Nginx Mode**：传统 VPS、已有 Nginx 和 Certbot 场景。
- **Kubernetes Mode**：团队和高级用户场景，Web 进入集群，Agent 保留在目标节点宿主机。

部署细节见：

- `docs/deploy/overview.md`
- `docs/deploy/modes.md`
- `docs/deploy/compose.md`
- `docs/deploy/dokploy.md`
- `docs/deploy/caddy.md`
- `docs/deploy/nginx.md`
- `docs/deploy/kubernetes.md`

## Release

Agent 和 Web 分别打包：

```bash
bun run release:agent
bun run release:web
```

发布前验证：

```bash
bun run release:rehearsal
bun run smoke:release
```

相关文档：

- `docs/deploy/release-plan.md`
- `docs/deploy/release-checklist.md`
- `docs/deploy/troubleshooting.md`
- `docs/deploy/progress.md`

## 安全边界

生产部署采用三层访问边界：

```text
User -> Hub Web/API: password and session
Web proxy -> Agent: agent proxy token
User -> Viewer: per-instance viewer token
```

建议：

- Agent 端口只开放给受控入口访问。
- `/etc/ccv-hub/.env.agent` 使用 `0600` 权限。
- `CCV_HUB_PATH_ROOTS` 只包含明确授权的项目根目录。
- viewer 子域名通过 bridge id 与 token 进入具体实例。
- `~/.claude`、项目源码和 Claude 登录态保留在宿主机。

## 文档导航

- `docs/prd/`：产品范围、目标用户、交互与验收标准。
- `docs/ia/`：页面结构、信息层级、主流程与状态边界。
- `docs/system/`：组件职责、数据流、状态流转与异常处理。
- `docs/api/`：本地服务接口、请求响应结构与实例对象格式。
- `docs/design/`：视觉语言、页面原型规则与跨端体验基线。
- `docs/adr/`：关键技术取舍、阶段边界与实现原则。
- `docs/deploy/`：开源部署、平台适配、release、验证与故障排查。

## 设计原则

- `cc-viewer` 负责单实例内容展示。
- `ccv-hub` 负责实例发现、实例目录和统一入口。
- Web 层保持可替换，Agent 层稳定掌握宿主机能力。
- API 契约由共享包固定，页面状态只消费明确的实例模型。
- 部署模板只表达平台适配差异，Agent 协议保持统一。

## 贡献

1. 先阅读 `CLAUDE.md` 和目标目录下的 `CLAUDE.md`。
2. 保持代码、文档和目录地图同步。
3. 修改前后端 API 时同步更新 `packages/shared-contracts/` 与 `docs/api/`。
4. 修改部署行为时同步更新 `deploy/` 模板与 `docs/deploy/`。
5. 提交前运行：

```bash
bun run build
bun run test
bun run lint
```
