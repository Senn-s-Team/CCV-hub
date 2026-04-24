# hub-web/
> L2 | 父级: ../CLAUDE.md

成员清单
src/: React 源码目录，负责总览页、实例卡片、启动弹窗、查询 hooks、UI 状态与前端回归测试
index.html: Vite 页面入口，挂载根节点并注入字体资源
package.json: hub-web 包配置，定义前端依赖、脚本与构建入口
vite.config.ts: Vite 构建配置，定义 React 集成、可配置 Hub 主机名、API/bridge/WebSocket 代理、受信任访问域名与 jsdom 测试环境
Dockerfile: hub-web 容器镜像构建文件，负责产出静态站镜像
nginx.conf: hub-web 边缘入口配置，负责 SPA 静态资源、/api 反向代理与 viewer 子域名桥接入口
tsconfig.json: hub-web TypeScript 配置，约束前端编译上下文

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
