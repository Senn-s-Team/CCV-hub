# domain/
> L2 | 父级: ../CLAUDE.md

成员清单
auth-session.ts: 面板会话模块，负责环境变量解析、管理员口令校验、HMAC session token 签发与验证
bridge-url.ts: viewer bridge 地址模块，负责公网子域名生成、Host 解析与 upstream token 注入
error-mapper.ts: 错误归一模块，负责 AppError、错误码映射与失败响应生成
instance-model.ts: 实例模型模块，负责公开 Instance 与内部 upstream/bridge 记录的转换
instance-registry.ts: 实例注册表模块，负责运行态真相源、bridge 查找、存活探测与状态收敛
path-validator.ts: 路径校验模块，负责启动请求中的项目绝对路径边界

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
