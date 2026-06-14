# domain/
> L2 | 父级: ../CLAUDE.md

成员清单
auth-session.ts: 面板会话模块，负责环境变量解析、管理员口令校验、HMAC session token 签发、验证与跨 viewer 子域 cookie 配置
bridge-url.ts: viewer bridge 地址模块，负责公网子域名生成、Host 解析与 upstream token 注入规则
error-mapper.ts: 错误归一模块，负责 AppError、错误码映射与失败响应生成
instance-model.ts: 实例模型模块，负责公开 Instance、canStop 能力标记与内部 upstream/bridge 记录的转换
instance-registry.ts: 实例注册表模块，负责运行态真相源、bridge 查找、存活探测与状态收敛
hub-plugin-installer.ts: Hub 插件安装模块，负责在显式启用后把受管 deploy/ccv-hub-plugin.mjs 安全同步到 cc-viewer 用户插件目录以启用 logger 实例发现
host-path-browser.ts: 宿主机路径浏览模块，负责 allowlist 根目录、realpath 越界校验、敏感目录过滤与目录枚举
path-validator.ts: 路径校验模块，负责启动请求中的项目绝对路径边界

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
