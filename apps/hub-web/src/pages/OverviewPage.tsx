/**
 * [INPUT]: 依赖实例查询与启动 hooks，依赖 InstanceCard、LaunchDialog、Toast 组件、主题模式、退出动作与工作台样式类名
 * [OUTPUT]: 对外提供 OverviewPage 页面，完成紧凑总览、项目筛选、主题切换、状态、启动弹窗、退出入口闭环
 * [POS]: hub-web 的唯一主页面，承接 ccv-hub MVP 的所有前端主路径能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useMemo, useState } from 'react';
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

const themeOptions: Array<{ mode: ThemeMode; label: string }> = [
  { mode: 'system', label: '系统' },
  { mode: 'light', label: '浅色' },
  { mode: 'dark', label: '深色' },
];

function filterInstances(instances: Instance[], query: string): Instance[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return instances;
  }
  return instances.filter((instance) => instance.projectName.toLowerCase().includes(normalized));
}

export default function OverviewPage({ onLogout, themeMode, onThemeModeChange }: OverviewPageProps) {
  const [query, setQuery] = useState('');
  const [isModalOpen, setModalOpen] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
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

  return (
    <>
      <div className="app-shell">
        <header className="app-header panel rise">
          <div className="header-copy">
            <h1>运行实例</h1>
            <p className="subtitle">查看、筛选、打开和启动本机 cc-viewer 实例。</p>
          </div>

          <div className="header-actions">
            <div className="theme-control" aria-label="主题模式">
              {themeOptions.map((option) => (
                <button
                  key={option.mode}
                  className="theme-option"
                  type="button"
                  aria-pressed={themeMode === option.mode}
                  onClick={() => onThemeModeChange(option.mode)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button className="button button-secondary" type="button" onClick={() => void onLogout()}>
              退出
            </button>
            <button className="button button-secondary" type="button" onClick={() => void instancesQuery.refetch()}>
              刷新列表
            </button>
            <button className="button button-primary" type="button" onClick={() => setModalOpen(true)}>
              启动新实例
            </button>
          </div>
        </header>

        <main className="workbench">
          <section className="toolbar panel">
            <label className="search-field toolbar-search">
              <span>项目筛选</span>
              <input
                type="text"
                placeholder="例如：viewer / sdk / mobile"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="toolbar-stats" aria-label="实例状态摘要">
              <span className="stat-item"><strong>{instances.length}</strong> 在线</span>
              <span className="stat-item"><strong>{filteredInstances.length}</strong> 可见</span>
              <span className="state-badge neutral">{stageStateLabel}</span>
            </div>
          </section>

          <section className="instance-stage panel sunken" aria-labelledby="instanceStageTitle">
            <div className="stage-header">
              <div>
                <h2 id="instanceStageTitle">实例工作面</h2>
                <p className="stage-meta-text">项目名、状态、访问入口和动作集中在同一视野。</p>
              </div>
              <span className="stage-state">{stageStateLabel}</span>
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
                    <button className="button button-primary inline-launch" type="button" onClick={() => setModalOpen(true)}>
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
