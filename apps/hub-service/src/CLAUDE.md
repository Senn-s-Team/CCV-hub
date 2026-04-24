# src/
> L2 | 父级: ../CLAUDE.md

成员清单
server.ts: Fastify 服务装配入口，挂载健康检查、实例列表、创建、外部注册与外部注销路由
domain/: 领域模型目录，负责实例记录、状态流转、路径校验与错误归一
infra/: 基础设施目录，负责服务日志能力
launcher/: cc-viewer 启动器目录，负责 CLI 进程启动、URL 解析、环境收敛与退出监督
routes/: HTTP 路由目录，负责把实例列表、创建、外部注册、外部注销与健康检查暴露给前端和插件

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
