# routes/
> L2 | 父级: ../CLAUDE.md

成员清单
auth.ts: 面板鉴权路由，挂载登录、登出、登录态接口，并保护公网面板 API
health.ts: 健康检查路由，挂载 `GET /api/health` 并返回服务存活状态
instances.get.ts: 实例列表路由，挂载 `GET /api/instances`，清理死亡实例后返回运行列表
instances.post.ts: 实例创建路由，挂载 `POST /api/instances`，校验启动参数并通过 Hub 启动器创建 cc-viewer 实例
instances.register.ts: 外部实例注册路由，挂载 `POST /api/instances/register`，接收 cc-viewer 插件上报的手动启动实例
instances.unregister.ts: 外部实例注销路由，挂载 `POST /api/instances/unregister`，接收 cc-viewer 插件上报的手动停止事件
viewer-bridge.ts: viewer 子域名桥接路由，按 `ccv-*` Host 反代 HTTP/SSE/WebSocket 到对应 cc-viewer upstream

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
