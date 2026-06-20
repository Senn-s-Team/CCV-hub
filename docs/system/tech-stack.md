# ccv-hub 技术选型文档

## 1. 文档目的

本文给出 `ccv-hub` MVP 与后续增强阶段的完整技术选型、版本策略、模块落位、依赖矩阵与验证原则，用于把 `docs/prd/`、`docs/ia/`、`docs/api/`、`docs/design/` 中已经冻结的产品约束落实到一套可直接实施的工程方案。本文聚焦工程实现与技术决策，不重复产品目标与页面结构细节。

## 2. 选型目标

### 2.1 对齐的产品约束

- 单机运行
- 不修改 `cc-viewer` 源码
- `ccv-hub` 负责统一入口启动、实例登记、实例列表与总览页
- 第一版只展示运行中实例
- 第一版主页面固定为总览页 + 启动弹窗
- 第一版优先追求轻量、稳定、可解释、快速落地

### 2.2 工程目标

- 让前后端共享同一份实例契约
- 让状态流转清晰，减少半状态泄漏
- 让本地服务保持轻量，同时承接已进入当前实现的公网 viewer 子域名桥接
- 让依赖组合尽量采用最新稳定生态，减少后续大版本迁移成本

## 3. 版本策略

### 3.1 总策略

- 默认采用各层依赖的**最新稳定大版本**。
- 优先选择已经正式发布、生态兼容性成熟、文档与工具链完整的版本。
- 若某个依赖的最新稳定大版本在实际集成验证中出现阻塞，再回退到前一稳定大版本。
- 在工程初始化时输出一份版本矩阵，并在第一轮兼容性验证通过后冻结。

### 3.2 运行时策略

- Node 使用**最新稳定 LTS** 作为默认运行时。
- 包管理器使用 `Bun`，保证 workspace、多包共享依赖、安装速度与锁文件稳定性。

## 4. 推荐技术栈

### 4.1 前端

当前已采用：
- `React`：用于总览页、实例卡片、启动弹窗与状态视图
- `TypeScript`：用于组件、接口模型、状态模型与共享类型
- `Vite`：用于前端开发服务器与构建
- `@vitejs/plugin-react`：用于 React 构建集成
- `@tanstack/react-query`：用于实例列表读取、启动请求、刷新与错误状态管理
- `zod`：用于运行时契约校验与前后端共享 schema

预留项：
- `Tailwind CSS`：可在后续视觉系统重构时接入，用于设计 token、布局类与响应式约束

### 4.2 后端

- `Fastify`：用于本地常驻服务
- `TypeScript`：用于实例模型、路由、启动与状态收敛逻辑
- `pino`：用于本地结构化日志
- `tsx`：用于本地 TypeScript 直接运行与开发态执行

### 4.3 测试与质量工具

当前已采用：
- `Vitest`：用于前端与共享包单元测试
- `TypeScript` 编译检查：用于当前工程质量基线

预留项：
- `ESLint`：可在后续规则体系稳定后接入，承接更细粒度的静态检查

### 4.4 进程与系统能力

- Node 内建 `child_process.spawn`：用于通过统一入口启动 `cc-viewer`
- Node 内建 `fs` / `path` / `timers`：用于路径校验、轻量快照与状态收敛

## 5. 推荐版本矩阵

以下版本以当前稳定 registry 结果为基准，适合作为首发版本矩阵：

### 5.1 运行时与工具链

- `node`: `24.x`（最新稳定 LTS）
- `bun`: `1.3.10`
- `typescript`: `6.0.3`
- `tsx`: `4.21.0`

### 5.2 前端

- `react`: `19.2.5`
- `vite`: `8.0.9`
- `@vitejs/plugin-react`: `6.0.1`
- `@tanstack/react-query`: `5.99.2`
- `zod`: `4.3.6`

### 5.3 后端

- `fastify`: `5.8.5`
- `pino`: `10.3.1`

### 5.4 测试

- `vitest`: `4.1.5`

## 6. 关键技术决策

