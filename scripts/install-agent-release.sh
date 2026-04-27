#!/usr/bin/env bash
# [INPUT]: 依赖 Agent release tarball、/opt/ccv-hub-agent、/etc/ccv-hub、systemd 与 Node/Bun 运行环境
# [OUTPUT]: 对外提供版本目录安装、current symlink 切换、agent.env 初始化与 ccv-hub-agent.service 安装能力
# [POS]: scripts 的 Agent 安装入口，把 tarball 解包结果安装为宿主机 systemd release
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
set -euo pipefail

release_dir="${1:?usage: install-agent-release.sh <extracted-release-dir>}"
install_root="${CCV_HUB_AGENT_INSTALL_ROOT:-/opt/ccv-hub-agent}"
env_dir="${CCV_HUB_AGENT_ENV_DIR:-/etc/ccv-hub}"
service_dir="${CCV_HUB_SYSTEMD_DIR:-/etc/systemd/system}"
version="$(basename "$release_dir")"
target_dir="$install_root/releases/$version"

install -d "$install_root/releases" "$env_dir"
rm -rf "$target_dir"
cp -a "$release_dir" "$target_dir"
ln -sfn "$target_dir" "$install_root/current"

if [ ! -f "$env_dir/agent.env" ]; then
  install -m 0600 "$target_dir/deploy/agent.env.example" "$env_dir/agent.env"
fi

install -m 0644 "$target_dir/deploy/ccv-hub-agent.service" "$service_dir/ccv-hub-agent.service"
systemctl daemon-reload
systemctl enable ccv-hub-agent.service
systemctl restart ccv-hub-agent.service
systemctl is-active ccv-hub-agent.service
