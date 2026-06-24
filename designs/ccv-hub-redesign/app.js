/*
 * [INPUT]: 依赖 index.html 暴露的 DOM 节点与 ccv-hub 实例模型字段
 * [OUTPUT]: 对外提供 redesign 原型交互：实例渲染、筛选、状态切换、主题切换、启动弹窗、路径选择与 Toast
 * [POS]: designs/ccv-hub-redesign 的轻量状态控制器，用静态数据模拟真实 Hub Web 行为
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const instances = [
  {
    id: 'inst_ccv_hub',
    projectName: 'ccv-hub',
    projectPath: '/home/opc/projects/ccvs/ccv-hub',
    url: 'https://ccv-hub-dev.paas.s3n.top/viewer/brg_hub_7f9c/?token=••••',
    status: 'running',
    source: 'launcher',
    startedAt: '08:42',
    lastSeen: '刚刚',
    canStop: true,
  },
  {
    id: 'inst_viewer',
    projectName: 'cc-viewer',
    projectPath: '/home/opc/projects/ccvs/cc-viewer',
    url: 'https://ccv-hub-dev.paas.s3n.top/viewer/brg_viewer_3ad2/?token=••••',
    status: 'running',
    source: 'logger',
    startedAt: '08:16',
    lastSeen: '18 秒前',
    canStop: false,
  },
  {
    id: 'inst_mobile',
    projectName: 'mobile-client',
    projectPath: '/home/opc/projects/labs/mobile-client',
    url: 'https://ccv-hub-dev.paas.s3n.top/viewer/brg_mobile_d91e/?token=••••',
    status: 'running',
    source: 'manual',
    startedAt: '07:55',
    lastSeen: '41 秒前',
    canStop: true,
  },
  {
    id: 'inst_sdk',
    projectName: 'claude-sdk-lab',
    projectPath: '/home/opc/projects/claude-sdk-lab',
    url: 'https://ccv-hub-dev.paas.s3n.top/viewer/brg_sdk_b120/?token=••••',
    status: 'running',
    source: 'launcher',
    startedAt: '07:21',
    lastSeen: '1 分钟前',
    canStop: true,
  },
];

const folders = [
  { name: 'ccvs', path: '/home/opc/projects/ccvs' },
  { name: 'ccv-hub', path: '/home/opc/projects/ccvs/ccv-hub' },
  { name: 'cc-viewer', path: '/home/opc/projects/ccvs/cc-viewer' },
  { name: 'claude-sdk-lab', path: '/home/opc/projects/claude-sdk-lab' },
  { name: 'mobile-client', path: '/home/opc/projects/labs/mobile-client' },
];

const els = {
  grid: document.querySelector('#instanceGrid'),
  errorGrid: document.querySelector('#errorGrid'),
  featured: document.querySelector('#featuredCard'),
  search: document.querySelector('#projectSearch'),
  visible: document.querySelector('#summaryVisible'),
  total: document.querySelector('#summaryTotal'),
  railOnline: document.querySelector('#railOnlineCount'),
  stateChip: document.querySelector('#stateChip'),
  toolbarHint: document.querySelector('#toolbarHint'),
  lastSync: document.querySelector('#lastSync'),
  toast: document.querySelector('#toast'),
  modal: document.querySelector('#launchModal'),
  launchPath: document.querySelector('#launchPath'),
  launchSummary: document.querySelector('#launchSummary'),
  launchMode: document.querySelector('#launchMode'),
  launchModeSummary: document.querySelector('#launchModeSummary'),
  browserPanel: document.querySelector('#browserPanel'),
  folderList: document.querySelector('#folderList'),
  pathSearch: document.querySelector('#pathSearch'),
  modalError: document.querySelector('#modalError'),
};

let currentState = 'ready';
let toastTimer = 0;

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function badge(value, tone = 'neutral') {
  const className = tone === 'live' ? 'state-chip live' : 'state-chip neutral';
  return `<span class="${className}">${escapeHtml(value)}</span>`;
}

function cardTemplate(instance) {
  const stopButton = instance.canStop ? '<button type="button" class="instance-action danger" data-action="stop">停止</button>' : '';
  return `
    <article class="instance-card" data-id="${escapeHtml(instance.id)}">
      <div class="card-top">
        <div>
          <h3 class="card-title">${escapeHtml(instance.projectName)}</h3>
          <div class="card-tags">${badge(instance.status, 'live')}${badge(instance.source)}</div>
        </div>
        <div class="card-health"><strong>在线</strong><br />确认 ${escapeHtml(instance.lastSeen)}</div>
      </div>
      <div class="meta-stack">
        <div class="meta-row"><span class="meta-label">PATH</span><span class="meta-value" title="${escapeHtml(instance.projectPath)}">${escapeHtml(instance.projectPath)}</span></div>
        <div class="meta-row"><span class="meta-label">URL</span><span class="meta-value" title="${escapeHtml(instance.url)}">${escapeHtml(instance.url)}</span></div>
      </div>
      <div class="card-bottom">
        <span class="started-at">启动 ${escapeHtml(instance.startedAt)}</span>
        <div class="action-row">
          <button type="button" class="instance-action primary" data-action="open">打开</button>
          <button type="button" class="instance-action" data-action="copy">复制链接</button>
          ${stopButton}
        </div>
      </div>
    </article>`;
}

function featuredTemplate(instance) {
  return `
    <div>
      <h3 class="featured-title">${escapeHtml(instance.projectName)}</h3>
      <p class="featured-path">${escapeHtml(instance.projectPath)}</p>
      <div class="featured-meta">${badge(instance.status, 'live')}${badge(instance.source)}${badge(`启动 ${instance.startedAt}`)}</div>
    </div>
    <div class="featured-actions">
      <button type="button" class="primary-button" data-featured-action="open">打开 viewer</button>
      <button type="button" class="ghost-button" data-featured-action="copy">复制稳定入口</button>
      <span class="micro-copy">${escapeHtml(instance.url)}</span>
    </div>`;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add('visible');
  toastTimer = window.setTimeout(() => els.toast.classList.remove('visible'), 2200);
}

function filteredInstances() {
  const query = els.search.value.trim().toLowerCase();
  return instances.filter((instance) => instance.projectName.toLowerCase().includes(query));
}

function setState(state) {
  currentState = state;
  document.querySelectorAll('.state-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.state === state);
  });
  document.querySelectorAll('.state-view').forEach((view) => view.classList.remove('active'));
  const viewMap = { ready: 'readyView', loading: 'loadingView', empty: 'emptyView', error: 'errorView' };
  document.querySelector(`#${viewMap[state]}`).classList.add('active');
  const labelMap = { ready: 'list-ready', loading: 'loading', empty: 'empty', error: 'discovery-error' };
  els.stateChip.textContent = labelMap[state];
  els.stateChip.className = state === 'error' ? 'state-chip danger' : state === 'ready' ? 'state-chip live' : 'state-chip neutral';
  els.toolbarHint.textContent = state === 'ready' ? '4 个运行实例，点击打开可直达 viewer。' : state === 'loading' ? '保留骨架，等待实例列表返回。' : state === 'empty' ? '当前没有运行实例，主动作保持可见。' : '已知内容保留，刷新动作继续可达。';
}

function renderInstances() {
  const visible = filteredInstances();
  els.total.textContent = String(instances.length);
  els.visible.textContent = String(visible.length);
  els.railOnline.textContent = String(instances.length);

  if (currentState === 'ready') {
    if (visible.length === 0 && els.search.value.trim()) {
      document.querySelectorAll('.state-view').forEach((view) => view.classList.remove('active'));
      document.querySelector('#filterEmptyView').classList.add('active');
      els.stateChip.textContent = 'list-ready';
      els.stateChip.className = 'state-chip neutral';
      return;
    }
    document.querySelectorAll('.state-view').forEach((view) => view.classList.remove('active'));
    document.querySelector('#readyView').classList.add('active');
  }

  const [first, ...rest] = visible.length ? visible : instances;
  els.featured.innerHTML = featuredTemplate(first);
  els.grid.innerHTML = rest.map(cardTemplate).join('');
  els.errorGrid.innerHTML = instances.slice(0, 3).map(cardTemplate).join('');
}

function openLaunch() {
  els.modal.hidden = false;
  els.launchPath.focus();
  updateLaunchSummary();
}

function closeLaunch() {
  els.modal.hidden = true;
  els.modalError.hidden = true;
}

function updateLaunchSummary() {
  const path = els.launchPath.value.trim();
  els.launchSummary.textContent = path || '等待项目路径';
  els.launchModeSummary.textContent = els.launchMode.value;
}

function renderFolders() {
  const query = els.pathSearch.value.trim().toLowerCase();
  const visible = folders.filter((folder) => `${folder.name} ${folder.path}`.toLowerCase().includes(query));
  els.folderList.innerHTML = visible.map((folder) => `
    <button type="button" class="folder-entry" data-path="${escapeHtml(folder.path)}">
      <strong>${escapeHtml(folder.name)}</strong>
      <span>${escapeHtml(folder.path)}</span>
    </button>`).join('');
}

function handleInstanceAction(event) {
  const button = event.target.closest('button');
  const card = event.target.closest('.instance-card');
  if (!button || !card) return;
  const instance = instances.find((item) => item.id === card.dataset.id);
  if (!instance) return;
  if (button.dataset.action === 'open') showToast(`打开 ${instance.projectName}`);
  if (button.dataset.action === 'copy') showToast(`已复制 ${instance.projectName} 链接`);
  if (button.dataset.action === 'stop') showToast(`${instance.projectName} 停止请求已发送`);
}

function bindEvents() {
  document.querySelectorAll('.state-button').forEach((button) => {
    button.addEventListener('click', () => {
      setState(button.dataset.state);
      renderInstances();
    });
  });

  document.querySelectorAll('[data-theme-option]').forEach((button) => {
    button.addEventListener('click', () => {
      document.documentElement.dataset.theme = button.dataset.themeOption;
      document.querySelectorAll('[data-theme-option]').forEach((item) => item.classList.toggle('active', item === button));
    });
  });

  els.search.addEventListener('input', renderInstances);
  els.grid.addEventListener('click', handleInstanceAction);
  els.errorGrid.addEventListener('click', handleInstanceAction);
  els.featured.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    showToast(button.dataset.featuredAction === 'copy' ? '已复制 ccv-hub 稳定入口' : '打开 ccv-hub viewer');
  });

  document.querySelector('#refreshButton').addEventListener('click', () => {
    els.lastSync.textContent = '正在同步…';
    showToast('正在刷新实例列表');
    window.setTimeout(() => { els.lastSync.textContent = '刚刚同步'; }, 700);
  });
  document.querySelector('#errorRefresh').addEventListener('click', () => { setState('loading'); showToast('正在再次读取实例'); });
  document.querySelector('#clearSearch').addEventListener('click', () => { els.search.value = ''; renderInstances(); });
  document.querySelector('#openLaunch').addEventListener('click', openLaunch);
  document.querySelector('#emptyLaunch').addEventListener('click', openLaunch);
  document.querySelector('#closeLaunch').addEventListener('click', closeLaunch);
  document.querySelector('#cancelLaunch').addEventListener('click', closeLaunch);
  els.modal.addEventListener('click', (event) => { if (event.target === els.modal) closeLaunch(); });

  document.querySelectorAll('[data-path]').forEach((button) => {
    button.addEventListener('click', () => { els.launchPath.value = button.dataset.path; updateLaunchSummary(); });
  });
  document.querySelector('#showBrowser').addEventListener('click', () => {
    els.browserPanel.hidden = !els.browserPanel.hidden;
    renderFolders();
  });
  els.pathSearch.addEventListener('input', renderFolders);
  els.folderList.addEventListener('click', (event) => {
    const entry = event.target.closest('.folder-entry');
    if (!entry) return;
    els.launchPath.value = entry.dataset.path;
    updateLaunchSummary();
    showToast('已选择宿主机路径');
  });
  els.launchPath.addEventListener('input', updateLaunchSummary);
  els.launchMode.addEventListener('change', updateLaunchSummary);
  document.querySelector('#submitLaunch').addEventListener('click', () => {
    const path = els.launchPath.value.trim();
    if (!path.startsWith('/')) {
      els.modalError.hidden = false;
      return;
    }
    els.modalError.hidden = true;
    closeLaunch();
    showToast('实例已加入总览台');
  });
}

bindEvents();
renderFolders();
renderInstances();
