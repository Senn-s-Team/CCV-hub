# deploy/
> L2 | 父级: ../CLAUDE.md

成员清单
overview.md: 开源部署总览，定义 ccv-hub-web 控制面、ccv-hub-agent 执行面、同 host `/viewer/*` bridge、平台适配器与默认部署拓扑
modes.md: 部署模式拆分，定义 Local、Docker Compose、Dokploy、Caddy、Nginx、Kubernetes 与高级 Docker 的适用边界
release-plan.md: release 部署方案，定义版本产物、发布流水线、rehearsal、升级、回滚、验证与安全收口
release-checklist.md: release 验证清单，定义构建、模板验证、Agent/Web 部署、release rehearsal、smoke test、手工深度验证与回滚演练
troubleshooting.md: 部署故障排查文档，定义 Agent、鉴权、API、viewer path bridge、SSE、WebSocket、停止与回滚问题的检查路径
progress.md: 开源部署改进进度，记录阶段任务、状态、验证证据、rehearsal 入口、阻塞项与下一步执行顺序
compose.md: Docker Compose 开源主路径文档，定义 image-only Web 容器、宿主机 systemd Agent、viewer path 变量配置与 smoke path
dokploy.md: Dokploy/Traefik 平台适配文档，定义 Dokploy 网络、单 Hub host Traefik router、同 host viewer path 与宿主机 Agent 接入
caddy.md: Caddy 平台适配文档，定义自动 HTTPS、Hub 主域名、同 host viewer path 与 Agent bridge 反代
nginx.md: Nginx 平台适配文档，定义静态 Web、/api 代理、同 host /viewer/、SSE 与 WebSocket 反代规则
kubernetes.md: Kubernetes Web 控制面文档，定义 Deployment、Service、单 Hub host Ingress、viewer path 与节点宿主机 Agent 边界

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
