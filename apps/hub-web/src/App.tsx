/**
 * [INPUT]: 依赖 React 主题状态、AuthGate 鉴权守门层与 OverviewPage 总览页面
 * [OUTPUT]: 对外提供 App 根组件，完成登录态控制、主题模式持久化与主页面挂载
 * [POS]: hub-web 的 React 根组件，位于 QueryClientProvider 下方，收敛面板级访问控制与全局主题入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useState } from 'react';
import AuthGate from './components/AuthGate.js';
import OverviewPage from './pages/OverviewPage.js';

export type ThemeMode = 'system' | 'light' | 'dark';

const themeModeStorageKey = 'ccv-hub.theme-mode';
const themeModes: ThemeMode[] = ['system', 'light', 'dark'];

function isThemeMode(value: string | null): value is ThemeMode {
  return themeModes.includes(value as ThemeMode);
}

function readThemeMode(): ThemeMode {
  try {
    const storedMode = localStorage.getItem(themeModeStorageKey);
    return isThemeMode(storedMode) ? storedMode : 'system';
  } catch {
    return 'system';
  }
}

function persistThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(themeModeStorageKey, mode);
  } catch {
    return;
  }
}

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readThemeMode());

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    persistThemeMode(themeMode);
  }, [themeMode]);

  return (
    <AuthGate>
      {(onLogout) => (
        <OverviewPage
          onLogout={onLogout}
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
        />
      )}
    </AuthGate>
  );
}
