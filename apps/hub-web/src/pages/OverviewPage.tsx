/**
 * [INPUT]: 依赖实例查询与启动 hooks，依赖 InstanceCard、LaunchDialog、Toast 组件、退出动作与原型样式类名
 * [OUTPUT]: 对外提供 OverviewPage 页面，完成总览、筛选、状态、启动弹窗、退出入口闭环
 * [POS]: hub-web 的唯一主页面，承接 ccv-hub MVP 的所有前端主路径能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useMemo, useState } from 'react';
import type { Instance } from '@ccv-hub/shared-contracts';
import { ApiClientError } from '../api/client.js';
import InstanceCard from '../components/InstanceCard.js';
import LaunchDialog from '../components/LaunchDialog.js';
import Toast from '../components/Toast.js';
import { useInstances } from '../hooks/useInstances.js';
import { useLaunchInstance } from '../hooks/useLaunchInstance.js';

type OverviewPageProps = {
  onLogout: () => Promise<void>;
};

function filterInstances(instances: Instance[], query: string): Instance[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return instances;
  }
  return instances.filter((instance) => instance.projectName.toLowerCase().includes(normalized));
}

export default function OverviewPage({ onLogout }: OverviewPageProps) {
  const [query, setQuery] = useState('');
  const [isModalOpen, setModalOpen] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const instancesQuery = useInstances();
  const launchMutation = useLaunchInstance();

  const instances = instancesQuery.data?.instances ?? [];
  const filteredInstances = useMemo(() => filterInstances(instances, query), [instances, query]);
  const attentionCount = instancesQuery.isError || launchError ? 1 : 0;

  const stageStateLabel = (() => {
    if (instancesQuery.isLoading) return 'loading';
    if (instancesQuery.isError) return 'discovery-error';
    if (instances.length === 0) return 'empty';
    return 'list-ready';
  })();

  async function handleLaunch(projectPath: string) {
    try {
      await launchMutation.mutateAsync(projectPath);
      setLaunchError('');
      setModalOpen(false);
      setToastMessage('实例已加入总览台');
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : error instanceof Error ? error.message : '启动失败';
      setLaunchError(message);
    }
  }

  function handleOpen(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleCopy(url: string) {
    await navigator.clipboard.writeText(url);
    setToastMessage(`已复制 ${url}`);
  }

  return (
    <>
      <div className="app-shell">
        <header className="topbar panel rise">
          <div className="brand-block">
            <p className="eyebrow">CCV HUB / LOCAL CONTROL SURFACE</p>
            <div className="title-row">
              <div>
                <h1>本机实例总览台</h1>
                <p className="subtitle">把分散的 cc-viewer 入口收拢成一个低摩擦工作面。</p>
              </div>
              <div className="heartbeat-card">
                <span className="heartbeat-label">运行视野</span>
                <strong>{String(filteredInstances.length).padStart(2, '0')}</strong>
                <span className="heartbeat-meta">instances live</span>
              </div>
            </div>
          </div>

          <div className="topbar-actions">
            <button className="button button-secondary" type="button" onClick={() => void onLogout()}>
              退出
            </button>
            <button className="button button-secondary" type="button" onClick={() => void instancesQuery.refetch()}>
              <span className="button-icon">⟳</span>
              刷新列表
            </button>
            <button className="button button-primary" type="button" onClick={() => setModalOpen(true)}>
              <span className="button-icon">＋</span>
              启动新实例
            </button>
          </div>
        </header>

        <main className="workspace-grid">
          <aside className="control-rail panel rise">
            <section className="rail-section">
              <div className="section-heading">
                <span className="section-kicker">ORIENT</span>
                <h2>工作台节律</h2>
              </div>
              <div className="signal-stack">
                <article className="signal-card active">
                  <span className="signal-label">在线实例</span>
                  <strong>{String(instances.length).padStart(2, '0')}</strong>
                  <small>当前可直接进入</small>
                </article>
                <article className="signal-card warning">
                  <span className="signal-label">需关注</span>
                  <strong>{String(attentionCount).padStart(2, '0')}</strong>
                  <small>错误与失败会回到当前语境</small>
                </article>
              </div>
            </section>

            <section className="rail-section">
              <div className="section-heading">
                <span className="section-kicker">FILTER</span>
                <h2>项目筛选</h2>
              </div>
              <label className="search-field">
                <span>项目名关键字</span>
                <input
                  type="text"
                  placeholder="例如：viewer / sdk / mobile"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </section>
          </aside>

          <section className="main-stage">
            <div className="stage-header">
              <div>
                <p className="stage-kicker">SHOW STATUS</p>
                <h2>实例工作面</h2>
              </div>
              <div className="stage-meta">
                <span>{stageStateLabel}</span>
                <span className="dot-sep"></span>
                <span>{`${filteredInstances.length} 个实例`}</span>
              </div>
            </div>

            <div className="preview-frame desktop">
              <div className="board-shell panel sunken">
                <div className="board-header">
                  <div>
                    <p className="board-title">运行实例</p>
                    <p className="board-subtitle">项目名、状态、路径、链接与动作在同一视野完成闭环。</p>
                  </div>
                  <div className="board-badge">Warm industrial / utility first</div>
                </div>

                <div className="board-content">
                  {instancesQuery.isLoading ? (
                    <section className="state-pane active">
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
                        <span className="status-led"></span>
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
                            />
                          ))}
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {!instancesQuery.isLoading && !instancesQuery.isError && instances.length === 0 ? (
                    <section className="state-pane active">
                      <div className="empty-state-card">
                        <span className="state-flag neutral">EMPTY</span>
                        <h3>当前还没有运行中的实例</h3>
                        <p>下一步动作保持清晰，直接从这里启动一个新的 cc-viewer 工作区。</p>
                        <button className="button button-primary inline-launch" type="button" onClick={() => setModalOpen(true)}>
                          启动新实例
                        </button>
                      </div>
                    </section>
                  ) : null}

                  {!instancesQuery.isLoading && !instancesQuery.isError && instances.length > 0 ? (
                    <section className="state-pane active">
                      <div className="card-grid">
                        {filteredInstances.map((instance) => (
                          <InstanceCard
                            key={instance.id}
                            instance={instance}
                            onOpen={handleOpen}
                            onCopy={(url) => void handleCopy(url)}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              </div>
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
