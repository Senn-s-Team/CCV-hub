# deploy/
> L2 | 父级: ../CLAUDE.md

成员清单
docker-compose.hub.yml: ccv-hub-web 的可模板化公网入口清单，定义 nginx Web 容器、host.docker.internal 回连宿主机 Agent、可配置 Docker 网络、Hub 域名路由与 viewer 子域名路由；dev 默认值表达当前 Dokploy 环境，release 通过环境变量替换域名、端口和 viewer 前缀
ccv-hub-agent.service: ccv-hub-agent 的宿主机 systemd release 单元，负责以 opc 用户真实系统环境从 /opt/ccv-hub-agent/current/apps/hub-service 运行 dist/server.js，并通过 /etc/ccv-hub/agent.env 覆盖端口、域名、路径、CLI 与 Claude 配置目录
ccv-hub-service.service: ccv-hub-agent.service 的过渡同内容别名，保留旧文件名引用期间的本地部署入口
agent.env.example: ccv-hub-agent 的 release 环境变量模板，定义公网域名、viewer 前缀、鉴权密钥、路径 allowlist、cc-viewer CLI 与 Claude 配置目录
ccv-hub-plugin.mjs: cc-viewer 生命周期插件，负责把手动启动/停止事件注册到宿主机 hub-service

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
