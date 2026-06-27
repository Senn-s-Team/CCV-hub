/**
 * [INPUT]: 依赖实例查询与启动 hooks，依赖 InstanceCard、LaunchDialog、Toast 组件、主题模式、退出动作与响应式工作台样式类名
 * [OUTPUT]: 对外提供 OverviewPage 页面，完成左侧状态驾驶舱、右侧实例列表、移动端状态抽屉、抽象主题切换、浮动启动入口与 Toast 闭环
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
  system: '系统',
  light: '浅色',
  dark: '深色',
};

function filterInstances(instances: Instance[], query: string): Instance[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return instances;
  }
  return instances.filter((instance) => instance.projectName.toLowerCase().includes(normalized));
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
  const [isStatusRailOpen, setStatusRailOpen] = useState(false);
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
    function closeRailWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setStatusRailOpen(false);
      }
    }

    window.addEventListener('keydown', closeRailWithEscape);
    return () => window.removeEventListener('keydown', closeRailWithEscape);
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
    setStatusRailOpen(false);
    setModalOpen(true);
  }

  function cycleThemeMode() {
    onThemeModeChange(getNextThemeMode(themeMode));
  }

  return (
    <>
      <button
        className="theme-art-button"
        type="button"
        aria-label={`切换颜色模式，当前${themeLabels[themeMode]}`}
        title={`当前${themeLabels[themeMode]}模式`}
        onClick={cycleThemeMode}
      >
        <span className="theme-art-shape shape-one" aria-hidden="true"></span>
        <span className="theme-art-shape shape-two" aria-hidden="true"></span>
        <span className="theme-art-shape shape-three" aria-hidden="true"></span>
      </button>
      <button
        className="mobile-rail-toggle"
        type="button"
        aria-controls="statusRail"
        aria-expanded={isStatusRailOpen}
        onClick={() => setStatusRailOpen((isOpen) => !isOpen)}
      >
        状态
      </button>
      <button
        className="mobile-rail-scrim"
        type="button"
        aria-label="关闭状态菜单"
        hidden={!isStatusRailOpen}
        onClick={() => setStatusRailOpen(false)}
      ></button>

      <div className={`app-shell${isStatusRailOpen ? ' status-rail-open' : ''}`}>
        <aside className="status-rail" id="statusRail" aria-label="实例状态信息">
          <section className="brand-card panel rise" aria-label="Hub 标识">
            <div>
              <strong>Hub</strong>
              <span>local viewer console</span>
            </div>
          </section>

          <section className="status-command panel rise" aria-label="当前总览状态">
            <span className="section-kicker">status center</span>
            <div className="status-command-headline">
              <span className={`state-badge ${instancesQuery.isError ? 'error' : instancesQuery.isLoading ? 'neutral' : 'running'}`}>{stageStateLabel}</span>
              <strong>{instances.length}</strong>
            </div>
            <p>{instances.length} 个运行实例，{filteredInstances.length} 个当前可见。</p>
            <div className="sync-row">
              <span>同步</span>
              <strong>{formatSyncTime(instancesQuery.dataUpdatedAt)}</strong>
            </div>
          </section>

          <section className="status-card panel" aria-label="宿主机 Agent">
            <div className="status-card-title">
              <span className="section-kicker">host agent</span>
              <span className="status-led live" aria-hidden="true"></span>
            </div>
            <strong>已连接</strong>
            <p>实例列表轮询与 viewer path bridge 保持运行。</p>
          </section>

          <section className="rail-summary panel" aria-label="实例状态摘要">
            <article className="summary-card">
              <span className="section-kicker">在线实例</span>
              <strong>{instances.length}</strong>
              <small>按启动时间降序</small>
            </article>
            <article className="summary-card">
              <span className="section-kicker">可见结果</span>
              <strong>{filteredInstances.length}</strong>
              <small>项目名即时筛选</small>
            </article>
            <article className="summary-card accent-summary">
              <span className="section-kicker">稳定入口</span>
              <strong>/viewer/*</strong>
              <small>同 host path bridge</small>
            </article>
          </section>

          <section className="status-card panel" aria-label="当前边界">
            <span className="section-kicker">boundary</span>
            <ul className="boundary-list">
              <li>只展示 running 实例</li>
              <li>Viewer 走 /viewer/* 稳定入口</li>
              <li>启动路径由 Agent allowlist 控制</li>
            </ul>
          </section>

          <div className="rail-actions panel" aria-label="全局动作">
            <button className="button button-secondary" type="button" onClick={() => void instancesQuery.refetch()}>
              刷新列表
            </button>
            <button className="button button-secondary" type="button" onClick={() => void onLogout()}>
              退出
            </button>
          </div>
        </aside>

        <main className="workbench" aria-label="实例列表工作区">
          <header className="app-header panel rise">
            <div className="header-copy">
              <span className="section-kicker">running instances</span>
              <h1>在线实例</h1>
              <p className="subtitle">右侧工作区只处理实例发现、筛选、打开和复制，状态决策全部沉到左侧。</p>
            </div>
          </header>

          <section className="toolbar panel" aria-label="筛选实例">
            <label className="search-field toolbar-search">
              <span>项目筛选</span>
              <input
                type="text"
                placeholder="例如：viewer / sdk / mobile"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </section>

          <section className="instance-stage panel sunken" aria-labelledby="instanceStageTitle">
            <div className="stage-header">
              <div>
                <span className="section-kicker">viewer entries</span>
                <h2 id="instanceStageTitle">实例列表</h2>
              </div>
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
                    <div className="card-grid dimmed">
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
                  <div className="empty-state-card">
                    <span className="state-flag neutral">empty</span>
                    <h3>当前还没有运行中的实例</h3>
                    <p>直接启动一个新的 cc-viewer 工作区，列表会在刷新后回到这里。</p>
                    <button className="button button-primary inline-launch" type="button" onClick={openLaunchDialog}>
                      启动新实例
                    </button>
                  </div>
                </section>
              ) : null}

              {hasFilterMiss ? (
                <section className="state-pane active">
                  <div className="empty-state-card compact-empty">
                    <span className="state-flag neutral">list-ready</span>
                    <h3>没有匹配项目名的运行实例</h3>
                    <p>清空筛选后查看当前所有运行实例。</p>
                    <button className="button button-secondary inline-launch" type="button" onClick={() => setQuery('')}>
                      清空筛选
                    </button>
                  </div>
                </section>
              ) : null}

              {!instancesQuery.isLoading && !instancesQuery.isError && instances.length > 0 && filteredInstances.length > 0 ? (
                <section className="state-pane active">
                  <div className="card-grid">
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
      </div>

      <button className="floating-launch" type="button" aria-label="启动新实例" onClick={openLaunchDialog}>
        <span aria-hidden="true">＋</span>
        <strong>启动</strong>
      </button>

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
