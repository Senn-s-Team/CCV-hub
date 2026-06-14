# deploy/
> L2 | 父级: ../CLAUDE.md

成员清单
docker-compose.hub.yml: ccv-hub-web 的 image-only Dokploy/Traefik release 公网入口清单，定义 Web image tag、host.docker.internal 回连宿主机 Agent、可配置 Docker 网络、Hub 域名路由与 viewer 子域名路由；release 通过环境变量替换 image、域名、端口和 viewer 前缀
docker-compose.standalone.yml: ccv-hub-web 的 image-only 通用 Compose 入口清单，定义 Web image tag、本机端口、host.docker.internal 回连宿主机 Agent 与公网域名变量
Caddyfile.example: Caddy 平台适配模板，定义 Hub 主域名静态站点、/api 代理与 viewer wildcard 到宿主机 Agent bridge 的反向代理
nginx.hub.conf.example: Nginx 平台适配模板，定义 Hub 静态站点、/api 代理、viewer wildcard、SSE 与 WebSocket 反向代理
kubernetes-web.yaml: Kubernetes Web 控制面模板，定义 ccv-hub-web Deployment、Service、Ingress 与节点可达 Agent upstream
ccv-hub-agent.service: ccv-hub-agent 的宿主机 systemd release 单元，负责以 opc 用户真实系统环境从 /opt/ccv-hub-agent/current/apps/hub-service 运行 dist/server.js，并通过 /etc/ccv-hub/.env.agent 覆盖端口、域名、路径、CLI 与 Claude 配置目录
ccv-hub-service.service: ccv-hub-agent.service 的过渡同内容别名，保留旧文件名引用期间的本地部署入口
.env.agent.example: ccv-hub-agent 的 release 环境变量模板，定义公网域名、viewer 前缀、Hub 插件回连地址、显式插件安装开关、鉴权密钥、路径 allowlist、cc-viewer CLI 与 Claude 配置目录
ccv-hub-plugin.mjs: cc-viewer 受管生命周期插件，默认以 logger 来源把启动与停止事件注册到宿主机 hub-service

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
