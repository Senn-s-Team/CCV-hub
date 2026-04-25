# 收口进度

## 2026-04-25：P0-1 公网 viewer 链路实机验证

状态：已完成验证。

### 验证对象

- Hub 首页：`https://ccv-hub-dev.paas.996667.xyz/`
- Hub API：`https://ccv-hub-dev.paas.996667.xyz/api/instances`
- viewer 子域名：`https://ccv-31b9745c782f47df97a90a3a226a9390.paas.996667.xyz/?token=<redacted>`
- 当前实例：`ccv-hub`，项目路径 `/home/opc/projects/ccvs/ccv-hub`，来源 `launcher`

### 验证结果

1. `GET https://ccv-hub-dev.paas.996667.xyz/api/health` 返回 HTTP 200，响应为 `{"ok":true,"data":{"status":"ok"}}`。
2. `GET https://ccv-hub-dev.paas.996667.xyz/api/instances` 返回 HTTP 200，并返回 1 个运行中实例。
3. 浏览器打开 Hub 首页成功，页面标题为 `CCV Hub`，实例列表展示 `ccv-hub`，并提供“打开”“复制链接”动作。
4. 浏览器打开 viewer 子域名成功，页面标题为 `Claude Code Viewer`，页面内容展示 `Project:ccv-hub`、Terminal、Network Packets、File Explorer 等核心区域。
5. viewer 子域名下静态资源加载正常：HTML、JS、CSS、SVG 请求均返回 HTTP 200。
6. viewer 子域名下业务 API 加载正常：`/api/local-url`、`/api/claude-settings`、`/api/git-repos`、`/api/preferences`、`/api/user-profile`、`/api/proxy-profiles`、`/api/project-name`、`/api/cli-mode`、`/api/files` 均返回 HTTP 200。
7. SSE 正常：`/events?token=<redacted>` 返回 HTTP 200，`Content-Type` 为 `text/event-stream`，连接保持打开。
8. WebSocket 正常：`/ws/terminal?token=<redacted>` 的 HTTP Upgrade 握手返回 `101 Switching Protocols`。
9. Hub 启动的新 viewer 继承宿主机用户环境：`USER=opc`、`LOGNAME=opc`、`HOME=/home/opc`、`SHELL=/usr/bin/zsh`、`CLAUDE_CONFIG_DIR=/home/opc/.claude`，`PATH` 包含 `/home/opc/.bun/bin`、`/home/opc/.local/bin`、`/home/opc/.cargo/bin`、`/home/opc/.npm-global/bin` 等宿主机用户路径。

### 排障基线

- Hub 公网入口健康检查先看 `/api/health`。
- 实例列表与最佳打开地址先看 `/api/instances`，提交文档时对 token 做脱敏处理。
- viewer 页面白屏时，先检查 HTML、`/assets/*.js`、`/assets/*.css` 是否为 HTTP 200。
- 实时链路分两层验证：SSE 检查 `/events` 是否保持 `text/event-stream`；WebSocket 检查 `/ws/terminal` 是否完成 `101 Switching Protocols`。
- 启动环境异常时，直接检查 viewer 进程 `/proc/<pid>/environ` 中的 `USER`、`HOME`、`PATH`、`SHELL`、`CLAUDE_CONFIG_DIR`。

### 后续观察

- 初始页面加载期间没有自动建立 WebSocket，终端能力实际使用前可用 Upgrade 握手确认 bridge 支持。
- viewer 前端生成的部分请求会出现重复 `token` 查询参数，当前请求仍返回 HTTP 200；后续安全与 URL 暴露收口时一起处理。

## 2026-04-25：P0-2 统一 viewer host 匹配规则

状态：已完成。

### 变更结果

1. Vite 开发代理的 viewer host 判定已收敛为 `^ccv-[a-f0-9]{32}\.paas\.996667\.xyz$` 同构语义。
2. `ccv-manual-7008.paas.996667.xyz`、非十六进制 bridge id 与非目标 public domain 均不再进入 viewer bridge 代理。
3. nginx 与 Traefik 原有 32 位十六进制 bridge id 规则保持不变，开发态、测试态、生产态共享同一合法 host 格式。

### 自测

- `bun --filter hub-web test -- src/test/vite-config.test.ts` 通过，5 个用例通过。
- `bun --filter hub-web lint` 通过。
