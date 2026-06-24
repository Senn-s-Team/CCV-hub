/**
 * [INPUT]: 依赖 Vitest、Testing Library、React Query、App 与 OverviewPage
 * [OUTPUT]: 对外提供总览页列表、主题切换、筛选空态、加载态、发现失败态、启动弹窗、最近路径、目录搜索、启动参数提交和复制动作回归测试
 * [POS]: hub-web 测试集的主页面状态守卫，覆盖 ccv-hub MVP 的总览页关键交互与主题入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App.js';
import OverviewPage from '../pages/OverviewPage.js';

const fetchMock = vi.fn();
const writeText = vi.fn();
const openMock = vi.fn();
let storage = new Map<string, string>();
let mobileSheetEnabled = false;

const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { storage.set(key, value); }),
  removeItem: vi.fn((key: string) => { storage.delete(key); }),
  clear: vi.fn(() => { storage.clear(); }),
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function createInstance(id: string, projectName: string, projectPath: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    projectName,
    projectPath,
    url: `http://127.0.0.1:${id === 'one' ? '4321' : '4322'}`,
    port: id === 'one' ? 4321 : 4322,
    pid: id === 'one' ? 101 : 102,
    status: 'running',
    source: 'launcher',
    startedAt: '2026-04-22T10:00:00.000Z',
    lastSeen: '2026-04-22T10:00:05.000Z',
    canStop: true,
    ...overrides,
  };
}

function mockFetchJsonSequence(...responses: unknown[]) {
  fetchMock.mockReset();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce({
      json: async () => response,
    });
  }
}

function renderPage(onLogout = vi.fn()) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <OverviewPage onLogout={onLogout} themeMode="system" onThemeModeChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

function renderApp() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <App />
    </QueryClientProvider>,
  );
}

async function openLaunchDialog() {
  fireEvent.click((await screen.findAllByText('启动新实例'))[0]!);
  return screen.getByRole('dialog', { name: '启动新的 cc-viewer 实例' });
}

function installMatchMediaStub() {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query === '(max-width: 639px)' ? mobileSheetEnabled : false,
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    addListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => true,
  })));

  return {
    setMobileSheet(nextValue: boolean) {
      mobileSheetEnabled = nextValue;
      const event = { matches: mobileSheetEnabled, media: '(max-width: 639px)' } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

describe('OverviewPage', () => {
  beforeEach(() => {
    mobileSheetEnabled = false;
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('open', openMock);
    storage = new Map<string, string>();
    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText,
      },
    });
    installMatchMediaStub();
  });

  afterEach(() => {
    cleanup();
    storage.clear();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    writeText.mockReset();
    openMock.mockReset();
  });

  it('renders loading state while instances are being fetched', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getAllByText('loading')[0]).toBeInTheDocument();
    expect(document.querySelectorAll('.skeleton-card')).toHaveLength(3);
  });

  it('renders discovery-error state with refresh action', async () => {
    mockFetchJsonSequence({
      ok: false,
      error: {
        code: 'LIST_FAILED',
        message: 'Instance discovery failed',
      },
    });

    renderPage();

    expect(await screen.findByText('实例读取出现异常')).toBeInTheDocument();
    expect(screen.getByText('Instance discovery failed')).toBeInTheDocument();
    expect(screen.getAllByText('discovery-error')[0]).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再次刷新' })).toBeInTheDocument();
  });

  it('shows server failure messages before endpoint schema parsing', async () => {
    mockFetchJsonSequence({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });

    renderPage();

    expect(await screen.findByText('Authentication required')).toBeInTheDocument();
  });

  it('renders list-ready state and filters instances by project name', async () => {
    mockFetchJsonSequence({
      ok: true,
      data: {
        instances: [
          createInstance('one', 'cc-viewer', '/tmp/cc-viewer'),
          createInstance('two', 'sdk-lab', '/tmp/sdk-lab', {
            startedAt: '2026-04-22T11:00:00.000Z',
            lastSeen: '2026-04-22T11:00:05.000Z',
          }),
        ],
      },
    });

    renderPage();

    expect(await screen.findByText('cc-viewer')).toBeInTheDocument();
    expect(screen.getAllByText('list-ready')[0]).toBeInTheDocument();
    expect(screen.getAllByText('访问入口')[0]).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('例如：viewer / sdk / mobile'), { target: { value: 'sdk' } });

    await waitFor(() => {
      expect(screen.queryByText('cc-viewer')).not.toBeInTheDocument();
    });
    expect(screen.getByText('sdk-lab')).toBeInTheDocument();
  });

  it('shows filter miss state and clears the project filter', async () => {
    mockFetchJsonSequence({
      ok: true,
      data: {
        instances: [createInstance('one', 'cc-viewer', '/tmp/cc-viewer')],
      },
    });

    renderPage();

    expect(await screen.findByText('cc-viewer')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('例如：viewer / sdk / mobile'), { target: { value: 'missing' } });

    expect(await screen.findByText('没有匹配项目名的运行实例')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '清空筛选' }));

    expect(screen.getByText('cc-viewer')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('例如：viewer / sdk / mobile')).toHaveValue('');
  });

  it('renders empty state when no running instances exist', async () => {
    mockFetchJsonSequence({
      ok: true,
      data: { instances: [] },
    });

    renderPage();

    expect(await screen.findByText('当前还没有运行中的实例')).toBeInTheDocument();
  });

  it('defaults to system theme and persists manual theme changes', async () => {
    mockFetchJsonSequence(
      {
        ok: true,
        data: { authenticated: true, configured: true },
      },
      {
        ok: true,
        data: { instances: [] },
      },
    );

    renderApp();

    const systemButton = await screen.findByRole('button', { name: '系统' });
    expect(systemButton).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.dataset.theme).toBe('system');
    expect(storage.get('ccv-hub.theme-mode')).toBe('system');

    fireEvent.click(screen.getByRole('button', { name: '深色' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(storage.get('ccv-hub.theme-mode')).toBe('dark');
    expect(screen.getByRole('button', { name: '深色' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '浅色' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(storage.get('ccv-hub.theme-mode')).toBe('light');
  });

  it('opens launch modal with an empty absolute path input', async () => {
    mockFetchJsonSequence({
      ok: true,
      data: { instances: [] },
    });

    renderPage();

    const dialog = await openLaunchDialog();
    const input = within(dialog).getByPlaceholderText('输入项目绝对路径');

    expect(input).toHaveValue('');
    expect(within(dialog).getByText('等待输入绝对路径')).toBeInTheDocument();
    expect(within(dialog).getByText('确认启动')).toBeDisabled();
  });

  it('shows launch summary after typing an absolute path and enables submit', async () => {
    mockFetchJsonSequence({
      ok: true,
      data: { instances: [] },
    });

    renderPage();

    const dialog = await openLaunchDialog();
    const pathInput = within(dialog).getByPlaceholderText('输入项目绝对路径');
    const submitButton = within(dialog).getByRole('button', { name: '确认启动' });

    expect(submitButton).toBeDisabled();
    fireEvent.change(pathInput, { target: { value: '/tmp/cc-viewer' } });

    expect(within(dialog).getByText('将启动')).toBeInTheDocument();
    expect(within(dialog).getByText('/tmp/cc-viewer')).toBeInTheDocument();
    expect(submitButton).toBeEnabled();
  });

  it('selects a visible host directory into the launch path input', async () => {
    mockFetchJsonSequence(
      {
        ok: true,
        data: { instances: [] },
      },
      {
        ok: true,
        data: {
          roots: [{ name: 'projects', path: '/home/opc/projects', readable: true }],
        },
      },
      {
        ok: true,
        data: {
          currentPath: '/home/opc/projects',
          parentPath: null,
          entries: [{ name: 'ccvs', path: '/home/opc/projects/ccvs', readable: true }],
        },
      },
    );

    renderPage();

    const dialog = await openLaunchDialog();
    fireEvent.click(within(dialog).getByText('选择宿主机路径'));
    fireEvent.click(await screen.findByRole('button', { name: '选择 /home/opc/projects/ccvs' }));

    expect(within(dialog).getByPlaceholderText('输入项目绝对路径')).toHaveValue('/home/opc/projects/ccvs');
    expect(fetchMock).toHaveBeenCalledWith('/api/host-paths/roots', {
      method: 'GET',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/host-paths/list?path=%2Fhome%2Fopc%2Fprojects', {
      method: 'GET',
    });
  });

  it('uses the current host directory and persists it to recent paths', async () => {
    mockFetchJsonSequence(
      {
        ok: true,
        data: { instances: [] },
      },
      {
        ok: true,
        data: {
          roots: [{ name: 'projects', path: '/home/opc/projects', readable: true }],
        },
      },
      {
        ok: true,
        data: {
          currentPath: '/home/opc/projects/ccvs',
          parentPath: '/home/opc/projects',
          entries: [{ name: 'ccv-hub', path: '/home/opc/projects/ccvs/ccv-hub', readable: true }],
        },
      },
    );

    renderPage();

    const dialog = await openLaunchDialog();
    fireEvent.click(within(dialog).getByText('选择宿主机路径'));
    fireEvent.click(await screen.findByRole('button', { name: '使用此目录' }));

    expect(within(dialog).getByPlaceholderText('输入项目绝对路径')).toHaveValue('/home/opc/projects/ccvs');
    expect(storage.get('ccv-hub.recent-project-paths')).toBe(JSON.stringify(['/home/opc/projects/ccvs']));
    expect(within(dialog).getByRole('button', { name: '/home/opc/projects/ccvs' })).toBeInTheDocument();
  });

  it('filters the current host directory list by path search', async () => {
    mockFetchJsonSequence(
      {
        ok: true,
        data: { instances: [] },
      },
      {
        ok: true,
        data: {
          roots: [{ name: 'projects', path: '/home/opc/projects', readable: true }],
        },
      },
      {
        ok: true,
        data: {
          currentPath: '/home/opc/projects',
          parentPath: null,
          entries: [
            { name: 'ccvs', path: '/home/opc/projects/ccvs', readable: true },
            { name: 'sdk-lab', path: '/home/opc/projects/sdk-lab', readable: true },
          ],
        },
      },
    );

    renderPage();

    const dialog = await openLaunchDialog();
    fireEvent.click(within(dialog).getByText('选择宿主机路径'));
    await screen.findByText('ccvs');
    fireEvent.change(within(dialog).getByPlaceholderText('输入目录名或路径'), { target: { value: 'sdk' } });

    expect(screen.queryByText('ccvs')).not.toBeInTheDocument();
    expect(screen.getByText('sdk-lab')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByPlaceholderText('输入目录名或路径'), { target: { value: 'missing' } });
    expect(screen.getByText('当前目录没有匹配项')).toBeInTheDocument();
  });

  it('writes successful launch paths into recent path history', async () => {
    mockFetchJsonSequence(
      {
        ok: true,
        data: { instances: [] },
      },
      {
        ok: true,
        data: {
          instance: createInstance('created', 'cc-viewer', '/tmp/cc-viewer'),
        },
      },
      {
        ok: true,
        data: { instances: [] },
      },
    );

    renderPage();

    const dialog = await openLaunchDialog();
    fireEvent.change(within(dialog).getByPlaceholderText('输入项目绝对路径'), {
      target: { value: ' /tmp/cc-viewer ' },
    });
    fireEvent.click(within(dialog).getByText('确认启动'));

    await waitFor(() => {
      expect(storage.get('ccv-hub.recent-project-paths')).toBe(JSON.stringify(['/tmp/cc-viewer']));
    });
    const reopenedDialog = await openLaunchDialog();
    fireEvent.click(within(reopenedDialog).getByRole('button', { name: '/tmp/cc-viewer' }));
    expect(within(reopenedDialog).getByPlaceholderText('输入项目绝对路径')).toHaveValue('/tmp/cc-viewer');
    fireEvent.click(within(reopenedDialog).getByLabelText('移除最近路径 /tmp/cc-viewer'));
    expect(within(reopenedDialog).queryByRole('button', { name: '/tmp/cc-viewer' })).not.toBeInTheDocument();
  });

  it('keeps failed launch paths out of recent path history', async () => {
    mockFetchJsonSequence(
      {
        ok: true,
        data: { instances: [] },
      },
      {
        ok: false,
        error: {
          code: 'INVALID_PATH',
          message: 'Project path is invalid',
        },
      },
    );

    renderPage();

    const dialog = await openLaunchDialog();
    fireEvent.change(within(dialog).getByPlaceholderText('输入项目绝对路径'), {
      target: { value: ' /tmp/cc-viewer ' },
    });
    fireEvent.click(within(dialog).getByText('确认启动'));

    expect(await screen.findByText('Project path is invalid')).toBeInTheDocument();
    expect(storage.get('ccv-hub.recent-project-paths')).toBeUndefined();
  });

  it('submits launch options from the mobile advanced panel with the project path', async () => {
    mobileSheetEnabled = true;
    installMatchMediaStub();
    mockFetchJsonSequence(
      {
        ok: true,
        data: { instances: [] },
      },
      {
        ok: true,
        data: {
          instance: createInstance('created', 'cc-viewer', '/tmp/cc-viewer'),
        },
      },
      {
        ok: true,
        data: { instances: [] },
      },
    );

    renderPage();

    const dialog = await openLaunchDialog();
    expect(within(dialog).queryByPlaceholderText('例如 claude-sonnet-4-6')).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /启动参数/ }));
    fireEvent.change(within(dialog).getByPlaceholderText('输入项目绝对路径'), {
      target: { value: ' /tmp/cc-viewer ' },
    });
    fireEvent.change(within(dialog).getByDisplayValue('普通启动'), { target: { value: 'continue' } });
    fireEvent.change(within(dialog).getByPlaceholderText('例如 claude-sonnet-4-6'), {
      target: { value: ' claude-sonnet-4-6 ' },
    });
    fireEvent.change(within(dialog).getByPlaceholderText('可选，启动后直接发送给 Claude'), {
      target: { value: ' inspect this project ' },
    });
    fireEvent.click(within(dialog).getByLabelText('跳过权限确认 (--d)'));
    fireEvent.click(within(dialog).getByLabelText('允许跳过权限确认 (--ad)'));
    fireEvent.click(within(dialog).getByText('确认启动'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/instances', {
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        body: JSON.stringify({
          projectPath: '/tmp/cc-viewer',
          options: {
            mode: 'continue',
            prompt: 'inspect this project',
            model: 'claude-sonnet-4-6',
            dangerouslySkipPermissions: true,
            allowDangerouslySkipPermissions: true,
          },
        }),
      });
    });
  });

  it('keeps launch error inside dialog and preserves input after failed launch', async () => {
    mockFetchJsonSequence(
      {
        ok: true,
        data: { instances: [] },
      },
      {
        ok: false,
        error: {
          code: 'INVALID_PATH',
          message: 'Project path is invalid',
        },
      },
    );

    renderPage();

    const dialog = await openLaunchDialog();
    const pathInput = within(dialog).getByPlaceholderText('输入项目绝对路径');
    fireEvent.change(pathInput, {
      target: { value: ' /tmp/cc-viewer ' },
    });
    fireEvent.click(within(dialog).getByText('确认启动'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith('/api/instances', {
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        body: JSON.stringify({
          projectPath: '/tmp/cc-viewer',
          options: {
            mode: 'default',
            prompt: '',
            model: '',
            dangerouslySkipPermissions: false,
            allowDangerouslySkipPermissions: false,
          },
        }),
      });
    });

    const errorNode = await within(dialog).findByText('Project path is invalid');
    expect(errorNode).toBeInTheDocument();
    expect(pathInput).toHaveValue(' /tmp/cc-viewer ');
  });

  it('calls logout from the topbar action', async () => {
    mockFetchJsonSequence({
      ok: true,
      data: { instances: [] },
    });
    const onLogout = vi.fn();

    renderPage(onLogout);

    fireEvent.click(await screen.findByRole('button', { name: '退出' }));

    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('stops an instance from the card action', async () => {
    mockFetchJsonSequence(
      {
        ok: true,
        data: {
          instances: [createInstance('one', 'cc-viewer', '/tmp/cc-viewer')],
        },
      },
      {
        ok: true,
        data: {
          action: 'stop',
          removed: true,
        },
      },
      {
        ok: true,
        data: { instances: [] },
      },
    );

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '停止' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/instances/one/actions/stop', {
        method: 'POST',
      });
    });
    expect(await screen.findByText('实例已停止')).toBeInTheDocument();
  });

  it('shows lifecycle failures in toast', async () => {
    mockFetchJsonSequence(
      {
        ok: true,
        data: {
          instances: [createInstance('one', 'cc-viewer', '/tmp/cc-viewer')],
        },
      },
      {
        ok: false,
        error: {
          code: 'LIFECYCLE_FAILED',
          message: 'Instance is not running',
        },
      },
    );

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '停止' }));

    expect(await screen.findByText('Instance is not running')).toBeInTheDocument();
  });

  it('hides stop action for instances without a trusted stop handle', async () => {
    mockFetchJsonSequence({
      ok: true,
      data: {
        instances: [createInstance('manual-one', 'manual-viewer', '/tmp/manual-viewer', {
          source: 'manual',
          canStop: false,
        })],
      },
    });

    renderPage();

    expect(await screen.findByText('manual-viewer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '停止' })).not.toBeInTheDocument();
  });

  it('copies instance url through clipboard api', async () => {
    mockFetchJsonSequence({
      ok: true,
      data: {
        instances: [createInstance('one', 'cc-viewer', '/tmp/cc-viewer')],
      },
    });

    renderPage();

    fireEvent.click(await screen.findByText('复制链接'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('http://127.0.0.1:4321');
    });
  });
});
