/**
 * [INPUT]: 依赖 shared-contracts 的 Instance 类型，依赖父级传入的打开、复制与停止动作
 * [OUTPUT]: 对外提供 InstanceCard 组件，渲染桌面行式与移动卡片同构的实例主信息、稳定访问入口与生命周期动作
 * [POS]: hub-web 的核心列表单元，承接紧凑工作台列表层级并映射真实实例数据与稳定 viewer path URL
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { Instance } from '@ccv-hub/shared-contracts';

type InstanceCardProps = {
  instance: Instance;
  onOpen: (url: string) => void;
  onCopy: (url: string) => void;
  onStop: (id: string) => void;
  isStopping: boolean;
};

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function InstanceCard({ instance, onOpen, onCopy, onStop, isStopping }: InstanceCardProps) {
  return (
    <article className="instance-card instance-row-card">
      <div className="instance-main-cell">
        <div className="project-initial" aria-hidden="true">{instance.projectName.slice(0, 1).toUpperCase()}</div>
        <div className="card-title-block">
          <h3 className="card-title">{instance.projectName}</h3>
          <div className="card-tags">
            <span className="state-badge running">{instance.status}</span>
            <span className="meta-badge">{instance.source}</span>
          </div>
        </div>
      </div>

      <div className="instance-path-cell">
        <span className="meta-label">项目路径</span>
        <span className="meta-value mono-inline truncate-line" title={instance.projectPath}>{instance.projectPath}</span>
      </div>

      <div className="instance-url-cell">
        <span className="meta-label">访问入口</span>
        <span className="meta-value mono-inline truncate-line" title={instance.url}>{instance.url}</span>
      </div>

      <div className="instance-time-cell">
        <span>
          <span className="meta-label">最近心跳</span>
          <strong>{formatTime(instance.lastSeen)}</strong>
        </span>
        <span>
          <span className="meta-label">启动时间</span>
          <strong>{formatTime(instance.startedAt)}</strong>
        </span>
      </div>

      <div className="action-row instance-actions">
        <button className="instance-action primary" type="button" onClick={() => onOpen(instance.url)}>
          打开
        </button>
        <button className="instance-action" type="button" onClick={() => onCopy(instance.url)}>
          复制链接
        </button>
        {instance.canStop ? (
          <button className="instance-action danger" type="button" disabled={isStopping} onClick={() => onStop(instance.id)}>
            {isStopping ? '停止中' : '停止'}
          </button>
        ) : null}
      </div>
    </article>
  );
}
