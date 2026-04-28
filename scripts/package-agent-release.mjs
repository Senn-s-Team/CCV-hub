#!/usr/bin/env node
/**
 * [INPUT]: 依赖 node:fs、node:child_process、workspace package metadata、hub-service/shared-contracts 构建产物与 deploy 模板
 * [OUTPUT]: 对外提供 build/ccv-hub-agent-<version>.tar.gz release 产物
 * [POS]: scripts 的 Agent 打包入口，把可运行 dist、包元数据、systemd unit、.env.agent 模板与安装脚本收敛为单一 tarball
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2] ?? process.env.CCV_HUB_RELEASE_VERSION ?? 'v0.0.0-dev';
const buildDir = join(root, 'build');
const stageDir = join(buildDir, `ccv-hub-agent-${version}`);
const serviceDir = join(stageDir, 'apps', 'hub-service');
const webDir = join(stageDir, 'apps', 'hub-web');
const contractsDir = join(stageDir, 'packages', 'shared-contracts');
const deployDir = join(stageDir, 'deploy');
const scriptsDir = join(stageDir, 'scripts');
const tarball = join(buildDir, `ccv-hub-agent-${version}.tar.gz`);

const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' });
run('bun', ['run', '--filter', 'hub-service', 'build']);
rmSync(stageDir, { recursive: true, force: true });
rmSync(tarball, { force: true });
mkdirSync(serviceDir, { recursive: true });
mkdirSync(webDir, { recursive: true });
mkdirSync(contractsDir, { recursive: true });
mkdirSync(deployDir, { recursive: true });
mkdirSync(scriptsDir, { recursive: true });

cpSync(join(root, 'apps', 'hub-service', 'dist'), join(serviceDir, 'dist'), { recursive: true });
cpSync(join(root, 'packages', 'shared-contracts', 'dist'), join(contractsDir, 'dist'), { recursive: true });
cpSync(join(root, 'deploy', 'ccv-hub-agent.service'), join(deployDir, 'ccv-hub-agent.service'));
cpSync(join(root, 'deploy', '.env.agent.example'), join(deployDir, '.env.agent.example'));
cpSync(join(root, 'scripts', 'install-agent-release.sh'), join(scriptsDir, 'install-agent-release.sh'));

cpSync(join(root, 'package.json'), join(stageDir, 'package.json'));
cpSync(join(root, 'apps', 'hub-service', 'package.json'), join(serviceDir, 'package.json'));
cpSync(join(root, 'apps', 'hub-web', 'package.json'), join(webDir, 'package.json'));
cpSync(join(root, 'packages', 'shared-contracts', 'package.json'), join(contractsDir, 'package.json'));
cpSync(join(root, 'bun.lock'), join(stageDir, 'bun.lock'));
run('tar', ['-czf', tarball, '-C', buildDir, `ccv-hub-agent-${version}`]);
console.log(tarball);
