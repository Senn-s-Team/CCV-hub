# hub-service/
> L2 | 父级: ../CLAUDE.md

成员清单
src/: Fastify 源码目录，负责服务入口、logger 插件播种、viewer bridge、路由、实例注册表、启动器与日志
test/: 服务端测试目录，负责接口、排序过滤、logger 插件安装与状态收敛验证
package.json: hub-service 包配置，定义服务依赖、源码开发脚本、release 构建脚本与 dist/server.js 运行入口
Dockerfile: hub-service 容器镜像构建文件，先构建 shared-contracts 与 hub-service，并携带 Hub 插件再运行 dist/server.js 形成 Agent 镜像
tsconfig.json: hub-service TypeScript 配置，约束 src 到 dist 的 release 编译上下文

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
