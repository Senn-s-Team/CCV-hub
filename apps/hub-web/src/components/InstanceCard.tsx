/**
 * [INPUT]: 依赖 shared-contracts 的 Instance 类型，依赖父级传入的打开、复制与停止动作
 * [OUTPUT]: 对外提供 InstanceCard 组件，渲染实例主信息、技术信息与可用生命周期动作层
 * [POS]: hub-web 的核心列表单元，承接 prototype 卡片层级并映射真实实例数据与公网 bridge URL
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

function formatStartedAt(value: string): string {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function InstanceCard({ instance, onOpen, onCopy, onStop, isStopping }: InstanceCardProps) {
  return (
    <article className="instance-card">
      <div className="card-top">
        <div className="card-title-block">
          <h3 className="card-title">{instance.projectName}</h3>
          <div className="card-tags">
            <span className="state-badge running">{instance.status}</span>
            <span className="meta-badge">{instance.source}</span>
          </div>
        </div>
        <div className="card-health">
          <span className="status-led live"></span>
          <div>
            <strong>实例在线</strong>
            <p>最近确认 {formatStartedAt(instance.lastSeen)}</p>
          </div>
        </div>
      </div>

      <div className="meta-grid">
        <div className="meta-row">
          <span className="meta-label">project path</span>
          <span className="meta-value mono-inline">{instance.projectPath}</span>
        </div>
        <div className="meta-row">
          <span className="meta-label">public url</span>
          <span className="meta-value mono-inline">{instance.url}</span>
        </div>
      </div>

      <div className="card-bottom">
        <div className="action-row">
          <button className="instance-action" type="button" onClick={() => onOpen(instance.url)}>
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
        <span className="mono-inline">started {formatStartedAt(instance.startedAt)}</span>
      </div>
    </article>
  );
}
