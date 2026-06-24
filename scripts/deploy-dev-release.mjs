#!/usr/bin/env node
/**
 * [INPUT]: 依赖 node:child_process、node:crypto、node:fs、dev env 文件、release 打包脚本、Agent 安装脚本、systemd、Docker Compose 与 public smoke 入口
 * [OUTPUT]: 对外提供 dev/public 重新部署 CLI，串联预检、Agent 安装、显式重启、Web image 重建、Traefik label 验证与公网 smoke evidence
 * [POS]: scripts 的稳定 dev redeploy 编排器，把分散命令收敛为 bun run deploy:dev 的单一 SOP，并隔离 systemd restart 对安装进程的影响
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.env.CCV_HUB_DEPLOY_VERSION ?? process.argv[2] ?? 'v0.0.0-dev';

const paths = {
  webEnv: '.env.dev',
  agentDevEnv: 'deploy/.env.agent.dev',
  installedAgentEnv: '/etc/ccv-hub/.env.agent',
  hubCompose: 'deploy/docker-compose.hub.yml',
  standaloneCompose: 'deploy/docker-compose.standalone.yml',
  webDockerfile: 'apps/hub-web/Dockerfile',
  installAgent: 'scripts/install-agent-release.sh',
  agentTarball: `build/ccv-hub-agent-${version}.tar.gz`,
};

const requiredWebEnv = [
  'CCV_HUB_WEB_IMAGE',
  'CCV_HUB_WEB_PORT',
  'CCV_HUB_AGENT_UPSTREAM',
  'CCV_HUB_AGENT_PROXY_TOKEN',
  'CCV_HUB_PUBLIC_HOST',
  'CCV_HUB_DOCKER_NETWORK',
];
const requiredAgentEnv = [
  'CCV_HUB_HOST',
  'CCV_HUB_PORT',
  'CCV_HUB_PUBLIC_HOST',
  'CCV_HUB_AGENT_PROXY_TOKEN',
  'CCV_HUB_AUTH_PASSWORD',
  'CCV_HUB_SESSION_SECRET',
];
const syncKeys = [
  'CCV_HUB_AGENT_PROXY_TOKEN',
  'CCV_HUB_PUBLIC_PROTOCOL',
  'CCV_HUB_PUBLIC_HOST',
  'CCV_HUB_VIEWER_PATH_PREFIX',
  'CCV_HUB_AUTH_PASSWORD',
  'CCV_HUB_SESSION_SECRET',
];

const evidence = {
  version,
  composeFile: paths.hubCompose,
  publicUrl: undefined,
  agentActive: false,
  webContainer: undefined,
  smoke: undefined,
};

try {
  const state = preflight();
  deployAgent(state);
  deployWeb(state);
  await waitForPublicHealth(state);
  runPublicSmoke(state);
  printEvidence();
} catch (error) {
  console.error(`[fail] dev deploy ${version}: ${error.message}`);
  process.exit(1);
}

function preflight() {
  return step('preflight', () => {
    for (const file of [paths.webEnv, paths.agentDevEnv, paths.hubCompose, paths.webDockerfile, paths.installAgent]) {
      assert(existsSync(join(root, file)), `required file is missing: ${file}`);
    }

    for (const command of ['node', 'bun', 'docker', 'sudo']) {
      assertCommand(command);
    }

    const webEnv = readEnv(paths.webEnv);
    const agentEnv = readEnv(paths.agentDevEnv);
    assertRequired(webEnv, paths.webEnv, requiredWebEnv);
    assertRequired(agentEnv, paths.agentDevEnv, requiredAgentEnv);
    assertSameToken(webEnv.CCV_HUB_AGENT_PROXY_TOKEN, agentEnv.CCV_HUB_AGENT_PROXY_TOKEN, paths.webEnv, paths.agentDevEnv);

    const installedText = sudoRead(paths.installedAgentEnv);
    const installedEnv = parseEnv(installedText);
    assert(installedEnv.CCV_HUB_AGENT_PROXY_TOKEN, `${paths.installedAgentEnv} must define CCV_HUB_AGENT_PROXY_TOKEN`);

    if (installedEnv.CCV_HUB_AGENT_PROXY_TOKEN !== webEnv.CCV_HUB_AGENT_PROXY_TOKEN) {
      handleTokenDrift(installedText, installedEnv, webEnv, agentEnv);
    }

    evidence.publicUrl = process.env.CCV_HUB_SMOKE_BASE_URL ?? `https://${webEnv.CCV_HUB_PUBLIC_HOST}`;
    console.log(`[ok] preflight uses ${paths.hubCompose}`);
    return { webEnv, agentEnv };
  });
}

function deployAgent(state) {
  step('package-agent', () => run('bun', ['run', 'release:agent', '--', version]));
  step('install-agent', () => run('sudo', ['env', 'CCV_HUB_AGENT_RESTART=0', './scripts/install-agent-release.sh', paths.agentTarball]));
  step('restart-agent', () => run('sudo', ['systemctl', 'restart', 'ccv-hub-agent.service']));
  step('verify-agent', () => {
    waitForAgentActive();
    const installedEnv = parseEnv(sudoRead(paths.installedAgentEnv));
    assertSameToken(state.webEnv.CCV_HUB_AGENT_PROXY_TOKEN, installedEnv.CCV_HUB_AGENT_PROXY_TOKEN, paths.webEnv, paths.installedAgentEnv);
    evidence.agentActive = true;
  });
}

function deployWeb(state) {
  step('package-web', () => run('bun', ['run', 'release:web', '--', version]));
  step('build-web-image', () => run('docker', ['build', '-t', state.webEnv.CCV_HUB_WEB_IMAGE, '-f', paths.webDockerfile, '.']));
  step('compose-config', () => runQuiet('docker', ['compose', '--env-file', paths.webEnv, '-f', paths.hubCompose, 'config']));
  step('cleanup-standalone', () => {
    runAllowFailure('docker', ['compose', '--env-file', paths.webEnv, '-f', paths.standaloneCompose, 'stop', 'ccv-hub-web']);
    runAllowFailure('docker', ['compose', '--env-file', paths.webEnv, '-f', paths.standaloneCompose, 'rm', '-f', 'ccv-hub-web']);
  });
  step('compose-up', () => run('docker', ['compose', '--env-file', paths.webEnv, '-f', paths.hubCompose, 'up', '-d', '--force-recreate', 'ccv-hub-web']));
  step('verify-traefik-labels', () => {
    const containerId = output('docker', ['compose', '--env-file', paths.webEnv, '-f', paths.hubCompose, 'ps', '-q', 'ccv-hub-web']).trim();
    assert(containerId, 'ccv-hub-web container id is empty after compose up');
    const labels = JSON.parse(output('docker', ['inspect', '-f', '{{json .Config.Labels}}', containerId]));
    assert(labels['traefik.enable'] === 'true', 'missing traefik.enable=true label');
    assert(labels['traefik.http.routers.ccv-hub-secure.rule'] === `Host(\`${state.webEnv.CCV_HUB_PUBLIC_HOST}\`)`, 'missing secure Traefik Host rule label');
    assert(labels['traefik.http.services.ccv-hub-web.loadbalancer.server.port'] === '80', 'missing Traefik service port label');
    evidence.webContainer = containerId.slice(0, 12);
    console.log(`[ok] traefik labels verified on ${evidence.webContainer}`);
  });
}

async function waitForPublicHealth() {
  await asyncStep('wait-public-health', async () => {
    const deadline = Date.now() + Number(process.env.CCV_HUB_PUBLIC_CONVERGE_TIMEOUT_MS ?? '30000');
    let lastError = 'public health did not respond';
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${evidence.publicUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
        const text = await response.text();
        if (response.ok && text.includes('"ok":true')) return;
        lastError = `public health returned ${response.status}: ${text.slice(0, 120)}`;
      } catch (error) {
        lastError = error.message;
      }
      await delay(1000);
    }
    throw new Error(lastError);
  });
}

function waitForAgentActive() {
  const deadline = Date.now() + Number(process.env.CCV_HUB_AGENT_CONVERGE_TIMEOUT_MS ?? '20000');
  let active = '';
  while (Date.now() < deadline) {
    try {
      active = output('systemctl', ['is-active', 'ccv-hub-agent.service']).trim();
      if (active === 'active') return;
    } catch (error) {
      active = error.message;
    }
    sleep(500);
  }
  throw new Error(`ccv-hub-agent.service must be active, got ${active || 'empty'}`);
}

function runPublicSmoke(state) {
  step('public-smoke', () => {
    const smokeEnv = {
      ...process.env,
      ...state.webEnv,
      CCV_HUB_SMOKE_BASE_URL: evidence.publicUrl,
      CCV_HUB_SMOKE_PASSWORD: process.env.CCV_HUB_SMOKE_PASSWORD ?? state.agentEnv.CCV_HUB_AUTH_PASSWORD,
      CCV_HUB_AGENT_PROXY_TOKEN: state.webEnv.CCV_HUB_AGENT_PROXY_TOKEN,
      CCV_HUB_PUBLIC_HOST: state.webEnv.CCV_HUB_PUBLIC_HOST,
      CCV_HUB_VIEWER_PATH_PREFIX: state.webEnv.CCV_HUB_VIEWER_PATH_PREFIX ?? state.agentEnv.CCV_HUB_VIEWER_PATH_PREFIX ?? '/viewer',
      CCV_HUB_SMOKE_CHECK_HOME: process.env.CCV_HUB_SMOKE_CHECK_HOME ?? '1',
    };
    run('node', ['scripts/smoke-release.mjs'], { env: smokeEnv });
    evidence.smoke = 'passed';
  });
}

function handleTokenDrift(installedText, installedEnv, webEnv, agentEnv) {
  const installedHash = secretHash(installedEnv.CCV_HUB_AGENT_PROXY_TOKEN);
  const expectedHash = secretHash(webEnv.CCV_HUB_AGENT_PROXY_TOKEN);
  if (process.env.CCV_HUB_SYNC_AGENT_ENV !== '1') {
    throw new Error([
      'CCV_HUB_AGENT_PROXY_TOKEN drift detected before deploy',
      `${paths.webEnv}: ${expectedHash}`,
      `${paths.installedAgentEnv}: ${installedHash}`,
      'repair: CCV_HUB_SYNC_AGENT_ENV=1 bun run deploy:dev',
    ].join('\n'));
  }

  const mergedEnv = {
    ...agentEnv,
    CCV_HUB_AGENT_PROXY_TOKEN: webEnv.CCV_HUB_AGENT_PROXY_TOKEN,
    CCV_HUB_PUBLIC_PROTOCOL: agentEnv.CCV_HUB_PUBLIC_PROTOCOL ?? webEnv.CCV_HUB_PUBLIC_PROTOCOL ?? 'https',
    CCV_HUB_PUBLIC_HOST: agentEnv.CCV_HUB_PUBLIC_HOST ?? webEnv.CCV_HUB_PUBLIC_HOST,
    CCV_HUB_VIEWER_PATH_PREFIX: agentEnv.CCV_HUB_VIEWER_PATH_PREFIX ?? webEnv.CCV_HUB_VIEWER_PATH_PREFIX ?? '/viewer',
  };
  const backup = `${paths.installedAgentEnv}.backup-${timestamp()}`;
  const synced = updateEnvText(installedText, syncKeys, mergedEnv);
  const tempFile = `/tmp/ccv-hub-env-agent-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tempFile, synced, { mode: 0o600 });
    run('sudo', ['cp', paths.installedAgentEnv, backup]);
    run('sudo', ['install', '-m', '0600', tempFile, paths.installedAgentEnv]);
  } finally {
    try {
      unlinkSync(tempFile);
    } catch {}
  }
  console.log(`[ok] synced installed Agent env keys, backup: ${backup}`);
}

function updateEnvText(text, keys, values) {
  const seen = new Set();
  const lines = text.split(/\r?\n/u).map((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/u);
    if (!match || !keys.includes(match[1])) return line;
    const key = match[1];
    seen.add(key);
    return `${key}=${quoteEnv(values[key] ?? '')}`;
  });
  for (const key of keys) {
    if (!seen.has(key) && values[key] !== undefined) lines.push(`${key}=${quoteEnv(values[key])}`);
  }
  return `${lines.join('\n').replace(/\n+$/u, '')}\n`;
}

function readEnv(file) {
  return parseEnv(readFileSync(join(root, file), 'utf8'));
}

function parseEnv(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u);
    if (!match) continue;
    env[match[1]] = unquoteEnv(match[2]);
  }
  return env;
}

function unquoteEnv(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1).replace(/\\"/gu, '"');
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
  return trimmed.replace(/\s+#.*$/u, '');
}

function quoteEnv(value) {
  const text = String(value ?? '');
  return /^[A-Za-z0-9_./:@-]+$/u.test(text) ? text : JSON.stringify(text);
}

function sudoRead(file) {
  try {
    return output('sudo', ['cat', file]);
  } catch (error) {
    throw new Error(`cannot read ${file} with sudo: ${error.message}`);
  }
}

function assertRequired(env, file, keys) {
  const missing = keys.filter((key) => !env[key]);
  assert(missing.length === 0, `${file} missing required keys: ${missing.join(', ')}`);
}

function assertSameToken(left, right, leftName, rightName) {
  assert(left === right, `CCV_HUB_AGENT_PROXY_TOKEN mismatch: ${leftName}=${secretHash(left)} ${rightName}=${secretHash(right)}`);
}

function assertCommand(command) {
  try {
    execFileSync('sh', ['-lc', `command -v ${command}`], { cwd: root, stdio: 'ignore' });
  } catch {
    throw new Error(`required command is missing: ${command}`);
  }
}

function step(name, fn) {
  console.log(`[step] ${name}`);
  const result = fn();
  console.log(`[ok] ${name}`);
  return result;
}

async function asyncStep(name, fn) {
  console.log(`[step] ${name}`);
  const result = await fn();
  console.log(`[ok] ${name}`);
  return result;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function run(command, args, options = {}) {
  execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options });
}

function runQuiet(command, args) {
  execFileSync(command, args, { cwd: root, stdio: 'ignore' });
}

function runAllowFailure(command, args) {
  try {
    run(command, args);
  } catch (error) {
    console.warn(`[warn] ${[command, ...args].join(' ')} exited with ${error.status ?? 'unknown'}`);
  }
}

function output(command, args) {
  return execFileSync(command, args, { cwd: root, encoding: 'utf8' });
}

function secretHash(value = '') {
  return `sha256:${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
}

function timestamp() {
  const pad = (value) => String(value).padStart(2, '0');
  const now = new Date();
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function printEvidence() {
  console.log('[evidence]');
  console.log(`version=${evidence.version}`);
  console.log(`compose=${evidence.composeFile}`);
  console.log(`publicUrl=${evidence.publicUrl}`);
  console.log(`agentActive=${evidence.agentActive}`);
  console.log(`webContainer=${evidence.webContainer}`);
  console.log(`smoke=${evidence.smoke}`);
  console.log(`[ok] dev deploy ${version}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
