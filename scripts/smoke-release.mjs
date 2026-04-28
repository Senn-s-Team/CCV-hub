#!/usr/bin/env node
/**
 * [INPUT]: 依赖 Node fetch、net Socket、ccv-hub Agent HTTP API、Agent/Smoke 环境变量与可选 viewer bridge 地址
 * [OUTPUT]: 对外提供 release smoke test CLI，用于验证 health、auth、instances、launch、viewer bridge 与 stop 收敛
 * [POS]: scripts 的发布验证入口，连接 release 文档中的验收项与真实部署环境
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Socket } from 'node:net';
import { connect as connectTls } from 'node:tls';
import { setTimeout as delay } from 'node:timers/promises';

const baseUrl = trimTrailingSlash(process.env.CCV_HUB_SMOKE_BASE_URL ?? 'http://127.0.0.1:4318');
const password = process.env.CCV_HUB_SMOKE_PASSWORD;
const projectPath = process.env.CCV_HUB_SMOKE_PROJECT_PATH;
const viewerBaseUrl = process.env.CCV_HUB_SMOKE_VIEWER_URL;
const checkHome = process.env.CCV_HUB_SMOKE_CHECK_HOME === '1';
const checkInvalidPath = process.env.CCV_HUB_SMOKE_CHECK_INVALID_PATH === '1';
const stopAfterLaunch = process.env.CCV_HUB_SMOKE_STOP_AFTER_LAUNCH === '1';
const timeoutMs = Number(process.env.CCV_HUB_SMOKE_TIMEOUT_MS ?? '10000');
const pollMs = Number(process.env.CCV_HUB_SMOKE_POLL_MS ?? '500');

const state = {
  cookie: '',
  launchedInstance: undefined,
};

async function main() {
  if (checkHome) await step('home', checkHubHome);
  await step('health', checkHealth);
  await step('auth', checkAuth);
  await step('instances', checkInstances);
  if (checkInvalidPath) await step('invalid-path', checkInvalidLaunchPath);

  if (projectPath) {
    await step('launch', launchInstance);
    await step('viewer-http', checkViewerHttp);
    await step('viewer-sse', checkViewerSse);
    await step('viewer-websocket', checkViewerWebSocket);
    if (stopAfterLaunch) await step('stop', stopInstance);
  } else if (viewerBaseUrl) {
    state.launchedInstance = { url: viewerBaseUrl };
    await step('viewer-http', checkViewerHttp);
    await step('viewer-sse', checkViewerSse);
    await step('viewer-websocket', checkViewerWebSocket);
  } else {
    report('skip', 'launch/viewer/stop', 'set CCV_HUB_SMOKE_PROJECT_PATH or CCV_HUB_SMOKE_VIEWER_URL for deep checks');
  }
}

async function checkHubHome() {
  const response = await fetchWithTimeout(`${baseUrl}/`);
  assert(response.status < 500, `Hub home returned ${response.status}`);
}

async function checkHealth() {
  const body = await requestJson('/api/health');
  assert(body.ok === true, 'health ok must be true');
  assert(body.data?.status === 'ok', 'health status must be ok');
}

async function checkAuth() {
  const status = await requestJson('/api/auth/me');
  assert(status.ok === true, 'auth status ok must be true');

  if (!status.data?.configured) return;
  assert(password, 'CCV_HUB_SMOKE_PASSWORD is required when auth is configured');

  const response = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const body = await parseJson(response);
  assert(response.status === 200, `login returned ${response.status}`);
  assert(body.data?.authenticated === true, 'login must authenticate');

  const cookie = response.headers.get('set-cookie');
  assert(cookie, 'login must set a session cookie');
  state.cookie = cookie.split(';')[0];
}

async function checkInstances() {
  const body = await requestJson('/api/instances', authHeaders());
  assert(Array.isArray(body.data?.instances), 'instances must be an array');
  for (const instance of body.data.instances) {
    assert(instance.status === 'running', `instance ${instance.id} must be running`);
    assert(typeof instance.url === 'string' && instance.url.length > 0, `instance ${instance.id} must include url`);
  }
}

async function checkInvalidLaunchPath() {
  const response = await request('/api/instances', {
    ...authHeaders(),
    method: 'POST',
    headers: {
      ...authHeaders().headers,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ projectPath: 'relative-path' }),
  });
  const body = await parseJson(response);
  assert(response.status === 400, `invalid path returned ${response.status}`);
  assert(body.ok === false, 'invalid path must return ok=false');
  assert(body.error?.code === 'INVALID_PATH', `invalid path returned ${body.error?.code}`);
}

async function launchInstance() {
  const body = await requestJson('/api/instances', {
    ...authHeaders(),
    method: 'POST',
    headers: {
      ...authHeaders().headers,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ projectPath }),
  });
  const instance = body.data?.instance;
  assert(instance?.id, 'launch must return an instance id');
  assert(instance.status === 'running', 'launched instance must be running');
  assert(instance.url, 'launched instance must include viewer url');
  state.launchedInstance = instance;
}

async function checkViewerHttp() {
  const viewerUrl = requireViewerUrl();
  const response = await fetchWithTimeout(viewerUrl);
  assert(response.status < 500, `viewer HTML returned ${response.status}`);
  const contentType = response.headers.get('content-type') ?? '';
  assert(contentType.includes('text/html') || contentType.includes('application/json') || response.status < 400, 'viewer HTTP must return usable content');
}

async function checkViewerSse() {
  const sseUrl = new URL('/api/events', requireViewerUrl());
  copyToken(requireViewerUrl(), sseUrl);
  const response = await fetchWithTimeout(sseUrl, { headers: { accept: 'text/event-stream' } });
  assert(response.status < 500, `viewer SSE returned ${response.status}`);
  await response.body?.cancel();
}

async function checkViewerWebSocket() {
  const viewerUrl = new URL(requireViewerUrl());
  const port = Number(viewerUrl.port || (viewerUrl.protocol === 'https:' ? 443 : 80));
  const target = new URL('/ws/terminal?smoke=1', viewerUrl);
  copyToken(viewerUrl, target);
  const request = [
    `GET ${target.pathname}${target.search} HTTP/1.1`,
    `Host: ${viewerUrl.host}`,
    'Connection: Upgrade',
    'Upgrade: websocket',
    'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
    'Sec-WebSocket-Version: 13',
    '',
    '',
  ].join('\r\n');
  const response = viewerUrl.protocol === 'https:'
    ? await readTlsSocket(viewerUrl.hostname, port, request)
    : await readSocket(viewerUrl.hostname, port, request);
  assert(response.includes('HTTP/1.1 101') || response.includes('HTTP/1.1 404') || response.includes('HTTP/1.1 400'), 'viewer websocket path must return an HTTP upgrade response');
}

async function stopInstance() {
  const instance = state.launchedInstance;
  assert(instance?.id, 'stop requires a launched instance');
  const body = await requestJson(`/api/instances/${encodeURIComponent(instance.id)}/actions/stop`, {
    ...authHeaders(),
    method: 'POST',
  });
  assert(body.ok === true, 'stop must succeed');
  await waitForStopped(instance.id);
}

async function waitForStopped(instanceId) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const body = await requestJson('/api/instances', authHeaders());
    if (!body.data.instances.some((instance) => instance.id === instanceId)) return;
    await delay(pollMs);
  }
  throw new Error(`instance ${instanceId} stayed in running list`);
}

async function step(name, fn) {
  try {
    await fn();
    report('ok', name);
  } catch (error) {
    report('fail', name, error.message);
    process.exitCode = 1;
    throw error;
  }
}

function requestJson(path, init = {}) {
  return request(path, init).then(async (response) => {
    const body = await parseJson(response);
    assert(response.status >= 200 && response.status < 300, `${path} returned ${response.status}: ${JSON.stringify(body)}`);
    assert(body.ok === true, `${path} returned ok=false: ${JSON.stringify(body)}`);
    return body;
  });
}

function request(path, init = {}) {
  return fetchWithTimeout(`${baseUrl}${path}`, init);
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function parseJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`invalid JSON from ${response.url}: ${text.slice(0, 200)}`);
  }
}

function authHeaders() {
  return state.cookie ? { headers: { cookie: state.cookie } } : {};
}

function requireViewerUrl() {
  const url = state.launchedInstance?.url ?? viewerBaseUrl;
  assert(url, 'viewer url is required');
  return url;
}

function copyToken(fromUrl, toUrl) {
  const source = new URL(fromUrl);
  const token = source.searchParams.get('token');
  if (token) toUrl.searchParams.set('token', token);
}

function readSocket(host, port, request) {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let response = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('websocket smoke timed out'));
    }, timeoutMs);

    socket.connect(port, host, () => socket.write(request));
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
      if (response.includes('\r\n\r\n')) {
        clearTimeout(timer);
        socket.destroy();
        resolve(response);
      }
    });
    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function readTlsSocket(host, port, request) {
  return new Promise((resolve, reject) => {
    const socket = connectTls({ host, port, servername: host });
    let response = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('websocket TLS smoke timed out'));
    }, timeoutMs);

    socket.on('secureConnect', () => socket.write(request));
    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
      if (response.includes('\r\n\r\n')) {
        clearTimeout(timer);
        socket.destroy();
        resolve(response);
      }
    });
    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function trimTrailingSlash(value) {
  return value.replace(/\/$/, '');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function report(status, name, detail = '') {
  const suffix = detail ? ` - ${detail}` : '';
  console.log(`[${status}] ${name}${suffix}`);
}

main().catch(() => process.exit(1));
