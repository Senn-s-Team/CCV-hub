/**
 * [CCV_HUB_MANAGED_PLUGIN]
 * [INPUT]: 依赖 cc-viewer 插件生命周期 hooks 与 hub-service 外部实例注册 API
 * [OUTPUT]: 对外提供 ccv-hub 插件默认导出，发布 localUrl、serverStarted 与 serverStopping hook
 * [POS]: deploy 的 logger 实例桥接器，负责让终端/logger 启动的 cc-viewer 自动进入 Hub 实例目录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const hubBaseUrl = process.env.CCV_HUB_URL ?? 'http://127.0.0.1:4318';

let currentInstance;

function enabled() {
  return process.env.CCV_HUB_PLUGIN_DISABLED !== '1';
}

function projectPath() {
  return process.cwd();
}

function projectName() {
  return projectPath().split('/').filter(Boolean).pop() ?? 'cc-viewer';
}

async function post(path, body) {
  try {
    await fetch(new URL(path, hubBaseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
  }
}

export default {
  name: 'ccv-hub',
  hooks: {
    async localUrl({ url, ip, port, token }) {
      return { url: `${url.startsWith('https:') ? 'https' : 'http'}://${ip}:${port}?token=${token}` };
    },

    async serverStarted({ ip, port, token, protocol }) {
      if (!enabled()) return;
      currentInstance = {
        id: `${projectPath()}:${port}`,
        projectName: projectName(),
        projectPath: projectPath(),
        url: `${protocol}://${ip}:${port}?token=${token}`,
        port,
        pid: process.pid,
        source: 'logger',
        startedAt: new Date().toISOString(),
      };
      await post('/api/instances/register', currentInstance);
    },

    async serverStopping() {
      if (!enabled() || !currentInstance) return;
      await post('/api/instances/unregister', {
        id: currentInstance.id,
        pid: currentInstance.pid,
        port: currentInstance.port,
        projectPath: currentInstance.projectPath,
        source: currentInstance.source,
      });
    },
  },
};
