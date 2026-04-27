# shared-contracts/
> L2 | 父级: ../CLAUDE.md

成员清单
src/: 共享契约源码目录，负责实例 schema、错误码、响应模型与类型导出
test/: 共享契约测试目录，负责 schema 解析与示例 payload 验证
package.json: shared-contracts 包配置，定义 zod、脚本、dist JS 入口与声明文件入口
tsconfig.json: shared-contracts TypeScript 配置，约束 src 到 dist 的共享契约 release 编译上下文

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
