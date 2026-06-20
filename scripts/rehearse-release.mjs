#!/usr/bin/env node
/**
 * [INPUT]: 依赖 node:child_process、node:crypto、node:fs 与既有 release/smoke 脚本
 * [OUTPUT]: 对外提供 release rehearsal CLI，产出 tarball、env-backed Compose 校验、checksums 与 evidence report
 * [POS]: scripts 的真实环境发布演练编排器，复用打包、模板验证与 smoke 验证入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2] ?? process.env.CCV_HUB_RELEASE_VERSION ?? 'v0.0.0-dev';
const buildDir = join(root, 'build');
const checksumFile = join(buildDir, `checksums-${version}.txt`);
const reportFile = join(buildDir, `release-rehearsal-${version}.json`);
const startedAt = new Date();
const commands = [];

mkdirSync(buildDir, { recursive: true });

try {
  run('node', ['--check', 'scripts/smoke-release.mjs']);
  run('bun', ['run', 'lint']);
  run('bun', ['run', 'test']);
  run('bun', ['run', 'build']);
  run('bun', ['run', 'release:web', '--', version]);
  run('bun', ['run', 'release:agent', '--', version]);
  if (process.env.CCV_HUB_REHEARSAL_DOCKER_IMAGE === '1') {
    run('docker', ['build', '-f', 'apps/hub-web/Dockerfile', '-t', `ccv-hub-web:${version}`, '.']);
  }
  run('docker', ['compose', '--env-file', '.env.example', '-f', 'deploy/docker-compose.hub.yml', 'config']);
  run('docker', ['compose', '--env-file', '.env.example', '-f', 'deploy/docker-compose.standalone.yml', 'config']);
  run('bun', ['run', 'smoke:release']);
  writeChecksums();
  writeReport('passed');
  console.log(`[ok] release rehearsal ${version}`);
  console.log(relative(root, checksumFile));
  console.log(relative(root, reportFile));
} catch (error) {
  writeReport('failed', error.message);
  console.error(`[fail] release rehearsal ${version}: ${error.message}`);
  process.exit(1);
}

function run(command, args) {
  const started = Date.now();
  const label = [command, ...args].join(' ');
  try {
    execFileSync(command, args, { cwd: root, stdio: 'inherit' });
    commands.push({ command: label, status: 'passed', durationMs: Date.now() - started });
  } catch (error) {
    commands.push({ command: label, status: 'failed', durationMs: Date.now() - started });
    throw new Error(`${label} failed with status ${error.status ?? 'unknown'}`);
  }
}

function writeChecksums() {
  const artifacts = versionedArtifactFiles();
  const lines = artifacts.map((file) => `${sha256(file)}  ${relative(root, file)}`);
  writeFileSync(checksumFile, `${lines.join('\n')}\n`);
}

function versionedArtifactFiles() {
  return readdirSync(buildDir)
    .filter((name) => name.includes(version) && !name.endsWith('.json') && !name.startsWith('checksums-'))
    .map((name) => join(buildDir, name))
    .filter((file) => existsSync(file) && statSync(file).isFile());
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function writeReport(status, error) {
  const finishedAt = new Date();
  const report = {
    version,
    status,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    commands,
    artifacts: versionedArtifactFiles().map((file) => relative(root, file)),
    checksumFile: existsSync(checksumFile) ? relative(root, checksumFile) : null,
    smokeEnvironment: smokeEnvironment(),
    dockerImageBuild: process.env.CCV_HUB_REHEARSAL_DOCKER_IMAGE === '1',
    error,
  };
  writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
}

function smokeEnvironment() {
  return Object.fromEntries(
    Object.keys(process.env)
      .filter((key) => key.startsWith('CCV_HUB_SMOKE_'))
      .sort()
      .map((key) => [key, process.env[key] ? 'set' : 'empty']),
  );
}
