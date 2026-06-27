/**
 * [INPUT]: 依赖 shared-contracts 的 HostPathEntry，依赖 LaunchPathPicker、RecentPaths 与父级传入的路径状态和回调
 * [OUTPUT]: 对外提供 LaunchPathStep 组件，按浏览宿主机目录、最近路径、粘贴绝对路径的优先级渲染路径页
 * [POS]: components/launch 的路径选择步骤，被 LaunchDialog 作为两段式启动向导的第一段
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { HostPathEntry } from '@ccv-hub/shared-contracts';
import LaunchPathPicker, { type PathColumn } from './LaunchPathPicker.js';
import RecentPaths from './RecentPaths.js';

type LaunchPathStepProps = {
  projectPath: string;
  manualPathOpen: boolean;
  pathFieldError: string;
  recentPaths: string[];
  roots: HostPathEntry[];
  columns: PathColumn[];
  activePath: string;
  isBrowsingPaths: boolean;
  pathBrowserError: string;
  pathSearch: string;
  browserOpen: boolean;
  isMobileSheet: boolean;
  onManualPathOpenChange: (open: boolean) => void;
  onManualPathChange: (path: string) => void;
  onSelectRecent: (path: string) => void;
  onRemoveRecent: (path: string) => void;
  onOpenBrowser: () => void;
  onPathSearchChange: (search: string) => void;
  onLoadRoot: (path: string) => void;
  onLoadParent: (path: string) => void;
  onSelectCurrent: () => void;
  onChooseEntry: (entry: HostPathEntry) => void;
  onEnterEntry: (entry: HostPathEntry, columnIndex: number) => void;
};

export default function LaunchPathStep({ projectPath, manualPathOpen, pathFieldError, recentPaths, roots, columns, activePath, isBrowsingPaths, pathBrowserError, pathSearch, browserOpen, isMobileSheet, onManualPathOpenChange, onManualPathChange, onSelectRecent, onRemoveRecent, onOpenBrowser, onPathSearchChange, onLoadRoot, onLoadParent, onSelectCurrent, onChooseEntry, onEnterEntry }: LaunchPathStepProps) {
  return (
    <section className="launch-path-panel launch-panel" aria-label="项目路径面板">
      <div className="launch-panel-header">
        <span className="section-kicker">workspace</span>
        <h4>选择项目</h4>
        <p className="modal-copy">优先浏览宿主机目录；最近路径是快捷入口，粘贴路径用于恢复与专家场景。</p>
      </div>

      <div className="host-path-picker">
        <div className="host-path-picker-actions">
          <button className="button button-secondary" type="button" onClick={onOpenBrowser}>
            浏览宿主机目录
          </button>
          <span className="input-hint">仅显示服务端允许的项目根目录。</span>
        </div>

        {browserOpen ? (
          <LaunchPathPicker
            roots={roots}
            columns={columns}
            activePath={activePath}
            isBrowsing={isBrowsingPaths}
            error={pathBrowserError}
            search={pathSearch}
            isMobile={isMobileSheet}
            onSearchChange={onPathSearchChange}
            onLoadRoot={onLoadRoot}
            onLoadParent={onLoadParent}
            onSelectCurrent={onSelectCurrent}
            onChooseEntry={onChooseEntry}
            onEnterEntry={onEnterEntry}
          />
        ) : null}
      </div>

      <RecentPaths paths={recentPaths} isMobile={isMobileSheet} onSelect={onSelectRecent} onRemove={onRemoveRecent} />

      <details className="manual-path-entry" open={manualPathOpen} onToggle={(event) => onManualPathOpenChange(event.currentTarget.open)}>
        <summary>
          <span>粘贴绝对路径</span>
          <span className="input-hint">专家入口，用于粘贴完整路径或修复路径错误</span>
        </summary>
        <label className={`path-field${pathFieldError ? ' has-error' : ''}`}>
          <span>项目绝对路径</span>
          <input
            autoFocus={manualPathOpen}
            value={projectPath}
            onChange={(event) => onManualPathChange(event.target.value)}
            type="text"
            placeholder="粘贴项目绝对路径"
            aria-invalid={pathFieldError ? 'true' : 'false'}
            aria-describedby={pathFieldError ? 'launchPathError' : undefined}
          />
          {pathFieldError ? <em id="launchPathError" className="field-error">{pathFieldError}</em> : null}
        </label>
      </details>
    </section>
  );
}
