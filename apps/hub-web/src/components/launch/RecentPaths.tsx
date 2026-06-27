/**
 * [INPUT]: 依赖 launch-dialog-utils 的路径压缩展示，依赖父级传入的最近路径数组与选择/移除回调
 * [OUTPUT]: 对外提供 RecentPaths 组件，渲染默认收敛、按需展开的最近项目路径列表
 * [POS]: components/launch 的启动路径快捷入口，被 LaunchDialog 放置在路径步骤首屏
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useState } from 'react';
import { compactPath, leafName } from './launch-dialog-utils.js';

type RecentPathsProps = {
  paths: string[];
  isMobile: boolean;
  onSelect: (path: string) => void;
  onRemove: (path: string) => void;
};

export default function RecentPaths({ paths, isMobile, onSelect, onRemove }: RecentPathsProps) {
  const [expanded, setExpanded] = useState(false);
  if (paths.length === 0) return null;

  const limit = isMobile ? 2 : 3;
  const visiblePaths = expanded ? paths : paths.slice(0, limit);
  const hiddenCount = Math.max(paths.length - visiblePaths.length, 0);

  return (
    <section className={`recent-paths${expanded ? ' expanded' : ''}`} aria-label="最近使用路径">
      <div className="recent-paths-head">
        <span className="input-hint">最近使用</span>
        {expanded ? <button className="text-button" type="button" onClick={() => setExpanded(false)}>收起</button> : null}
      </div>
      <div className="recent-path-list">
        {visiblePaths.map((path) => (
          <div className="recent-path-chip" key={path}>
            <button type="button" aria-label={path} title={path} onClick={() => onSelect(path)}>
              <strong>{leafName(path)}</strong>
              <span>{compactPath(path)}</span>
            </button>
            <button type="button" aria-label={`移除最近路径 ${path}`} onClick={() => onRemove(path)}>×</button>
          </div>
        ))}
        {!expanded && hiddenCount > 0 ? (
          <button className="recent-path-more" type="button" onClick={() => setExpanded(true)}>更多 {hiddenCount} 个</button>
        ) : null}
      </div>
    </section>
  );
}
