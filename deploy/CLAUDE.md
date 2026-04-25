# deploy/
> L2 | 父级: ../CLAUDE.md

成员清单
docker-compose.hub.yml: ccv-hub-dev 的 Dokploy Web-only 公网入口清单，定义 nginx Web 容器、host.docker.internal 回连宿主机 Hub service、Dokploy 网络、Hub 域名路由与 viewer 子域名路由；同步到 Dokploy raw compose 时 build context 需改为仓库绝对路径
ccv-hub-service.service: ccv-hub-service 的宿主机 systemd 单元，负责以 opc 用户真实系统环境运行 Hub 启动器与 bridge 服务，是宿主机 Claude runtime 的唯一长期入口
ccv-hub-plugin.mjs: cc-viewer 生命周期插件，负责把手动启动/停止事件注册到宿主机 hub-service

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
