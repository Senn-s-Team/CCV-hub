# scripts/
> L2 | 父级: ../CLAUDE.md

成员清单
package-agent-release.mjs: Agent release 打包脚本，构建 shared-contracts 与 hub-service，并产出包含 dist、package metadata、完整 workspace manifests、systemd unit、.env.agent 模板和安装脚本的 tarball
package-web-release.mjs: Web release 打包脚本，构建 hub-web，并产出包含 dist 静态资源与 nginx 默认模板的 tarball
rehearse-release.mjs: release rehearsal 编排脚本，串联 lint、test、build、打包、Compose 模板验证、smoke、checksums 与 evidence report
install-agent-release.sh: Agent release 安装脚本，负责接收 tarball 或解包目录、解包版本目录、安装 production 依赖、切换 current symlink、安装 .env.agent 模板与 systemd unit
smoke-release.mjs: release smoke 验证脚本，检查 Hub health、auth、instances，并按环境变量验证 launch、viewer HTTP/SSE、HTTP 或 HTTPS WebSocket handshake 与 stop 收敛

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
