# docs/
> L2 | 父级: ../CLAUDE.md

成员清单
prd/: 产品需求目录，存放 ccv-hub 的目标定义、范围边界与验收标准
ia/: 信息架构目录，存放页面结构、导航层级、状态与交互边界
system/: 系统设计目录，存放组件划分、运行流程、数据流与异常处理
api/: 接口契约目录，存放本地服务接口、请求响应结构与实例模型
design/: UI/UX 设计目录，存放总规范、页面原型规则、状态表达与评审基线
adr/: 架构决策目录，存放关键技术决策、阶段边界与取舍理由

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md

## Coding agent 使用协议

### 阅读顺序

实现前按以下顺序读取文档：

1. `docs/CLAUDE.md`
2. `docs/prd/ccv-hub-prd.md`
3. `docs/ia/ia.md`
4. `docs/system/system.md`
5. `docs/api/api.md`
6. `docs/design/design-foundation.md`
7. `docs/design/screens-and-states.md`
8. `docs/adr/0001-polling-before-sse.md`
9. `docs/adr/0002-in-memory-registry-before-database.md`
10. `docs/adr/0003-defer-public-bridge-out-of-mvp.md`
11. `docs/system/tech-stack.md`

### 文档职责

- `prd/`：定义产品范围、非目标与验收标准，回答“该不该做”。
- `ia/`：定义页面骨架、主流程、信息层级与状态边界，回答“页面怎么组织”。
- `system/`：定义组件职责、数据流、状态流转与异常处理，回答“系统怎么分工”。
- `api/`：定义接口、字段、排序与错误结构，回答“前后端怎么对齐”。
- `design/`：定义视觉层级、交互反馈与跨端行为，回答“体验怎么落地”。
- `adr/`：定义已经接受的关键技术决策，回答“哪些技术取舍已经封板”。
- `system/tech-stack.md`：给出推荐技术栈与版本矩阵，回答“优先用什么实现”。

### 实现硬边界

- 范围限定为单机运行。
- 不修改 `cc-viewer` 源码。
- 首版只展示运行中实例。
- 首版页面固定为总览页 + 启动弹窗。
- `GET /api/instances` 只返回 `running`，且按 `startedAt` 降序。
- `POST /api/instances` 只接受绝对路径，且禁止把半状态实例返回给页面。
- 内部状态 `starting / stale / exited / removed` 只留在服务端收敛流程中。

### MVP 禁止扩张项

- 不引入 SSE 作为实例列表同步主路径。
- 不引入数据库作为首版主存储。
- Dokploy / Traefik / Hub bridge 已由 ADR 0003 纳入当前 viewer 子域名实现。
- 不增加历史实例、详情页、高级筛选、分组、权限协作、云同步。

### 文档冲突优先级

按以下优先级执行：

`ADR > PRD > API > System > IA > Design > Tech Stack`

执行规则：

- 范围与阶段边界冲突时，以 `ADR` 与 `PRD` 为准。
- 对外字段、状态与错误结构冲突时，以 `api/` 为准。
- 页面结构与体验细节冲突时，以 `ia/` 和 `design/` 为准。
- 技术栈建议服务实现效率，不覆盖已接受的架构决策。

### Coding agent 开工前检查

- 先确认当前任务属于 MVP 范围。
- 先确认改动没有越过 ADR 已封板的技术边界。
- 先确认接口、字段、状态与错误格式严格对齐 `docs/api/api.md`。
- 先确认页面结构、状态和动作严格对齐 `docs/ia/` 与 `docs/design/`。
- 若实现导致目录结构变化，立即同步更新当前目录与父目录的 `CLAUDE.md`。
