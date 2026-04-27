#!/usr/bin/env node
/**
 * [INPUT]: 依赖 node:fs、node:child_process、hub-web 构建产物与 nginx 入口模板
 * [OUTPUT]: 对外提供 build/ccv-hub-web-<version>.tar.gz 静态 Web release 产物
 * [POS]: scripts 的 Web 打包入口，把 dist 静态资源与 nginx 模板收敛为 Nginx/Caddy 可部署 tarball
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2] ?? process.env.CCV_HUB_RELEASE_VERSION ?? 'v0.0.0-dev';
const buildDir = join(root, 'build');
const stageDir = join(buildDir, `ccv-hub-web-${version}`);
const nginxDir = join(stageDir, 'nginx');
const tarball = join(buildDir, `ccv-hub-web-${version}.tar.gz`);

const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' });
run('bun', ['run', '--filter', 'hub-web', 'build']);
rmSync(stageDir, { recursive: true, force: true });
rmSync(tarball, { force: true });
mkdirSync(nginxDir, { recursive: true });

cpSync(join(root, 'apps', 'hub-web', 'dist'), join(stageDir, 'dist'), { recursive: true });
cpSync(join(root, 'apps', 'hub-web', 'nginx.conf'), join(nginxDir, 'default.conf.template'));
run('tar', ['-czf', tarball, '-C', buildDir, `ccv-hub-web-${version}`]);
console.log(tarball);
