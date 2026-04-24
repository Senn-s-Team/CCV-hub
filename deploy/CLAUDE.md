# deploy/
> L2 | 父级: ../CLAUDE.md

成员清单
docker-compose.hub.yml: ccv-hub 的 Web + Service 联合部署清单，定义宿主机代码挂载、Claude/Node 运行时透传、本地端口、Node 服务入口、Dokploy 网络、Hub 固定域名路由与直连 service 的 viewer 通配子域名路由
ccv-hub-plugin.mjs: cc-viewer 生命周期插件，负责把手动启动/停止事件注册到 hub-service

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
