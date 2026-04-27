# scripts/
> L2 | 父级: ../CLAUDE.md

成员清单
package-agent-release.mjs: Agent release 打包脚本，构建 shared-contracts 与 hub-service，并产出包含 dist、package metadata、完整 workspace manifests、systemd unit、agent.env 模板和安装脚本的 tarball
package-web-release.mjs: Web release 打包脚本，构建 hub-web，并产出包含 dist 静态资源与 nginx 默认模板的 tarball
install-agent-release.sh: Agent release 安装脚本，负责解压版本目录、切换 current symlink、安装 agent.env 模板与 systemd unit

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
