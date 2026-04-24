# hub-service/
> L2 | 父级: ../CLAUDE.md

成员清单
src/: Fastify 源码目录，负责服务入口、viewer bridge、路由、实例注册表、启动器与日志
test/: 服务端测试目录，负责接口、排序过滤与状态收敛验证
package.json: hub-service 包配置，定义服务依赖、脚本与运行入口
Dockerfile: hub-service 容器镜像构建文件，负责产出内置 Node 与 Bun 安装器的 Dokploy 可运行服务镜像并默认执行 Fastify 入口
tsconfig.json: hub-service TypeScript 配置，约束服务端编译上下文

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
