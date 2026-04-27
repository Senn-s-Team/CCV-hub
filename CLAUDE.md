# ccv-hub - 本机 cc-viewer 实例总览

> L1 | 父级: ../CLAUDE.md

<directory>
docs/ - 产品、架构、设计与部署文档（7 子目录: prd, ia, system, api, design, adr, deploy）
prototype/ - 高保真静态原型目录（4 文件: index.html, styles.css, app.js, docker-compose.yml）
apps/ - 运行时应用目录（2 子目录: hub-web, hub-service）
packages/ - 共享模块目录（1 子目录: shared-contracts）
scripts/ - release 与安装脚本目录（4 文件: CLAUDE.md, package-agent-release.mjs, package-web-release.mjs, install-agent-release.sh）
deploy/ - Web 入口与宿主机 Agent release 部署目录（9 文件: docker-compose.hub.yml, docker-compose.standalone.yml, Caddyfile.example, nginx.hub.conf.example, kubernetes-web.yaml, ccv-hub-agent.service, ccv-hub-service.service, agent.env.example, ccv-hub-plugin.mjs）
</directory>

<config>
CLAUDE.md - ccv-hub 模块地图、职责边界与文档协议
package.json - workspace 根配置，定义 Bun 脚本、工作区、根级类型依赖、Agent/Web release 打包命令与宿主机 Agent 部署命令
tsconfig.json - ccv-hub 根 TypeScript 基线配置
.gitignore - 本地依赖、锁文件、构建产物、release 打包产物与本机 .env 忽略规则
.env.example - 本机服务鉴权、Web image tag、Agent upstream 与宿主机路径 allowlist 环境变量模板，真实 .env 只留在宿主机
bun.lock - Bun 锁文件，固定 workspace 依赖解析结果
</config>

## 模块定位

`ccv-hub/` 是独立于 `cc-viewer/` 的实例总览项目，职责是汇总同一台机器上正在运行的 `cc-viewer` 实例，并提供统一列表、一键打开、复制链接等入口能力。

## 当前结构

- `docs/prd/` - 存放产品需求文档，定义目标用户、范围、交互与验收标准。
- `docs/ia/` - 存放信息架构文档，定义页面清单、结构层级、主流程与状态边界。
- `docs/system/` - 存放系统设计与阶段性收口文档，定义组件职责、数据流、状态流转与异常处理。
- `docs/api/` - 存放接口契约文档，定义本地服务接口、请求响应结构与实例对象格式。
- `docs/design/` - 存放 UI/UX 设计文档，定义视觉语言、页面原型规则、状态表达与跨端体验基线。
- `docs/adr/` - 存放架构决策记录，固定关键技术取舍、阶段边界与实现原则。
- `docs/deploy/` - 存放开源部署文档，定义 Web 控制面、宿主机 Agent、平台适配文档、release 产物与开发进度。
- `apps/hub-service/` - 本地常驻服务实现，负责健康检查、实例查询、统一入口启动与状态收敛。
- `apps/hub-web/` - 总览页实现，负责实例展示、项目名筛选、启动弹窗、复制与轮询刷新。
- `packages/shared-contracts/` - 前后端共享契约实现，负责 Instance schema、响应结构与错误码。
- `deploy/` - 部署资产目录，负责 Web image-only 公网入口、Compose/Caddy/Nginx/Kubernetes 平台模板、宿主机 `ccv-hub-agent` release systemd 单元、agent.env 模板与 cc-viewer 插件安装源。
- `scripts/` - 存放 release 打包与安装脚本，负责 Web/Agent tarball 产物和宿主机安装流程。

## 设计法则

- `cc-viewer/` 继续负责单实例运行与内容展示。
- `ccv-hub/` 只负责实例发现、实例目录和统一入口。
- Dokploy 是 Web 控制面部署适配器之一，`hub-service` 对外演进为宿主机 `ccv-hub-agent` 以保留单一宿主机 Claude 环境。
- 文档优先表达实例模型、发现机制与页面边界。
- 变更目录结构或新增模块时，立即回写本文件。