### 6.1 React + Vite 作为前端基座

选择理由：

- `docs/ia/ia.md` 已经将信息架构固定为“唯一主页面 + 启动弹窗”，组件模型与 React 的组织方式天然吻合。
- `docs/design/design-foundation.md` 强调桌面优先、卡片层级、状态稳定与跨端可达，Vite + React 能快速支撑迭代与响应式验证。
- `docs/design/screens-and-states.md` 明确要求 loading、empty、launch-failed、discovery-error 等状态闭环，React 对状态驱动 UI 很合适。

### 6.2 当前样式策略：沿用原型 CSS

选择理由：

- 当前实现直接复用 `prototype/styles.css` 的暖感工业视觉系统，迁移路径最短，页面结果与设计评审基线最贴近。
- MVP 页面结构集中，现有 CSS 已足够承接总览页、卡片、弹窗与状态面，不需要额外引入样式框架分支。
- 若后续出现更细的 token 管理或主题化需求，再评估 Tailwind CSS 是否值得接入。

### 6.3 Fastify 作为本地服务

选择理由：

- `docs/system/system.md` 明确本地常驻服务是实例真相源与协调中心，Fastify 很适合承担轻量 API、状态过滤和错误归一。
- `docs/api/api.md` 已冻结 `GET /api/health`、`GET /api/instances`、`POST /api/instances` 三个核心接口，Fastify 路由结构直观，启动开销低。
- Fastify 与 TypeScript、schema 校验工具结合顺手，利于把统一响应结构固定下来。

### 6.4 React Query 作为服务端状态层

选择理由：

- 实例列表、启动请求、刷新状态都围绕服务端数据展开，React Query 能把读取、缓存、轮询、错误与重试保持在统一模型内。
- 页面本地状态只剩筛选关键字、弹窗开关与表单值，边界自然清晰。

### 6.5 zod 作为共享契约层

选择理由：

- `docs/api/api.md` 已经给出 `Instance` 结构与错误返回结构，zod 可以把它们固化为共享 schema。
- 服务端可用它校验请求和响应，前端可用它解析运行时数据，减少字段漂移。

### 6.6 spawn 作为启动机制

选择理由：

- `docs/prd/ccv-hub-prd.md` 与 `docs/system/system.md` 都要求统一入口启动与自动登记。
- 通过 `child_process.spawn` 从外部拉起 `cc-viewer`，完全符合“不修改 cc-viewer 源码”的边界。
- 进程号、端口、URL、启动时间都能自然进入实例模型。

### 6.7 轮询优先，SSE 后置

选择理由：

- 文档对刷新要求是“自动刷新或低延迟刷新”，MVP 不需要先引入更复杂的推送链路。
- 轮询足够直接、稳定、好解释；SSE 作为 V1.1 增强更合适。
- 页面后台自动降频即可控制本地开销。

### 6.8 内存注册表优先，持久化后置

选择理由：

- 第一版只展示运行中实例，历史实例与复杂状态面板都在范围外。
- 以内存注册表作为真相源最贴近文档边界，减少数据库和迁移复杂度。
- 若后续加入收藏、最近打开或审计，再用 SQLite 承接增强能力。

## 7. 推荐工程结构

```text
ccv-hub/
├── docs/
│   ├── prd/
│   ├── ia/
│   ├── system/
│   │   ├── system.md
│   │   └── tech-stack.md
│   ├── api/
│   ├── design/
│   └── adr/
├── prototype/
├── apps/
│   ├── hub-web/
│   │   └── src/
│   │       ├── pages/OverviewPage.tsx
│   │       ├── components/InstanceCard.tsx
│   │       ├── components/LaunchDialog.tsx
│   │       ├── hooks/useInstances.ts
│   │       ├── hooks/useLaunchInstance.ts
│   │       ├── api/client.ts
│   │       └── state/ui.ts
│   └── hub-service/
│       └── src/
│           ├── server.ts
│           ├── routes/health.ts
│           ├── routes/instances.get.ts
│           ├── routes/instances.post.ts
│           ├── domain/instance-model.ts
│           ├── domain/instance-registry.ts
│           ├── domain/state-reconciler.ts
│           ├── launcher/ccv-launcher.ts
│           ├── launcher/process-supervisor.ts
│           └── infra/logger.ts
└── packages/
    └── shared-contracts/
```

