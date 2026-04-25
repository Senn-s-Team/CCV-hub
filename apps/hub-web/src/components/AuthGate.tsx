/**
 * [INPUT]: 依赖 React 状态与 hub-web API 客户端的登录、登出和登录态接口
 * [OUTPUT]: 对外提供 AuthGate 组件，控制面板登录页、会话检查与已登录内容渲染
 * [POS]: hub-web 的鉴权守门层，位于 App 与 OverviewPage 之间，集中处理面板访问资格
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { type ReactNode, useEffect, useState } from 'react';
import { ApiClientError, getAuthStatus, login, logout } from '../api/client.js';

type AuthGateProps = {
  children: (onLogout: () => Promise<void>) => ReactNode;
};

type AuthState = 'checking' | 'authenticated' | 'anonymous';

export default function AuthGate({ children }: AuthGateProps) {
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    getAuthStatus()
      .then((response) => {
        if (active) setAuthState(response.data.authenticated ? 'authenticated' : 'anonymous');
      })
      .catch(() => {
        if (active) setAuthState('anonymous');
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage('');
    try {
      const response = await login(password);
      if (response.data.authenticated) {
        setPassword('');
        setAuthState('authenticated');
        return;
      }
      setErrorMessage('口令错误');
    } catch (error) {
      setErrorMessage(error instanceof ApiClientError ? error.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    await logout();
    setAuthState('anonymous');
  }

  if (authState === 'checking') {
    return (
      <div className="auth-shell">
        <section className="auth-card panel rise">
          <p className="section-kicker">AUTH CHECK</p>
          <h1>正在校验访问权</h1>
          <div className="skeleton-card auth-skeleton"></div>
        </section>
      </div>
    );
  }

  if (authState === 'authenticated') {
    return children(handleLogout);
  }

  return (
    <div className="auth-shell">
      <form className="auth-card panel rise" onSubmit={(event) => void handleLogin(event)}>
        <p className="section-kicker">CCV HUB / ACCESS GATE</p>
        <h1>进入本机实例总览台</h1>
        <p className="modal-copy">公网入口只开放给持有面板口令的人，实例发现和启动能力继续留在同一个工作面。</p>
        <label className="path-field auth-field">
          <span>面板口令</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            placeholder="输入访问口令"
          />
        </label>
        {errorMessage ? (
          <div className="inline-error">
            <span className="status-led warm"></span>
            <p>{errorMessage}</p>
          </div>
        ) : null}
        <button className="button button-primary auth-submit" type="submit" disabled={isSubmitting || password.length === 0}>
          {isSubmitting ? '校验中…' : '进入面板'}
        </button>
      </form>
    </div>
  );
}
