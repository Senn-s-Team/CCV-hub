#!/usr/bin/env bash
# [INPUT]: 依赖 Agent release tarball 或解包目录、/opt/ccv-hub-agent、/etc/ccv-hub、systemd、Node/Bun 运行环境与 bun.lock 生产依赖
# [OUTPUT]: 对外提供 tarball 解包、版本目录安装、production 依赖安装、current symlink 切换、.env.agent 初始化、ccv-hub-agent.service 安装与可选重启能力
# [POS]: scripts 的 Agent 安装入口，把 release 产物安装为宿主机 systemd release，重启边界由调用方显式控制
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
set -euo pipefail

release_input="${1:?usage: install-agent-release.sh <release-tarball-or-dir>}"
install_root="${CCV_HUB_AGENT_INSTALL_ROOT:-/opt/ccv-hub-agent}"
env_dir="${CCV_HUB_AGENT_ENV_DIR:-/etc/ccv-hub}"
service_dir="${CCV_HUB_SYSTEMD_DIR:-/etc/systemd/system}"
bun_bin="${BUN_BIN:-}"
restart_service="${CCV_HUB_AGENT_RESTART:-1}"
staging_dir=""

cleanup() {
  if [ -n "$staging_dir" ]; then
    rm -rf "$staging_dir"
  fi
}
trap cleanup EXIT

require_absolute_path() {
  case "$2" in
    /*) ;;
    *)
      echo "$1 must be an absolute path: $2" >&2
      exit 2
      ;;
  esac
}

resolve_release_dir() {
  case "$release_input" in
    *.tar.gz|*.tgz)
      staging_dir="$(mktemp -d)"
      tar -tzf "$release_input" | validate_tarball_layout || {
        echo "release tarball must contain exactly one safe top-level directory" >&2
        exit 2
      }
      tar -xzf "$release_input" -C "$staging_dir"
      find "$staging_dir" -mindepth 1 -maxdepth 1 -type d
      ;;
    *)
      printf '%s\n' "$release_input"
      ;;
  esac
}

validate_tarball_layout() {
  awk -F/ '
    NF && $1 != "" && $1 != "." { roots[$1] = 1 }
    END {
      for (root in roots) {
        count++
        name = root
      }
      if (count != 1) exit 1
      if (name == ".." || name ~ /^-/) exit 1
    }
  '
}

require_absolute_path CCV_HUB_AGENT_INSTALL_ROOT "$install_root"
require_absolute_path CCV_HUB_AGENT_ENV_DIR "$env_dir"
require_absolute_path CCV_HUB_SYSTEMD_DIR "$service_dir"

release_dir="$(resolve_release_dir)"
version="$(basename "$release_dir")"
target_dir="$install_root/releases/$version"

case "$version" in
  ''|'.'|'..'|*'/'*)
    echo "invalid release directory name: $version" >&2
    exit 2
    ;;
esac

if [ -z "$bun_bin" ]; then
  bun_bin="$(command -v bun || true)"
fi
if [ -z "$bun_bin" ] && [ -x /home/opc/.bun/bin/bun ]; then
  bun_bin=/home/opc/.bun/bin/bun
fi
if [ -z "$bun_bin" ]; then
  echo "bun executable not found; set BUN_BIN=/path/to/bun" >&2
  exit 127
fi

install -d "$install_root/releases" "$env_dir"
rm -rf "$target_dir"
cp -a "$release_dir" "$target_dir"
(cd "$target_dir" && "$bun_bin" install --production --frozen-lockfile)
ln -sfn "$target_dir" "$install_root/current"

if [ ! -f "$env_dir/.env.agent" ]; then
  legacy_env="$env_dir/agent.env"
  if [ -f "$legacy_env" ]; then
    install -m 0600 "$legacy_env" "$env_dir/.env.agent"
  else
    install -m 0600 "$target_dir/deploy/.env.agent.example" "$env_dir/.env.agent"
  fi
fi
chmod 600 "$env_dir/.env.agent"
if [ "$(id -u)" -eq 0 ]; then
  chown root:root "$env_dir/.env.agent"
fi

install -m 0644 "$target_dir/deploy/ccv-hub-agent.service" "$service_dir/ccv-hub-agent.service"
systemctl daemon-reload
systemctl enable ccv-hub-agent.service
if [ "$restart_service" = "1" ]; then
  systemctl restart ccv-hub-agent.service
  systemctl is-active ccv-hub-agent.service
else
  echo "ccv-hub-agent.service installed; restart skipped by CCV_HUB_AGENT_RESTART=$restart_service"
fi