## 8. 模块职责建议

### 8.1 `apps/hub-web`

- 渲染总览页
- 渲染实例卡片
- 管理启动弹窗
- 管理 loading / empty / list-ready / launch-failed / discovery-error 五类状态
- 本地执行项目名筛选

### 8.2 `apps/hub-service`

- 暴露健康检查接口
- 暴露运行中实例接口
- 暴露启动新实例接口
- 维护实例注册表
- 处理实例退出收敛
- 屏蔽内部状态，只对页面返回 `running`

### 8.3 `packages/shared-contracts`

- 定义 `Instance` schema
- 定义错误码
- 定义 API 响应类型
- 作为前后端共享契约单元

### 8.4 `docs/adr`

当前 ADR 已固定以下决策：

- 首版选择轮询作为实例同步主路径，SSE 列表同步后置
- 首版使用内存注册表作为运行态真相源，数据库持久化后置
- 公网 bridge 经 2026-04-24 明确触发进入当前实现，viewer 子域名链路已完成 2026-04-25 实机验证

## 9. 状态模型落地建议

### 9.1 页面可见状态

- `running`

### 9.2 系统内部状态

- `starting`
- `stale`
- `exited`
- `removed`

### 9.3 状态处理原则

- 只有启动成功且 URL 可用的实例才登记为 `running`
- 退出、异常或超时实例进入内部收敛流程
- `GET /api/instances` 只返回 `running`
- 页面不承载内部状态分支，复杂度集中在服务端

## 10. API 与共享契约建议

严格沿用 `docs/api/api.md`：

- `GET /api/health`
- `GET /api/instances`
- `POST /api/instances`

统一响应格式：

