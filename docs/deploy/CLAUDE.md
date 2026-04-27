# deploy/
> L2 | 父级: ../CLAUDE.md

成员清单
overview.md: 开源部署总览，定义 ccv-hub-web 控制面、ccv-hub-agent 执行面、平台适配器与默认部署拓扑
modes.md: 部署模式拆分，定义 Local、Docker Compose、Dokploy、Caddy、Nginx、Kubernetes 与高级 Docker 的适用边界
release-plan.md: release 部署方案，定义版本产物、发布流水线、升级、回滚、验证与安全收口
progress.md: 开源部署改进进度，记录阶段任务、状态、验证证据、阻塞项与下一步执行顺序
compose.md: Docker Compose 开源主路径文档，定义 image-only Web 容器、宿主机 systemd Agent、变量配置与 smoke path
dokploy.md: Dokploy/Traefik 平台适配文档，定义 Dokploy 网络、Traefik router、viewer HostRegexp 与宿主机 Agent 接入
caddy.md: Caddy 平台适配文档，定义自动 HTTPS、Hub 主域名、viewer wildcard 与 Agent bridge 反代
nginx.md: Nginx 平台适配文档，定义静态 Web、/api 代理、viewer wildcard、SSE 与 WebSocket 反代规则
kubernetes.md: Kubernetes Web 控制面文档，定义 Deployment、Service、Ingress 与节点宿主机 Agent 边界

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
