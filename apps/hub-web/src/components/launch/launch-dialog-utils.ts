/**
 * [INPUT]: 依赖浏览器 localStorage、matchMedia 与纯路径字符串
 * [OUTPUT]: 对外提供启动弹窗最近路径读写、移动端断点判断、路径压缩、叶子名与 breadcrumb 派生函数
 * [POS]: components 的启动弹窗工具层，被 LaunchDialog 与 LaunchPathPicker 共享
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const recentPathsStorageKey = 'ccv-hub.recent-project-paths';
const maxRecentPaths = 8;
export const mobileLaunchDialogQuery = '(max-width: 639px)';

export function readRecentPaths(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentPathsStorageKey) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((path): path is string => typeof path === 'string' && path.startsWith('/')).slice(0, maxRecentPaths) : [];
  } catch {
    return [];
  }
}

export function persistRecentPaths(paths: string[]): void {
  try {
    localStorage.setItem(recentPathsStorageKey, JSON.stringify(paths));
  } catch {
    return;
  }
}

export function promoteRecentPath(paths: string[], pathname: string): string[] {
  return [pathname, ...paths.filter((path) => path !== pathname)].slice(0, maxRecentPaths);
}

export function readIsMobileLaunchDialog(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(mobileLaunchDialogQuery).matches;
}

export function compactPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length <= 3) return pathname;
  return `.../${parts.slice(-3).join('/')}`;
}

export function leafName(pathname: string): string {
  if (pathname === '/') return '/';
  return pathname.split('/').filter(Boolean).at(-1) ?? pathname;
}

export function pathCrumbs(pathname: string): Array<{ label: string; path: string }> {
  const parts = pathname.split('/').filter(Boolean);
  return parts.reduce<Array<{ label: string; path: string }>>((crumbs, part) => {
    const previousPath = crumbs.at(-1)?.path ?? '';
    const nextPath = `${previousPath}/${part}`.replaceAll('//', '/');
    return [...crumbs, { label: part, path: nextPath }];
  }, pathname.startsWith('/') ? [{ label: '/', path: '/' }] : []);
}
