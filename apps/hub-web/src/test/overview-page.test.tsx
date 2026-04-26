/**
 * [INPUT]: 依赖 Vitest、Testing Library、React Query 与 OverviewPage
 * [OUTPUT]: 对外提供总览页列表、空态、加载态、发现失败态、启动弹窗、最近路径、目录搜索、启动参数提交和复制动作回归测试
 * [POS]: hub-web 测试集的主页面状态守卫，覆盖 ccv-hub MVP 的总览页关键交互
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OverviewPage from '../pages/OverviewPage.js';

const fetchMock = vi.fn();
const writeText = vi.fn();
const openMock = vi.fn();
let storage = new Map<string, string>();

const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => { storage.set(key, value); }),
  removeItem: vi.fn((key: string) => { storage.delete(key); }),
  clear: vi.fn(() => { storage.clear(); }),
};

function renderPage(onLogout = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <OverviewPage onLogout={onLogout} />
    </QueryClientProvider>,
  );
}

describe('OverviewPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('open', openMock);
    storage = new Map<string, string>();
    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText,
      },
    });
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

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(document.querySelectorAll('.skeleton-card')).toHaveLength(3);
  });

  it('renders discovery-error state with refresh action', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        ok: false,
        error: {
          code: 'LIST_FAILED',
          message: 'Instance discovery failed',
        },
      }),
    });

    renderPage();

    expect(await screen.findByText('实例读取出现异常')).toBeInTheDocument();
    expect(screen.getByText('Instance discovery failed')).toBeInTheDocument();
    expect(screen.getByText('discovery-error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再次刷新' })).toBeInTheDocument();
  });

  it('shows server failure messages before endpoint schema parsing', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      }),
    });

    renderPage();

    expect(await screen.findByText('Authentication required')).toBeInTheDocument();
  });

  it('renders list-ready state and filters instances by project name', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        ok: true,
        data: {
          instances: [
            {
              id: 'one',
              projectName: 'cc-viewer',
              projectPath: '/tmp/cc-viewer',
              url: 'http://127.0.0.1:4321',
              port: 4321,
              pid: 101,
              status: 'running',
              source: 'launcher',
              startedAt: '2026-04-22T10:00:00.000Z',
              lastSeen: '2026-04-22T10:00:05.000Z',
            },
            {
              id: 'two',
              projectName: 'sdk-lab',
              projectPath: '/tmp/sdk-lab',
              url: 'http://127.0.0.1:4322',
              port: 4322,
              pid: 102,
              status: 'running',
              source: 'launcher',
              startedAt: '2026-04-22T11:00:00.000Z',
              lastSeen: '2026-04-22T11:00:05.000Z',
            },
          ],
        },
      }),
    });

    renderPage();

    expect(await screen.findByText('cc-viewer')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('例如：viewer / sdk / mobile'), { target: { value: 'sdk' } });

    await waitFor(() => {
      expect(screen.queryByText('cc-viewer')).not.toBeInTheDocument();
    });
    expect(screen.getByText('sdk-lab')).toBeInTheDocument();
  });

  it('renders empty state when no running instances exist', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        ok: true,
        data: { instances: [] },
      }),
    });

    renderPage();

    expect(await screen.findByText('当前还没有运行中的实例')).toBeInTheDocument();
  });

  it('opens launch modal with an empty absolute path input', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        ok: true,
        data: { instances: [] },
      }),
    });

    renderPage();

    fireEvent.click((await screen.findAllByText('启动新实例'))[0]!);

    const dialog = screen.getByRole('dialog', { name: '启动新的 cc-viewer 实例' });
    const input = within(dialog).getByPlaceholderText('输入项目绝对路径');

    expect(input).toHaveValue('');
    expect(within(dialog).getByDisplayValue('普通启动')).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText('例如 claude-sonnet-4-6')).toHaveValue('');
    expect(within(dialog).getByPlaceholderText('可选，启动后直接发送给 Claude')).toHaveValue('');
    expect(within(dialog).getByText('确认启动')).toBeDisabled();
  });

  it('selects a host directory into the launch path input', async () => {
    fetchMock
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: { instances: [] },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            roots: [{ name: 'projects', path: '/home/opc/projects', readable: true }],
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            currentPath: '/home/opc/projects',
            parentPath: null,
            entries: [{ name: 'ccvs', path: '/home/opc/projects/ccvs', readable: true }],
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            currentPath: '/home/opc/projects/ccvs',
            parentPath: '/home/opc/projects',
            entries: [],
          },
        }),
      });

    renderPage();

    fireEvent.click((await screen.findAllByText('启动新实例'))[0]!);
    fireEvent.click(screen.getByText('选择宿主机路径'));
    fireEvent.click(await screen.findByText('ccvs'));
    await waitFor(() => expect(screen.getByText('/home/opc/projects/ccvs')).toBeInTheDocument());
    fireEvent.click(screen.getByText('使用此目录'));

    expect(screen.getByPlaceholderText('输入项目绝对路径')).toHaveValue('/home/opc/projects/ccvs');
    expect(fetchMock).toHaveBeenCalledWith('/api/host-paths/roots', {
      headers: { 'Content-Type': 'application/json' },
      method: 'GET',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/host-paths/list?path=%2Fhome%2Fopc%2Fprojects', {
      headers: { 'Content-Type': 'application/json' },
      method: 'GET',
    });
  });

  it('filters the current host directory list by path search', async () => {
    fetchMock
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: { instances: [] },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            roots: [{ name: 'projects', path: '/home/opc/projects', readable: true }],
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            currentPath: '/home/opc/projects',
            parentPath: null,
            entries: [
              { name: 'ccvs', path: '/home/opc/projects/ccvs', readable: true },
              { name: 'sdk-lab', path: '/home/opc/projects/sdk-lab', readable: true },
            ],
          },
        }),
      });

    renderPage();

    fireEvent.click((await screen.findAllByText('启动新实例'))[0]!);
    fireEvent.click(screen.getByText('选择宿主机路径'));
    await screen.findByText('ccvs');
    fireEvent.change(screen.getByPlaceholderText('输入目录名或路径'), { target: { value: 'sdk' } });

    expect(screen.queryByText('ccvs')).not.toBeInTheDocument();
    expect(screen.getByText('sdk-lab')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('输入目录名或路径'), { target: { value: 'missing' } });
    expect(screen.getByText('当前目录没有匹配项')).toBeInTheDocument();
  });

  it('writes successful launch paths into recent path history', async () => {
    fetchMock
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: { instances: [] },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            instance: {
              id: 'created',
              projectName: 'cc-viewer',
              projectPath: '/tmp/cc-viewer',
              url: 'http://127.0.0.1:4321',
              port: 4321,
              pid: 101,
              status: 'running',
              source: 'launcher',
              startedAt: '2026-04-22T10:00:00.000Z',
              lastSeen: '2026-04-22T10:00:05.000Z',
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: { instances: [] },
        }),
      });

    renderPage();

    fireEvent.click((await screen.findAllByText('启动新实例'))[0]!);
    fireEvent.change(screen.getByPlaceholderText('输入项目绝对路径'), {
      target: { value: ' /tmp/cc-viewer ' },
    });
    fireEvent.click(screen.getByText('确认启动'));

    await waitFor(() => {
      expect(storage.get('ccv-hub.recent-project-paths')).toBe(JSON.stringify(['/tmp/cc-viewer']));
    });
    fireEvent.click((await screen.findAllByText('启动新实例'))[0]!);
    fireEvent.click(screen.getByText('/tmp/cc-viewer'));
    expect(screen.getByPlaceholderText('输入项目绝对路径')).toHaveValue('/tmp/cc-viewer');
    fireEvent.click(screen.getByLabelText('移除最近路径 /tmp/cc-viewer'));
    expect(screen.queryByText('/tmp/cc-viewer')).not.toBeInTheDocument();
  });

  it('keeps failed launch paths out of recent path history', async () => {
    fetchMock
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: { instances: [] },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: false,
          error: {
            code: 'INVALID_PATH',
            message: 'Project path is invalid',
          },
        }),
      });

    renderPage();

    fireEvent.click((await screen.findAllByText('启动新实例'))[0]!);
    fireEvent.change(screen.getByPlaceholderText('输入项目绝对路径'), {
      target: { value: ' /tmp/cc-viewer ' },
    });
    fireEvent.click(screen.getByText('确认启动'));

    expect(await screen.findByText('Project path is invalid')).toBeInTheDocument();
    expect(storage.get('ccv-hub.recent-project-paths')).toBeUndefined();
  });

  it('submits launch options with the project path', async () => {
    fetchMock
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: { instances: [] },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: {
            instance: {
              id: 'created',
              projectName: 'cc-viewer',
              projectPath: '/tmp/cc-viewer',
              url: 'http://127.0.0.1:4321',
              port: 4321,
              pid: 101,
              status: 'running',
              source: 'launcher',
              startedAt: '2026-04-22T10:00:00.000Z',
              lastSeen: '2026-04-22T10:00:05.000Z',
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: { instances: [] },
        }),
      });

    renderPage();

    fireEvent.click((await screen.findAllByText('启动新实例'))[0]!);
    fireEvent.change(screen.getByPlaceholderText('输入项目绝对路径'), {
      target: { value: ' /tmp/cc-viewer ' },
    });
    fireEvent.change(screen.getByDisplayValue('普通启动'), { target: { value: 'continue' } });
    fireEvent.change(screen.getByPlaceholderText('例如 claude-sonnet-4-6'), {
      target: { value: ' claude-sonnet-4-6 ' },
    });
    fireEvent.change(screen.getByPlaceholderText('可选，启动后直接发送给 Claude'), {
      target: { value: ' inspect this project ' },
    });
    fireEvent.click(screen.getByLabelText('跳过权限确认 (--d)'));
    fireEvent.click(screen.getByLabelText('允许跳过权限确认 (--ad)'));
    fireEvent.click(screen.getByText('确认启动'));

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

  it('keeps launch error inside modal after failed launch', async () => {
    fetchMock
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          data: { instances: [] },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: false,
          error: {
            code: 'INVALID_PATH',
            message: 'Project path is invalid',
          },
        }),
      });

    renderPage();

    fireEvent.click((await screen.findAllByText('启动新实例'))[0]!);
    fireEvent.change(screen.getByPlaceholderText('输入项目绝对路径'), {
      target: { value: ' /tmp/cc-viewer ' },
    });
    fireEvent.click(screen.getByText('确认启动'));

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
    expect(await screen.findByText('Project path is invalid')).toBeInTheDocument();
  });

  it('calls logout from the topbar action', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        ok: true,
        data: { instances: [] },
      }),
    });
    const onLogout = vi.fn();

    renderPage(onLogout);

    fireEvent.click(await screen.findByRole('button', { name: '退出' }));

    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('copies instance url through clipboard api', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        ok: true,
        data: {
          instances: [
            {
              id: 'one',
              projectName: 'cc-viewer',
              projectPath: '/tmp/cc-viewer',
              url: 'http://127.0.0.1:4321',
              port: 4321,
              pid: 101,
              status: 'running',
              source: 'launcher',
              startedAt: '2026-04-22T10:00:00.000Z',
              lastSeen: '2026-04-22T10:00:05.000Z',
            },
          ],
        },
      }),
    });

    renderPage();

    fireEvent.click(await screen.findByText('复制链接'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('http://127.0.0.1:4321');
    });
  });
});
