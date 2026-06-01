# routes/
> L2 | 父级: ../CLAUDE.md

成员清单
auth.ts: 面板鉴权路由，挂载登录、登出、登录态接口，并保护公网面板 API 与 viewer bridge 保留路径
health.ts: 健康检查路由，挂载 `GET /api/health` 并返回服务存活状态
host-paths.ts: 宿主机路径浏览路由，挂载 `GET /api/host-paths/roots` 与 `GET /api/host-paths/list`，为启动弹窗提供 allowlist 内目录
instances.get.ts: 实例列表路由，挂载 `GET /api/instances`，清理死亡实例后返回运行列表
instances.post.ts: 实例创建路由，挂载 `POST /api/instances`，校验启动参数并通过 Hub 启动器创建 cc-viewer 实例
instances.lifecycle.ts: 实例生命周期路由，挂载 `POST /api/instances/:id/actions/:action`，执行 hub 持有停止句柄实例的 stop 与 force-stop
instances.register.ts: 外部实例注册路由，挂载 `POST /api/instances/register`，接收带 token 的 cc-viewer 插件上报实例并避免覆盖 hub 启动实例
instances.unregister.ts: 外部实例注销路由，挂载 `POST /api/instances/unregister`，接收 cc-viewer 插件上报的手动停止事件并只移除 manual 实例
viewer-bridge.ts: viewer 子域名桥接路由，按 `ccv-*` Host 与实例级 token 反代 HTTP/SSE/multipart/WebSocket 到对应 cc-viewer upstream

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
