# ccv-hub - 本机 cc-viewer 实例总览

> L1 | 父级: ../CLAUDE.md

<directory>
docs/ - 产品、架构与设计文档（6 子目录: prd, ia, system, api, design, adr）
prototype/ - 高保真静态原型目录（4 文件: index.html, styles.css, app.js, docker-compose.yml）
apps/ - 运行时应用目录（2 子目录: hub-web, hub-service）
packages/ - 共享模块目录（1 子目录: shared-contracts）
deploy/ - Dokploy 与本地容器部署目录（2 文件: docker-compose.hub.yml, ccv-hub-plugin.mjs）
</directory>

<config>
CLAUDE.md - ccv-hub 模块地图、职责边界与文档协议
package.json - workspace 根配置，定义 Bun 脚本、工作区与根级类型依赖
tsconfig.json - ccv-hub 根 TypeScript 基线配置
.gitignore - 本地依赖、锁文件与构建产物忽略规则
bun.lock - Bun 锁文件，固定 workspace 依赖解析结果
</config>

## 模块定位

`ccv-hub/` 是独立于 `cc-viewer/` 的实例总览项目，职责是汇总同一台机器上正在运行的 `cc-viewer` 实例，并提供统一列表、一键打开、复制链接等入口能力。

## 当前结构

- `docs/prd/` - 存放产品需求文档，定义目标用户、范围、交互与验收标准。
- `docs/ia/` - 存放信息架构文档，定义页面清单、结构层级、主流程与状态边界。
- `docs/system/` - 存放系统设计文档，定义组件职责、数据流、状态流转与异常处理。
- `docs/api/` - 存放接口契约文档，定义本地服务接口、请求响应结构与实例对象格式。
- `docs/design/` - 存放 UI/UX 设计文档，定义视觉语言、页面原型规则、状态表达与跨端体验基线。
- `docs/adr/` - 存放架构决策记录，固定关键技术取舍、阶段边界与实现原则。
- `apps/hub-service/` - 本地常驻服务实现，负责健康检查、实例查询、统一入口启动与状态收敛。
- `apps/hub-web/` - 总览页实现，负责实例展示、项目名筛选、启动弹窗、复制与轮询刷新。
- `packages/shared-contracts/` - 前后端共享契约实现，负责 Instance schema、响应结构与错误码。
- `deploy/` - 部署资产目录，负责 Hub 的 Docker Compose 清单、Dokploy 接入入口与 cc-viewer 插件安装源。

## 设计法则

- `cc-viewer/` 继续负责单实例运行与内容展示。
- `ccv-hub/` 只负责实例发现、实例目录和统一入口。
- 文档优先表达实例模型、发现机制与页面边界。
- 变更目录结构或新增模块时，立即回写本文件。
