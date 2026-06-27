/**
 * [INPUT]: 依赖 shared-contracts 的 HostPathEntry 类型，依赖 launch-dialog-utils 的路径展示派生函数，依赖父级传入的目录列状态与路径操作回调
 * [OUTPUT]: 对外提供 LaunchPathPicker 组件、PathColumn 与 LoadPathPlacement 类型，渲染桌面 Finder column 与移动端 drill-in 宿主机路径选择器
 * [POS]: components 的启动路径浏览器，被 LaunchDialog 用作路径状态机的展示层
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { HostPathEntry } from '@ccv-hub/shared-contracts';
import { compactPath, leafName, pathCrumbs } from './launch-dialog-utils.js';

export type PathColumn = {
  currentPath: string;
  parentPath: string | null;
  entries: HostPathEntry[];
  selectedPath: string;
};

export type LoadPathPlacement = {
  replace?: boolean;
  afterColumn?: number;
};

type LaunchPathPickerProps = {
  roots: HostPathEntry[];
  columns: PathColumn[];
  activePath: string;
  isBrowsing: boolean;
  error: string;
  search: string;
  isMobile: boolean;
  onSearchChange: (search: string) => void;
  onLoadRoot: (path: string) => void;
  onLoadParent: (path: string) => void;
  onSelectCurrent: () => void;
  onChooseEntry: (entry: HostPathEntry) => void;
  onEnterEntry: (entry: HostPathEntry, columnIndex: number) => void;
};

export function pathColumnFrom(currentPath: string, parentPath: string | null, entries: HostPathEntry[]): PathColumn {
  return { currentPath, parentPath, entries, selectedPath: '' };
}

export default function LaunchPathPicker(props: LaunchPathPickerProps) {
  return (
    <div className="host-path-browser">
      <div className="host-path-roots" aria-label="常用根目录">
        {props.roots.map((root) => (
          <button
            className={`chip${props.activePath === root.path || props.activePath.startsWith(`${root.path}/`) ? ' active' : ''}`}
            type="button"
            key={root.path}
            onClick={() => props.onLoadRoot(root.path)}
          >
            {root.path}
          </button>
        ))}
      </div>
      {props.isMobile ? <MobileDrillInPathPicker {...props} /> : <ColumnPathPicker {...props} />}
    </div>
  );
}

function PathBrowserToolbar({ activePath, activeColumn, isBrowsing, search, isMobile, onSearchChange, onLoadParent, onSelectCurrent }: {
  activePath: string;
  activeColumn: PathColumn | undefined;
  isBrowsing: boolean;
  search: string;
  isMobile: boolean;
  onSearchChange: (search: string) => void;
  onLoadParent: (path: string) => void;
  onSelectCurrent: () => void;
}) {
  return (
    <div className="host-path-toolbar">
      <div className="host-path-current">
        <strong>{activePath ? leafName(activePath) : '读取宿主机目录中…'}</strong>
        {activePath ? <span className="mono-inline">{activePath}</span> : null}
      </div>
      <div className="host-path-toolbar-actions">
        <button
          className="button button-secondary"
          type="button"
          disabled={!activeColumn?.parentPath || isBrowsing}
          onClick={() => activeColumn?.parentPath ? onLoadParent(activeColumn.parentPath) : undefined}
        >
          返回上级
        </button>
        {isMobile ? null : (
          <button className="button button-primary" type="button" disabled={!activePath} onClick={onSelectCurrent}>
            使用此目录
          </button>
        )}
      </div>
      <label className="path-field host-path-search">
        <span>搜索当前目录</span>
        <input value={search} onChange={(event) => onSearchChange(event.target.value)} type="text" placeholder="输入目录名或路径" />
      </label>
    </div>
  );
}

function filteredColumnEntries(column: PathColumn | undefined, search: string): HostPathEntry[] {
  if (!column) return [];
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) return column.entries;
  return column.entries.filter((entry) => `${entry.name} ${entry.path}`.toLowerCase().includes(normalizedSearch));
}

function ColumnPathPicker(props: LaunchPathPickerProps) {
  const activeColumn = props.columns.at(-1);
  return (
    <>
      <PathBrowserToolbar
        activePath={props.activePath}
        activeColumn={activeColumn}
        isBrowsing={props.isBrowsing}
        search={props.search}
        isMobile={false}
        onSearchChange={props.onSearchChange}
        onLoadParent={props.onLoadParent}
        onSelectCurrent={props.onSelectCurrent}
      />
      {props.error ? <p className="input-hint danger-text">{props.error}</p> : null}
      <div className="host-path-columns" aria-label="宿主机目录列表">
        {props.columns.map((column, columnIndex) => {
          const entries = columnIndex === props.columns.length - 1 ? filteredColumnEntries(column, props.search) : column.entries;
          return (
            <section className="host-path-column" aria-label={column.currentPath} key={column.currentPath}>
              <div className="host-path-column-head">
                <strong>{leafName(column.currentPath)}</strong>
                <span className="mono-inline">{compactPath(column.currentPath)}</span>
              </div>
              <PathEntryList
                entries={entries}
                selectedPath={column.selectedPath}
                isBrowsing={props.isBrowsing}
                emptyText={column.entries.length > 0 && entries.length === 0 ? '当前目录没有匹配项' : '当前目录为空'}
                columnIndex={columnIndex}
                mode="desktop"
                onChooseEntry={props.onChooseEntry}
                onEnterEntry={props.onEnterEntry}
              />
            </section>
          );
        })}
      </div>
    </>
  );
}

function MobileDrillInPathPicker(props: LaunchPathPickerProps) {
  const activeColumn = props.columns.at(-1);
  const entries = filteredColumnEntries(activeColumn, props.search);
  return (
    <>
      <div className="host-path-crumbs" aria-label="路径层级">
        {pathCrumbs(props.activePath).map((crumb) => (
          <button className="chip" type="button" key={crumb.path} onClick={() => props.onLoadRoot(crumb.path)}>{crumb.label}</button>
        ))}
      </div>
      <PathBrowserToolbar
        activePath={props.activePath}
        activeColumn={activeColumn}
        isBrowsing={props.isBrowsing}
        search={props.search}
        isMobile
        onSearchChange={props.onSearchChange}
        onLoadParent={props.onLoadParent}
        onSelectCurrent={props.onSelectCurrent}
      />
      {props.error ? <p className="input-hint danger-text">{props.error}</p> : null}
      <div className="host-path-list" aria-label="宿主机目录列表">
        <PathEntryList
          entries={entries}
          selectedPath=""
          isBrowsing={props.isBrowsing}
          emptyText={activeColumn?.entries.length && entries.length === 0 ? '当前目录没有匹配项' : '当前目录为空'}
          columnIndex={Math.max(props.columns.length - 1, 0)}
          mode="mobile"
          onChooseEntry={props.onChooseEntry}
          onEnterEntry={props.onEnterEntry}
        />
      </div>
    </>
  );
}

type PathEntryListProps = {
  entries: HostPathEntry[];
  selectedPath: string;
  isBrowsing: boolean;
  emptyText: string;
  columnIndex: number;
  mode: 'desktop' | 'mobile';
  onChooseEntry: (entry: HostPathEntry) => void;
  onEnterEntry: (entry: HostPathEntry, columnIndex: number) => void;
};

function PathEntryList({ entries, selectedPath, isBrowsing, emptyText, columnIndex, mode, onChooseEntry, onEnterEntry }: PathEntryListProps) {
  if (entries.length === 0) return <p className="input-hint host-path-empty">{emptyText}</p>;
  return (
    <div className="host-path-entry-list">
      {entries.map((entry) => (
        <div className={`host-path-entry${entry.path === selectedPath ? ' active' : ''}${mode === 'mobile' ? ' mobile' : ''}`} key={entry.path}>
          <button
            className="host-path-entry-main"
            type="button"
            disabled={!entry.readable || isBrowsing}
            aria-label={`${mode === 'mobile' ? '进入' : '选择'} ${entry.path}`}
            onClick={() => mode === 'mobile' ? onEnterEntry(entry, columnIndex) : onChooseEntry(entry)}
          >
            <span>{entry.name}</span>
            <span className="mono-inline">{entry.path}</span>
          </button>
          {mode === 'mobile' ? null : (
            <button
              className="host-path-entry-drill"
              type="button"
              disabled={!entry.readable || isBrowsing}
              aria-label={`进入 ${entry.path}`}
              onClick={() => onEnterEntry(entry, columnIndex)}
            >
              ›
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
