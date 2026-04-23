/*
 * [INPUT]: 依赖 index.html 暴露的状态切换、弹窗与列表节点，依赖 styles.css 的交互类名
 * [OUTPUT]: 对外提供实例卡片渲染、状态切换、弹窗反馈与视口预览行为
 * [POS]: prototype 的交互控制器，驱动静态原型中的数据映射与操作回执
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const instances = [
  {
    name: 'cc-viewer / core-web',
    status: 'running',
    statusText: 'running',
    source: 'logger hook',
    path: '/home/opc/projects/ccvs/cc-viewer',
    url: 'https://ccv.example.com/view/4110a9f3',
    startedAt: '11:42',
    health: '请求流正常 · 2.4k events',
    healthDetail: '最近一次同步 12 秒前',
  },
  {
    name: 'sdk-lab / replay-suite',
    status: 'running',
    statusText: 'running',
    source: 'manual launch',
    path: '/home/opc/projects/ccvs/sdk-lab',
    url: 'https://ccv.example.com/view/4132ab12',
    startedAt: '10:58',
    health: '插件运行中 · 5 workers',
    healthDetail: '最近一次同步 28 秒前',
  },
  {
    name: 'mobile-view / dogfood',
    status: 'refreshing',
    statusText: 'refreshing',
    source: 'workspace scan',
    path: '/home/opc/projects/ccvs/mobile-view',
    url: 'https://ccv.example.com/view/4188cd34',
    startedAt: '09:24',
    health: '刷新延迟 · 等待回补',
    healthDetail: '发现时间戳落后 2 分钟',
  },
  {
    name: 'terminal-audit / nightly',
    status: 'running',
    statusText: 'running',
    source: 'manual launch',
    path: '/home/opc/projects/ccvs/terminal-audit',
    url: 'https://ccv.example.com/view/4201ef56',
    startedAt: '08:51',
    health: '日志尾流稳定 · no gaps',
    healthDetail: '最近一次同步 8 秒前',
  },
  {
    name: 'proxy-bench / canary',
    status: 'running',
    statusText: 'running',
    source: 'logger hook',
    path: '/home/opc/projects/ccvs/proxy-bench',
    url: 'https://ccv.example.com/view/4240gh78',
    startedAt: '07:13',
    health: '回放正常 · 64 req/min',
    healthDetail: '最近一次同步 17 秒前',
  },
  {
    name: 'ops-story / incident-lab',
    status: 'error',
    statusText: 'discovery issue',
    source: 'workspace scan',
    path: '/home/opc/projects/ccvs/ops-story',
    url: 'https://ccv.example.com/view/4258ij90',
    startedAt: '06:40',
    health: '登记异常 · 端口记录冲突',
    healthDetail: '保留条目以便定位问题',
  },
];

const stateCopy = {
  'list-ready': {
    stateLabel: 'list-ready',
    countLabel: '6 个实例',
    running: '06',
    attention: '01',
  },
  loading: {
    stateLabel: 'loading',
    countLabel: '正在读取实例',
    running: '--',
    attention: '--',
  },
  empty: {
    stateLabel: 'empty',
    countLabel: '0 个实例',
    running: '00',
    attention: '00',
  },
  'discovery-error': {
    stateLabel: 'discovery-error',
    countLabel: '部分数据保留',
    running: '04',
    attention: '02',
  },
  'launch-failed': {
    stateLabel: 'launch-failed',
    countLabel: '弹窗内反馈失败',
    running: '06',
    attention: '01',
  },
};

const cardGrid = document.getElementById('cardGrid');
const errorCardGrid = document.getElementById('errorCardGrid');
const stageStateLabel = document.getElementById('stageStateLabel');
const resultCountLabel = document.getElementById('resultCountLabel');
const summaryRunning = document.getElementById('summaryRunning');
const summaryAttention = document.getElementById('summaryAttention');
const heroActiveCount = document.getElementById('heroActiveCount');
const searchInput = document.getElementById('searchInput');
const toast = document.getElementById('toast');
const previewFrame = document.getElementById('previewFrame');
const launchModal = document.getElementById('launchModal');
const modalError = document.getElementById('modalError');
const pathInput = document.getElementById('pathInput');

let currentState = 'list-ready';
let currentQuery = '';

function renderCards(query = '') {
  const normalized = query.trim().toLowerCase();
  const filtered = instances.filter((instance) => instance.name.toLowerCase().includes(normalized));

  cardGrid.innerHTML = filtered.map((instance) => createCard(instance)).join('');
  errorCardGrid.innerHTML = instances.slice(0, 4).map((instance) => createCard(instance, true)).join('');

  const activeCount = filtered.filter((item) => item.status === 'running').length;
  heroActiveCount.textContent = String(activeCount).padStart(2, '0');

  if (currentState === 'list-ready') {
    resultCountLabel.textContent = filtered.length ? `${filtered.length} 个实例` : '0 个实例';
    summaryRunning.textContent = String(activeCount).padStart(2, '0');
    summaryAttention.textContent = String(filtered.filter((item) => item.status !== 'running').length).padStart(2, '0');
  }

  bindCardActions();
}

function createCard(instance, dimmed = false) {
  const badgeClass = instance.status === 'running'
    ? 'running'
    : instance.status === 'refreshing'
      ? 'refreshing'
      : 'error';

  const ledClass = instance.status === 'running'
    ? 'live'
    : instance.status === 'refreshing'
      ? 'warm'
      : '';

  return `
    <article class="instance-card ${dimmed ? 'dimmed' : ''}">
      <div class="card-top">
        <div class="card-title-block">
          <h3 class="card-title">${instance.name}</h3>
          <div class="card-tags">
            <span class="state-badge ${badgeClass}">${instance.statusText}</span>
            <span class="meta-badge">${instance.source}</span>
          </div>
        </div>
        <div class="card-health">
          <span class="status-led ${ledClass}"></span>
          <div>
            <strong>${instance.health}</strong>
            <p>${instance.healthDetail}</p>
          </div>
        </div>
      </div>

      <div class="meta-grid">
        <div class="meta-row">
          <span class="meta-label">project path</span>
          <span class="meta-value mono-inline">${instance.path}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">instance url</span>
          <span class="meta-value mono-inline">${instance.url}</span>
        </div>
      </div>

      <div class="card-bottom">
        <div class="action-row">
          <button class="instance-action" type="button" data-action="open" data-name="${instance.name}">打开</button>
          <button class="instance-action" type="button" data-action="copy" data-url="${instance.url}">复制链接</button>
        </div>
        <span class="mono-inline">started ${instance.startedAt}</span>
      </div>
    </article>
  `;
}

function bindCardActions() {
  document.querySelectorAll('[data-action="copy"]').forEach((button) => {
    button.addEventListener('click', () => showToast(`已复制 ${button.dataset.url}`));
  });

  document.querySelectorAll('[data-action="open"]').forEach((button) => {
    button.addEventListener('click', () => showToast(`正在打开 ${button.dataset.name}`));
  });
}

function setState(nextState) {
  currentState = nextState;
  document.querySelectorAll('[data-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.panel !== nextState && !(nextState === 'launch-failed' && panel.dataset.panel === 'list-ready');
    panel.classList.toggle('active', !panel.hidden);
  });

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.state === nextState);
  });

  const copy = stateCopy[nextState];
  stageStateLabel.textContent = copy.stateLabel;
  resultCountLabel.textContent = copy.countLabel;
  summaryRunning.textContent = copy.running;
  summaryAttention.textContent = copy.attention;

  if (nextState !== 'launch-failed') {
    closeModal();
  }

  if (nextState === 'launch-failed') {
    openModal(true);
  }
}

function setDevice(device) {
  previewFrame.classList.remove('desktop', 'tablet', 'mobile');
  previewFrame.classList.add(device);

  document.querySelectorAll('.device-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.device === device);
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove('show');
  }, 1600);
}

function openModal(withError = false) {
  launchModal.hidden = false;
  modalError.hidden = !withError;
  requestAnimationFrame(() => pathInput.focus());
}

function closeModal() {
  launchModal.hidden = true;
  modalError.hidden = true;
}

renderCards();
setState('list-ready');
setDevice('desktop');

searchInput.addEventListener('input', (event) => {
  currentQuery = event.target.value;
  renderCards(currentQuery);
});

document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => setState(chip.dataset.state));
});

document.querySelectorAll('.device-chip').forEach((chip) => {
  chip.addEventListener('click', () => setDevice(chip.dataset.device));
});

document.getElementById('openModalButton').addEventListener('click', () => openModal(false));
document.getElementById('closeModalButton').addEventListener('click', closeModal);
document.getElementById('cancelModalButton').addEventListener('click', closeModal);
document.getElementById('refreshButton').addEventListener('click', () => {
  setState('loading');
  showToast('正在刷新实例列表');
  window.setTimeout(() => setState('list-ready'), 900);
});

document.querySelector('.inline-launch').addEventListener('click', () => openModal(false));

document.getElementById('submitLaunchButton').addEventListener('click', () => {
  if (pathInput.value.includes('cc-viewer')) {
    showToast('实例已加入总览台');
    setState('list-ready');
    closeModal();
    return;
  }

  setState('launch-failed');
});

launchModal.addEventListener('click', (event) => {
  if (event.target === launchModal) {
    closeModal();
  }
});
