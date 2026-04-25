import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OverviewPage from '../pages/OverviewPage.js';

const fetchMock = vi.fn();
const writeText = vi.fn();
const openMock = vi.fn();

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <OverviewPage />
    </QueryClientProvider>,
  );
}

describe('OverviewPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('open', openMock);
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText,
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    writeText.mockReset();
    openMock.mockReset();
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
    const input = within(dialog).getByPlaceholderText('/home/opc/projects/your-project');

    expect(input).toHaveValue('');
    expect(within(dialog).getByText('确认启动')).toBeDisabled();
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
    fireEvent.change(screen.getByPlaceholderText('/home/opc/projects/your-project'), {
      target: { value: ' /tmp/cc-viewer ' },
    });
    fireEvent.click(screen.getByText('确认启动'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith('/api/instances', {
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        body: JSON.stringify({ projectPath: '/tmp/cc-viewer' }),
      });
    });
    expect(await screen.findByText('Project path is invalid')).toBeInTheDocument();
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
