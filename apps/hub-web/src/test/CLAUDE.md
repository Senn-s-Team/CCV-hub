# test/
> L2 | 父级: ../CLAUDE.md

成员清单
auth-gate.test.tsx: 鉴权守门层测试，覆盖检查态、未登录态、登录成功与登录失败
overview-page.test.tsx: 总览页回归测试，覆盖列表、抽象主题切换、移动端状态抽屉、筛选、loading、discovery-error、服务端失败消息、empty、响应式启动弹窗、最近路径历史、目录搜索、移动端参数折叠、启动参数提交、生命周期停止、退出动作与复制链接
nginx-config.test.ts: nginx 静态资源路由测试，覆盖 missing hashed assets 返回 404 而不回退 SPA HTML
vite-config.test.ts: Vite 代理分流测试，覆盖 Hub SPA、Hub API 与 `/viewer/<bridgeId>` path 规则

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
