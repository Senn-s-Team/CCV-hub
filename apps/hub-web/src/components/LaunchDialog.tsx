/**
 * [INPUT]: 依赖 React 状态、Hub API 客户端、shared-contracts 启动请求与宿主机路径类型、父级传入的启动回调、错误消息和开关状态
 * [OUTPUT]: 对外提供 LaunchDialog 组件，处理宿主机路径选择/进入、绝对路径、cc-viewer 启动参数、错误保留与提交动作
 * [POS]: hub-web 的聚焦层组件，承接 prototype 启动弹窗的交互闭环
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useState } from 'react';
import type { CreateInstanceRequest, HostPathEntry, LaunchMode } from '@ccv-hub/shared-contracts';
import { getHostPathList, getHostPathRoots } from '../api/client.js';

const recentPathsStorageKey = 'ccv-hub.recent-project-paths';
const maxRecentPaths = 8;

type LaunchDialogProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  errorMessage: string;
  onClose: () => void;
  onSubmit: (request: CreateInstanceRequest) => Promise<void>;
};

function readRecentPaths(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentPathsStorageKey) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((path): path is string => typeof path === 'string' && path.startsWith('/')).slice(0, maxRecentPaths) : [];
  } catch {
    return [];
  }
}

function persistRecentPaths(paths: string[]): void {
  try {
    localStorage.setItem(recentPathsStorageKey, JSON.stringify(paths));
  } catch {
    return;
  }
}

function promoteRecentPath(paths: string[], pathname: string): string[] {
  return [pathname, ...paths.filter((path) => path !== pathname)].slice(0, maxRecentPaths);
}

export default function LaunchDialog({
  isOpen,
  isSubmitting,
  errorMessage,
  onClose,
  onSubmit,
}: LaunchDialogProps) {
  const [projectPath, setProjectPath] = useState('');
  const [mode, setMode] = useState<LaunchMode>('default');
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('');
  const [dangerouslySkipPermissions, setDangerouslySkipPermissions] = useState(false);
  const [allowDangerouslySkipPermissions, setAllowDangerouslySkipPermissions] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [roots, setRoots] = useState<HostPathEntry[]>([]);
  const [entries, setEntries] = useState<HostPathEntry[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [pathBrowserError, setPathBrowserError] = useState('');
  const [isBrowsingPaths, setIsBrowsingPaths] = useState(false);
  const [pathSearch, setPathSearch] = useState('');
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const trimmedPath = projectPath.trim();
  const trimmedPrompt = prompt.trim();
  const trimmedModel = model.trim();
  const normalizedPathSearch = pathSearch.trim().toLowerCase();
  const filteredEntries = normalizedPathSearch
    ? entries.filter((entry) => `${entry.name} ${entry.path}`.toLowerCase().includes(normalizedPathSearch))
    : entries;
  const canSubmit = trimmedPath.startsWith('/');

  useEffect(() => {
    if (isOpen) {
      setProjectPath('');
      setMode('default');
      setPrompt('');
      setModel('');
      setDangerouslySkipPermissions(false);
      setAllowDangerouslySkipPermissions(false);
      setBrowserOpen(false);
      setRoots([]);
      setEntries([]);
      setCurrentPath('');
      setParentPath(null);
      setPathBrowserError('');
      setIsBrowsingPaths(false);
      setPathSearch('');
      setRecentPaths(readRecentPaths());
    }
  }, [isOpen]);

  function rememberPath(pathname: string) {
    const nextPaths = promoteRecentPath(recentPaths, pathname);
    setRecentPaths(nextPaths);
    persistRecentPaths(nextPaths);
  }

  function removeRecentPath(pathname: string) {
    const nextPaths = recentPaths.filter((path) => path !== pathname);
    setRecentPaths(nextPaths);
    persistRecentPaths(nextPaths);
  }

  async function openPathBrowser() {
    setBrowserOpen(true);
    setPathBrowserError('');
    setIsBrowsingPaths(true);
    try {
      const rootsResponse = await getHostPathRoots();
      if (!rootsResponse.ok) return;
      setRoots(rootsResponse.data.roots);
      const firstRoot = rootsResponse.data.roots[0]?.path;
      if (firstRoot) {
        await loadPath(firstRoot);
      } else {
        setEntries([]);
        setCurrentPath('');
        setParentPath(null);
      }
    } catch (error) {
      setPathBrowserError(error instanceof Error ? error.message : '宿主机路径读取失败');
    } finally {
      setIsBrowsingPaths(false);
    }
  }

  async function loadPath(pathname: string) {
    setPathBrowserError('');
    setPathSearch('');
    setIsBrowsingPaths(true);
    try {
      const response = await getHostPathList(pathname);
      if (!response.ok) return;
      setCurrentPath(response.data.currentPath);
      setParentPath(response.data.parentPath);
      setEntries(response.data.entries);
    } catch (error) {
      setPathBrowserError(error instanceof Error ? error.message : '宿主机路径读取失败');
    } finally {
      setIsBrowsingPaths(false);
    }
  }

  async function submitLaunchRequest() {
    try {
      await onSubmit({
        projectPath: trimmedPath,
        options: {
          mode,
          prompt: trimmedPrompt,
          model: trimmedModel,
          dangerouslySkipPermissions,
          allowDangerouslySkipPermissions,
        },
      });
      rememberPath(trimmedPath);
    } catch {
      return;
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={(event) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    }}>
      <div className="modal panel rise" role="dialog" aria-modal="true" aria-labelledby="launchModalTitle">
        <div className="modal-header">
          <div>
            <p className="section-kicker">LAUNCH</p>
            <h3 id="launchModalTitle">启动新的 cc-viewer 实例</h3>
          </div>
          <button className="icon-button" type="button" aria-label="关闭弹窗" onClick={onClose}>✕</button>
        </div>
        <p className="modal-copy">输入真实项目的绝对路径，并按需要带上 cc-viewer 启动参数。</p>
        <label className="path-field">
          <span>项目绝对路径</span>
          <input
            value={projectPath}
            onChange={(event) => setProjectPath(event.target.value)}
            type="text"
            placeholder="输入项目绝对路径"
          />
        </label>
        {recentPaths.length > 0 ? (
          <div className="recent-paths" aria-label="最近使用路径">
            <span className="input-hint">最近使用</span>
            <div className="recent-path-list">
              {recentPaths.map((path) => (
                <span className="recent-path-chip" key={path}>
                  <button type="button" onClick={() => setProjectPath(path)}>{path}</button>
                  <button type="button" aria-label={`移除最近路径 ${path}`} onClick={() => removeRecentPath(path)}>×</button>
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <div className="host-path-picker">
          <div className="host-path-picker-actions">
            <button className="button button-secondary" type="button" onClick={() => void openPathBrowser()}>
              选择宿主机路径
            </button>
            <span className="input-hint">仅显示服务端允许的项目根目录。</span>
          </div>
          {browserOpen ? (
            <div className="host-path-browser">
              <div className="host-path-roots" aria-label="常用根目录">
                {roots.map((root) => (
                  <button
                    className={`chip${root.path === currentPath ? ' active' : ''}`}
                    type="button"
                    key={root.path}
                    onClick={() => void loadPath(root.path)}
                  >
                    {root.path}
                  </button>
                ))}
              </div>
              <div className="host-path-current">
                <span className="mono-inline">{currentPath || '读取宿主机目录中…'}</span>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={!parentPath || isBrowsingPaths}
                  onClick={() => parentPath ? void loadPath(parentPath) : undefined}
                >
                  返回上级
                </button>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={!currentPath}
                  onClick={() => {
                    setProjectPath(currentPath);
                    rememberPath(currentPath);
                  }}
                >
                  使用此目录
                </button>
              </div>
              <label className="path-field host-path-search">
                <span>搜索当前目录</span>
                <input
                  value={pathSearch}
                  onChange={(event) => setPathSearch(event.target.value)}
                  type="text"
                  placeholder="输入目录名或路径"
                />
              </label>
              {pathBrowserError ? <p className="input-hint danger-text">{pathBrowserError}</p> : null}
              <div className="host-path-list" aria-label="宿主机目录列表">
                {filteredEntries.map((entry) => (
                  <div className="host-path-entry" key={entry.path}>
                    <button
                      className="host-path-entry-main"
                      type="button"
                      disabled={!entry.readable || isBrowsingPaths}
                      aria-label={`选择 ${entry.path}`}
                      onClick={() => {
                        setProjectPath(entry.path);
                        rememberPath(entry.path);
                      }}
                    >
                      <span>{entry.name}</span>
                      <span className="mono-inline">{entry.path}</span>
                    </button>
                    <button
                      className="host-path-entry-drill"
                      type="button"
                      disabled={!entry.readable || isBrowsingPaths}
                      aria-label={`进入 ${entry.path}`}
                      onClick={() => void loadPath(entry.path)}
                    >
                      进入
                    </button>
                  </div>
                ))}
                {entries.length > 0 && filteredEntries.length === 0 ? (
                  <p className="input-hint host-path-empty">当前目录没有匹配项</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <div className="launch-options-grid">
          <label className="path-field">
            <span>启动模式</span>
            <select value={mode} onChange={(event) => setMode(event.target.value as LaunchMode)}>
              <option value="default">普通启动</option>
              <option value="continue">继续最近会话 (-c)</option>
              <option value="resume">选择历史会话 (-r)</option>
            </select>
          </label>
          <label className="path-field">
            <span>模型</span>
            <input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              type="text"
              placeholder="例如 claude-sonnet-4-6"
            />
          </label>
        </div>
        <label className="path-field launch-prompt-field">
          <span>初始提示词 (-p)</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="可选，启动后直接发送给 Claude"
            rows={3}
          />
        </label>
        <div className="launch-toggle-stack" aria-label="权限参数">
          <label className="launch-toggle">
            <input
              type="checkbox"
              checked={dangerouslySkipPermissions}
              onChange={(event) => setDangerouslySkipPermissions(event.target.checked)}
            />
            <span>跳过权限确认 (--d)</span>
          </label>
          <label className="launch-toggle">
            <input
              type="checkbox"
              checked={allowDangerouslySkipPermissions}
              onChange={(event) => setAllowDangerouslySkipPermissions(event.target.checked)}
            />
            <span>允许跳过权限确认 (--ad)</span>
          </label>
        </div>
        {errorMessage ? (
          <div className="inline-error">
            <span className="status-led warm"></span>
            <p>{errorMessage}</p>
          </div>
        ) : null}
        <div className="modal-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>关闭</button>
          <button
            className="button button-primary"
            type="button"
            disabled={isSubmitting || !canSubmit}
            onClick={() => void submitLaunchRequest()}
          >
            {isSubmitting ? '启动中…' : '确认启动'}
          </button>
        </div>
      </div>
    </div>
  );
}
