/**
 * [INPUT]: 依赖 Vitest、Testing Library、React Query 与 AuthGate
 * [OUTPUT]: 对外提供登录守门层的检查态、未登录态、登录成功与登录失败回归测试
 * [POS]: hub-web 测试集的面板鉴权守卫，覆盖进入总览台前的访问控制路径
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthGate from '../components/AuthGate.js';

const fetchMock = vi.fn();

function renderGate() {
  return render(
    <AuthGate>{() => <main>面板已解锁</main>}</AuthGate>,
  );
}

describe('AuthGate', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('renders checking state before auth status returns', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));

    renderGate();

    expect(screen.getByText('正在校验访问权')).toBeInTheDocument();
  });

  it('renders panel when session is authenticated', async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({ ok: true, data: { authenticated: true, configured: true } }),
    });

    renderGate();

    expect(await screen.findByText('面板已解锁')).toBeInTheDocument();
  });

  it('logs in with password and renders panel', async () => {
    fetchMock
      .mockResolvedValueOnce({
        json: async () => ({ ok: true, data: { authenticated: false, configured: true } }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ ok: true, data: { authenticated: true, configured: true } }),
      });

    renderGate();

    fireEvent.change(await screen.findByPlaceholderText('输入访问口令'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '进入面板' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith('/api/auth/login', {
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        body: JSON.stringify({ password: 'secret' }),
      });
    });
    expect(await screen.findByText('面板已解锁')).toBeInTheDocument();
  });

  it('shows login error when password is rejected', async () => {
    fetchMock
      .mockResolvedValueOnce({
        json: async () => ({ ok: true, data: { authenticated: false, configured: true } }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ ok: true, data: { authenticated: false, configured: true } }),
      });

    renderGate();

    fireEvent.change(await screen.findByPlaceholderText('输入访问口令'), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: '进入面板' }));

    expect(await screen.findByText('口令错误')).toBeInTheDocument();
  });
});
