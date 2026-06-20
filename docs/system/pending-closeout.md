# 当前待收口任务（2026-04-25）

## 目标
这份清单记录已经进入当前实现范围、且会直接影响 `ccv-hub` 交付质量的闭环事项。内容以仓库现状为准，用来承接长对话中的上下文，避免待办只停留在会话里。

## P0：当前批次先收口

### 1. 完成公网 viewer 链路实机验证

**仓库证据**
- `docs/system/tech-stack.md` 的“14.4 公网能力验证”仍保留 5 个验证点。
- `deploy/docker-compose.hub.yml` 已接入 Traefik viewer 子域名规则与 `host.docker.internal:4318`。
- `apps/hub-web/nginx.conf` 已把 `/api` 与 viewer 子域名流量回连到宿主机 Hub service。
- `deploy/docker-compose.hub.yml` 是 Dokploy Web-only 入口，刻意不托管 Hub service 容器。
- `deploy/ccv-hub-service.service` 已把 Hub service 固定为宿主机 `opc` 用户的 systemd 服务。
- `docs/system/system.md` 已把 viewer 子域名公网地址定义为当前最佳打开地址。

**收口标准**
1. `ccv-hub-dev.paas.s3n.top` 首页与 `/api/instances` 可用。
2. `https://ccv-<bridgeId>.paas.s3n.top/?token=<token>` 可稳定打开 viewer 页面。
3. 页面静态资源、SSE、WebSocket 全部通过 bridge 正常工作。
4. Hub 启动的新 viewer 继承宿主机 `opc` 用户环境、`PATH` 与 `CLAUDE_CONFIG_DIR`。
5. 验证结果回写到文档，形成可复用排障基线。

### 2. 统一 viewer host 匹配规则

**仓库证据**
- `apps/hub-web/vite.config.ts` 只要满足 `ccv-` 前缀 + `.<publicDomain>` 就判定为 viewer host。
- `apps/hub-web/src/test/vite-config.test.ts` 拒绝 `ccv-manual-7008.<publicDomain>` 进入 viewer 代理。
- `apps/hub-web/nginx.conf` 先按 `*.publicDomain` 粗分流，`deploy/docker-compose.hub.yml` 按 `^ccv-[a-f0-9]{32}[.]<publicDomain>$` 分流，最终由 hub-service 校验 32 位 bridge id 与 public domain。

**风险**
开发态、测试态、生产态的 host 语义已经分叉，桥接问题会在不同环境出现不同结论。

**收口标准**
1. 统一 viewer host 的合法格式，当前实现按 32 位十六进制 bridge id 收敛。
2. Vite 判断、测试用例、nginx、Traefik 使用同一套语义。
3. 手工 host 与测试夹具同步调整，避免出现开发可通、生产不可达的假阳性。

### 3. 清理启动弹窗里的硬编码默认路径

**仓库证据**
- `apps/hub-web/src/components/LaunchDialog.tsx` 使用空字符串作为输入值，仅保留占位提示。

**风险**
默认值绑定单一机器目录，启动流程的可移植性与可演示性都被压缩了。

**收口标准**
1. 默认路径采用空值输入策略。
2. 启动弹窗继续只接受绝对路径，与 `POST /api/instances` 契约一致。
3. 交互文案能引导用户输入真实项目路径。

### 4. 补齐总览页状态回归测试

**仓库证据**
- `apps/hub-web/src/pages/OverviewPage.tsx` 已显式区分 `loading / discovery-error / empty / list-ready`。
- `apps/hub-web/src/test/overview-page.test.tsx` 当前覆盖了 `list-ready`、`empty`、启动失败、复制链接。

**风险**
加载态与发现失败态缺少回归保护，页面状态编排容易在后续改动中漂移。

**收口标准**
1. 为 `loading` 增加渲染断言。
2. 为 `discovery-error` 增加错误展示断言。
3. 现有 `empty`、`launch-failed`、复制链接用例继续保留。

### 5. 统一文档里的阶段表达

状态：已收口，详见 `progress.md` 的 P0-5 记录。

**收口结果**
- `docs/adr/0003-defer-public-bridge-out-of-mvp.md` 已表达 bridge 在 2026-04-24 进入当前实现，并在 2026-04-25 完成公网 viewer 链路验证。
- `docs/system/system.md` 已把公网暴露章节改为已验证基线与后续观察。
- `docs/system/tech-stack.md` 已把 Phase 4 公网访问增强标记为已并入当前实现。

**稳定基线**
1. ADR、system、tech-stack 对 bridge 当前状态给出一致表述。
2. 当前实现、已验证基线、后续增强项三层边界拆开表达。
3. 文档中的验证清单与实际部署结构保持同构。

## 本轮之外的事项
这些事项继续保留在后续批次：
- 结构化日志
- 轻量 JSON 快照恢复
- 收藏或最近打开
- 分组视图
- 更细的健康信息
- 更多运行元信息展示
- SSE 作为主同步路径
- 数据库持久化主存储

## 建议收口顺序
1. 先跑通公网 viewer 实机验证，拿到真实链路结论。
2. 再统一 host 匹配规则，让开发、测试、生产共享同一语义。
3. 接着清理默认路径，补齐总览页状态测试。
4. 最后回写 ADR、system、tech-stack，形成稳定基线。
