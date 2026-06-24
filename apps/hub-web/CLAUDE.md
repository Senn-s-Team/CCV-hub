# hub-web/
> L2 | 父级: ../CLAUDE.md

成员清单
src/: React 源码目录，负责总览页、实例卡片、启动弹窗、查询 hooks、UI 状态与前端回归测试
index.html: Vite 页面入口，先预设主题 data 属性，再挂载根节点并注入字体资源
package.json: hub-web 包配置，定义前端依赖、共享契约预构建、脚本与构建入口
vite.config.ts: Vite 构建配置，定义 React 集成、可配置 Hub 主机名、`/api` 与 `/viewer` path 代理、受信任访问域名与 jsdom 测试环境
Dockerfile: hub-web 容器镜像构建文件，先构建 shared-contracts 与静态站，再把 nginx 环境变量模板交给官方 entrypoint 渲染
nginx.conf: hub-web 边缘入口模板，负责 SPA 静态资源、missing assets 404、/api 反向代理与同 host /viewer/ 到宿主机 Agent 的桥接入口
tsconfig.json: hub-web TypeScript 配置，约束前端编译上下文

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
