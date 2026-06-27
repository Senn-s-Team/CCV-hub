/**
 * [INPUT]: 依赖实例查询与启动 hooks，依赖 InstanceCard、LaunchDialog、Toast 组件、主题模式、退出动作与响应式工作台样式类名
 * [OUTPUT]: 对外提供 OverviewPage 页面，完成顶部工具条、紧凑摘要条、实例列表主体、按需状态抽屉、主题切换、启动弹窗、生命周期停止动作与 Toast 闭环
 * [POS]: hub-web 的唯一主页面，承接 ccv-hub MVP 的所有前端主路径能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useEffect, useMemo, useState } from 'react';
import type { CreateInstanceRequest, Instance } from '@ccv-hub/shared-contracts';
import type { ThemeMode } from '../App.js';
import { ApiClientError } from '../api/client.js';
import InstanceCard from '../components/InstanceCard.js';
import LaunchDialog from '../components/LaunchDialog.js';
import Toast from '../components/Toast.js';
import { useInstances } from '../hooks/useInstances.js';
import { useInstanceLifecycle } from '../hooks/useInstanceLifecycle.js';
import { useLaunchInstance } from '../hooks/useLaunchInstance.js';

type OverviewPageProps = {
  onLogout: () => Promise<void>;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
};

const themeCycle: ThemeMode[] = ['system', 'light', 'dark'];
const themeLabels: Record<ThemeMode, string> = {
  system: '自动',
  light: '浅色',
  dark: '深色',
};

function filterInstances(instances: Instance[], query: string): Instance[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return instances;
  }

  return instances.filter((instance) => [
    instance.projectName,
    instance.projectPath,
    instance.url,
    instance.source,
    instance.status,
    String(instance.port ?? ''),
  ].some((value) => value.toLowerCase().includes(normalized)));
}

function formatSyncTime(value: number): string {
  if (!value) {
    return '等待同步';
  }
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getNextThemeMode(mode: ThemeMode): ThemeMode {
  const index = themeCycle.indexOf(mode);
  return themeCycle[(index + 1) % themeCycle.length] ?? 'system';
}

export default function OverviewPage({ onLogout, themeMode, onThemeModeChange }: OverviewPageProps) {
  const [query, setQuery] = useState('');
  const [isModalOpen, setModalOpen] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [isStatusSheetOpen, setStatusSheetOpen] = useState(false);
  const instancesQuery = useInstances();
  const launchMutation = useLaunchInstance();
  const lifecycleMutation = useInstanceLifecycle();

  const instances = instancesQuery.data?.instances ?? [];
  const filteredInstances = useMemo(() => filterInstances(instances, query), [instances, query]);
  const hasFilterMiss = !instancesQuery.isLoading && !instancesQuery.isError && instances.length > 0 && filteredInstances.length === 0;
  const stageStateLabel = (() => {
    if (instancesQuery.isLoading) return 'loading';
    if (instancesQuery.isError) return 'discovery-error';
    if (instances.length === 0) return 'empty';
    return 'list-ready';
  })();

  useEffect(() => {
    function closeSheetWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setStatusSheetOpen(false);
      }
    }

    window.addEventListener('keydown', closeSheetWithEscape);
    return () => window.removeEventListener('keydown', closeSheetWithEscape);
  }, []);

  async function handleLaunch(request: CreateInstanceRequest) {
    try {
      await launchMutation.mutateAsync(request);
      setLaunchError('');
      setModalOpen(false);
      setToastMessage('实例已加入总览台');
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : error instanceof Error ? error.message : '启动失败';
      setLaunchError(message);
      throw error;
    }
  }

  function handleOpen(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleCopy(url: string) {
    await navigator.clipboard.writeText(url);
    setToastMessage(`已复制 ${url}`);
  }

  async function handleStop(id: string) {
    try {
      await lifecycleMutation.mutateAsync({ id, action: 'stop' });
      setToastMessage('实例已停止');
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : error instanceof Error ? error.message : '停止失败';
      setToastMessage(message);
    }
  }

  function openLaunchDialog() {
    setStatusSheetOpen(false);
    setModalOpen(true);
  }

  function cycleThemeMode() {
    onThemeModeChange(getNextThemeMode(themeMode));
  }

  function renderThemeControl(className: string) {
    const isSheetTheme = className.includes('sheet');
    return (
      <div className={`theme-control segmented-theme ${className}`} role="group" aria-label="颜色模式">
        {themeCycle.map((mode) => {
          const currentLabel = `切换颜色模式，当前${mode === 'system' ? '系统' : themeLabels[mode]}`;
          const nextLabel = `切换到${themeLabels[mode]}模式`;
          return (
            <button
              key={mode}
              className="theme-option"
              type="button"
              aria-pressed={themeMode === mode}
              aria-label={isSheetTheme ? `状态面板${themeMode === mode ? currentLabel : nextLabel}` : themeMode === mode ? currentLabel : nextLabel}
              onClick={() => (themeMode === mode ? cycleThemeMode() : onThemeModeChange(mode))}
            >
              {themeLabels[mode]}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <button
        className="mobile-rail-scrim"
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        hidden={!isStatusSheetOpen}
        onClick={() => setStatusSheetOpen(false)}
      ></button>

      <div className={`app-shell workbench-shell${isStatusSheetOpen ? ' status-sheet-open' : ''}`}>
        <header className="topbar panel rise" aria-label="全局工具条">
          <div className="topbar-brand" aria-label="CCV Hub">
            <span className="brand-mark" aria-hidden="true">⌘</span>
            <strong>CCV Hub</strong>
          </div>

          <label className="search-field topbar-search">
            <span className="visually-hidden">实例筛选</span>
            <input
              type="text"
              placeholder="搜项目名、路径、端口"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          {renderThemeControl('topbar-theme')}

          <div className="topbar-actions">
            <button className="button button-secondary compact-button refresh-button" type="button" onClick={() => void instancesQuery.refetch()}>
              刷新
            </button>
            <button className="button button-primary compact-button" type="button" onClick={openLaunchDialog}>
              启动
            </button>
            <button
              className="button button-secondary status-sheet-toggle"
              type="button"
              aria-controls="statusSheet"
              aria-expanded={isStatusSheetOpen}
              onClick={() => setStatusSheetOpen((isOpen) => !isOpen)}
            >
              状态
            </button>
          </div>
        </header>

        <section className="summary-strip panel" aria-label="实例摘要">
          <article className="summary-pill">
            <span>运行中</span>
            <strong>{instances.length}</strong>
          </article>
          <article className="summary-pill">
            <span>可见</span>
            <strong>{filteredInstances.length}</strong>
          </article>
          <article className="summary-pill">
            <span>同步</span>
            <strong>{formatSyncTime(instancesQuery.dataUpdatedAt)}</strong>
          </article>
          <article className="summary-pill agent-pill">
            <span className="status-led live" aria-hidden="true"></span>
            <strong>Agent 已连接</strong>
          </article>
        </section>

        <main className="workbench" aria-label="实例列表工作区">
          <section className={`instance-stage panel sunken${!instancesQuery.isLoading && !instancesQuery.isError && (instances.length === 0 || hasFilterMiss) ? ' empty-stage' : ''}`} aria-labelledby="instanceStageTitle">
            <div className="stage-header compact-stage-header">
              <div>
                <span className="section-kicker">viewer entries</span>
                <h1 id="instanceStageTitle">实例列表</h1>
              </div>
              <span className="visually-hidden">{stageStateLabel}</span>
            </div>

            <div className="stage-content">
              {instancesQuery.isLoading ? (
                <section className="state-pane active" aria-label="loading">
                  <div className="skeleton-stack">
                    <div className="skeleton-card"></div>
                    <div className="skeleton-card"></div>
                    <div className="skeleton-card"></div>
                  </div>
                </section>
              ) : null}

              {instancesQuery.isError ? (
                <section className="state-pane active">
                  <div className="status-banner error">
                    <span className="status-led" aria-hidden="true"></span>
                    <div>
                      <strong>实例读取出现异常</strong>
                      <p>{instancesQuery.error instanceof Error ? instancesQuery.error.message : '刷新后重试'}</p>
                    </div>
                    <button className="button button-secondary slim" type="button" onClick={() => void instancesQuery.refetch()}>
                      再次刷新
                    </button>
                  </div>
                  {instances.length > 0 ? (
                    <div className="instance-list dimmed">
                      {filteredInstances.map((instance) => (
                        <InstanceCard
                          key={instance.id}
                          instance={instance}
                          onOpen={handleOpen}
                          onCopy={(url) => void handleCopy(url)}
                          onStop={(id) => void handleStop(id)}
                          isStopping={lifecycleMutation.isPending && lifecycleMutation.variables?.id === instance.id}
                        />
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {!instancesQuery.isLoading && !instancesQuery.isError && instances.length === 0 ? (
                <section className="state-pane active">
                  <div className="empty-state-card compact-empty">
                    <h3>暂无运行实例</h3>
                    <p>点击顶部“启动”，选择项目路径后创建新的 cc-viewer 工作区。</p>
                  </div>
                </section>
              ) : null}

              {hasFilterMiss ? (
                <section className="state-pane active">
                  <div className="empty-state-card compact-empty">
                    <h3>没有匹配结果</h3>
                    <p>试试项目名、路径、端口或来源关键字。</p>
                    <button className="button button-secondary inline-launch" type="button" onClick={() => setQuery('')}>
                      清空筛选
                    </button>
                  </div>
                </section>
              ) : null}

              {!instancesQuery.isLoading && !instancesQuery.isError && instances.length > 0 && filteredInstances.length > 0 ? (
                <section className="state-pane active">
                  <div className="instance-list">
                    {filteredInstances.map((instance) => (
                      <InstanceCard
                        key={instance.id}
                        instance={instance}
                        onOpen={handleOpen}
                        onCopy={(url) => void handleCopy(url)}
                        onStop={(id) => void handleStop(id)}
                        isStopping={lifecycleMutation.isPending && lifecycleMutation.variables?.id === instance.id}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </section>
        </main>

        <aside className="status-sheet panel rise" id="statusSheet" aria-label="状态与设置">
          <div className="sheet-grip" aria-hidden="true"></div>
          <div className="status-sheet-header">
            <div>
              <span className="section-kicker">status</span>
              <h2>状态与设置</h2>
            </div>
            <button className="icon-button" type="button" aria-label="关闭状态菜单" onClick={() => setStatusSheetOpen(false)}>
              ×
            </button>
          </div>

          <section className="status-card compact-panel" aria-label="宿主机 Agent">
            <div className="status-card-title">
              <span className="section-kicker">host agent</span>
              <span className="status-led live" aria-hidden="true"></span>
            </div>
            <strong>已连接</strong>
            <p>实例轮询、启动请求与 /viewer/* path bridge 保持运行。</p>
          </section>

          <section className="compact-panel mobile-theme-panel" aria-label="主题设置">
            <span className="section-kicker">theme</span>
            {renderThemeControl('sheet-theme')}
          </section>

          <section className="compact-panel" aria-label="当前边界">
            <span className="section-kicker">boundary</span>
            <ul className="boundary-list">
              <li>只展示 running 实例</li>
              <li>Viewer 走 /viewer/* 稳定入口</li>
              <li>启动路径由 Agent allowlist 控制</li>
            </ul>
          </section>

          <div className="sheet-actions">
            <button className="button button-secondary" type="button" onClick={() => void onLogout()}>
              退出
            </button>
          </div>
        </aside>
      </div>

      <LaunchDialog
        isOpen={isModalOpen}
        isSubmitting={launchMutation.isPending}
        errorMessage={launchError}
        onClose={() => {
          setModalOpen(false);
          setLaunchError('');
        }}
        onSubmit={handleLaunch}
      />
      <Toast message={toastMessage} />
    </>
  );
}