```json
{
  "ok": true,
  "data": {}
}
```

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_PATH",
    "message": "Project path is invalid"
  }
}
```

共享契约应覆盖：

- `Instance`
- `ErrorCode`
- `ApiSuccess<T>`
- `ApiFailure`
- `HealthResponse`
- `ListInstancesResponse`
- `CreateInstanceRequest`
- `CreateInstanceResponse`

## 11. 与现有 ccv-hub 原型的衔接

以下现有文件可直接作为真实工程的输入：

- `ccv-hub/prototype/app.js:76` 到 `ccv-hub/prototype/app.js:107`
  - 已定义 `list-ready`、`loading`、`empty`、`discovery-error`、`launch-failed` 五类页面状态参考。
- `ccv-hub/prototype/app.js:126` 到 `ccv-hub/prototype/app.js:233`
  - 已展示卡片渲染、状态切换与弹窗反馈方式，可作为 React 组件拆分依据。
- `ccv-hub/prototype/docker-compose.yml:1`
  - 已定义原型接入 Dokploy 网络的基本方式，可作为当前公网路由部署参考。

## 12. 与现有 cc-viewer 复用点的关系

以下能力是当前公网 viewer 子域名桥接的复用锚点：

- `cc-viewer/server.js:2474` 的 `/api/local-url`
- `cc-viewer/server.js:2938` 的 `serverStarted` hook 调用点
- `cc-viewer/server.js:3254` 的 `serverStopping` hook 调用点
- `cc-viewer/lib/plugin-loader.js:13`
- `cc-viewer/lib/plugin-loader.js:14`
- `cc-viewer/lib/plugin-loader.js:15`

这些点支撑插件层把 raw upstream 上报给 Hub，再由 Hub 生成公网 viewer 子域名地址。

## 13. 后续增强技术项

以下技术方向保留为后续批次：

- SSE 作为实例列表同步主路径
- SQLite 持久化
- 收藏、最近打开、分组视图、历史实例
- 轻量健康状态细节
- viewer URL token 暴露面与重复 token 参数收口
- 公网 bridge 的结构化日志、运维观测与路由变更回归基线

## 14. 风险与验证

### 14.1 版本兼容性验证

初始化工程后需要先验证：

- Node 24.x 与 Bun 1.3 / Vite 8 / React 19 的组合是否稳定
- Fastify 5 与 TypeScript 6 / tsx 4 的组合是否稳定
- React Query 5 与 React 19 的组合是否稳定

### 14.2 启动与登记验证

- 合法路径能否稳定拉起 `cc-viewer`
- 能否稳定拿到 `pid / port / url`
- 登记失败时能否避免半状态泄漏

### 14.3 收敛与刷新验证

- 优雅退出、异常退出、手动 kill 后实例是否在可接受时间内移除
- 2 秒轮询在本地场景下是否足够顺滑
- 页面后台降频后是否仍保持体验稳定

### 14.4 公网能力验证

2026-04-25 已完成以下公网 viewer 链路实机验证：

- Hub 首页与 `/api/instances` 可通过 `ccv-hub-dev.paas.s3n.top` 访问
- Dokploy / Traefik viewer 子域名可路由到 Hub bridge
- Web 容器可通过 `host.docker.internal:4318` 回连宿主机 Hub service
- Dokploy 只管理 Web 容器公网入口，Hub service 保持宿主机 systemd 运行
- Hub bridge 可访问 upstream 动态端口
- Hub 页面启动的 `cc-viewer` 继承宿主机 `opc` 用户环境、`PATH` 与 `CLAUDE_CONFIG_DIR`
- viewer 子域名下 HTML、静态资源、业务 API、SSE、WebSocket 均正常

## 15. 分阶段实施建议

### Phase 0：版本矩阵冻结

- 锁定 Node、Bun、TypeScript、React、Vite、Fastify、React Query、zod、pino、Vitest、tsx
- 跑通最小工作区工程
- 冻结 lockfile

### Phase 1：MVP 主闭环

- 完成本地服务骨架
- 完成共享契约包
- 完成总览页和启动弹窗
- 完成列表读取、启动、复制、打开、筛选
- 完成运行中实例收敛

### Phase 2：稳定性增强

- 增加结构化日志
- 增加测试
- 增加轻量 JSON 快照恢复

### Phase 3：体验增强

- 收藏或最近打开
- SSE 推送
- 更细的健康信息

### Phase 4：公网访问增强（已并入当前实现）

以下内容已由 2026-04-24 明确触发进入当前实现，并在 2026-04-25 完成实机验证：

- Dokploy / Traefik / nginx / Hub bridge viewer 子域名链路
- `localUrl / serverStarted / serverStopping` 复用点接入
- `url` 升级为公网 viewer 子域名优先地址

后续公网相关工作聚焦 token 暴露收口、重复 token 参数处理、结构化日志、健康信息与路由变更回归。

## 16. 验证基线

- `GET /api/health` 正常返回
- `GET /api/instances` 只返回运行中实例且顺序正确
- `POST /api/instances` 对合法路径返回完整实例
- 非法路径返回统一错误结构
- 页面完整覆盖 loading / list-ready / empty / launch-failed / discovery-error
- viewer 子域名公网地址可加载页面、静态资源、业务 API、SSE 与 WebSocket
- Hub 页面启动的新 viewer 继承宿主机 `opc` 用户环境、`PATH` 与 `CLAUDE_CONFIG_DIR`
- 桌面、平板、手机视口均可读、可点、可理解

## 17. 结论

`ccv-hub` 的首版技术路线应该采用**最新稳定大版本优先**的现代前后端组合：前端用 React 19 + Vite 8 + 原型 CSS，后端用 Fastify 5 + TypeScript 6，实例契约由 zod 统一，状态同步以轮询为主，运行态真相源以内存注册表为主。这个组合最贴合当前文档约束，也为后续样式系统升级与公网访问增强保留了足够清晰的演进路径。