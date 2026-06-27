/**
 * [INPUT]: 依赖 Vitest、Testing Library、React 与 components/launch/LaunchPathPicker
 * [OUTPUT]: 对外提供启动路径选择器单元测试，覆盖 Finder column 选择/进入、搜索过滤与移动端 breadcrumb drill-in
 * [POS]: hub-web 测试集的路径选择交互守卫，锁定 launch 子模块的核心语义
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostPathEntry } from '@ccv-hub/shared-contracts';
import LaunchPathPicker, { type PathColumn } from '../components/launch/LaunchPathPicker.js';

const projectsRoot: HostPathEntry = { name: 'projects', path: '/home/opc/projects', readable: true };
const ccvsEntry: HostPathEntry = { name: 'ccvs', path: '/home/opc/projects/ccvs', readable: true };
const sdkEntry: HostPathEntry = { name: 'sdk-lab', path: '/home/opc/projects/sdk-lab', readable: true };
const hubEntry: HostPathEntry = { name: 'ccv-hub', path: '/home/opc/projects/ccvs/ccv-hub', readable: true };

function renderPicker(overrides: Partial<React.ComponentProps<typeof LaunchPathPicker>> = {}) {
  const props = {
    roots: [projectsRoot],
    columns: [
      {
        currentPath: projectsRoot.path,
        parentPath: null,
        selectedPath: ccvsEntry.path,
        entries: [ccvsEntry, sdkEntry],
      },
      {
        currentPath: ccvsEntry.path,
        parentPath: projectsRoot.path,
        selectedPath: '',
        entries: [hubEntry],
      },
    ] satisfies PathColumn[],
    activePath: ccvsEntry.path,
    isBrowsing: false,
    error: '',
    search: '',
    isMobile: false,
    onSearchChange: vi.fn(),
    onLoadRoot: vi.fn(),
    onLoadParent: vi.fn(),
    onSelectCurrent: vi.fn(),
    onChooseEntry: vi.fn(),
    onEnterEntry: vi.fn(),
    ...overrides,
  };

  render(<LaunchPathPicker {...props} />);
  return props;
}

afterEach(() => {
  cleanup();
});

describe('LaunchPathPicker', () => {
  it('chooses a directory without entering its child column', () => {
    const props = renderPicker();

    fireEvent.click(screen.getByRole('button', { name: `选择 ${hubEntry.path}` }));

    expect(props.onChooseEntry).toHaveBeenCalledWith(hubEntry);
    expect(props.onEnterEntry).not.toHaveBeenCalled();
  });

  it('enters a directory from the Finder column drill action', () => {
    const props = renderPicker();

    fireEvent.click(screen.getByRole('button', { name: `进入 ${ccvsEntry.path}` }));

    expect(props.onEnterEntry).toHaveBeenCalledWith(ccvsEntry, 0);
    expect(props.onChooseEntry).not.toHaveBeenCalled();
  });

  it('filters the active Finder column by the search text', () => {
    renderPicker({
      columns: [{ currentPath: projectsRoot.path, parentPath: null, selectedPath: '', entries: [ccvsEntry, sdkEntry] }],
      activePath: projectsRoot.path,
      search: 'sdk',
    });

    expect(screen.queryByText('ccvs')).not.toBeInTheDocument();
    expect(screen.getByText('sdk-lab')).toBeInTheDocument();
  });

  it('routes mobile breadcrumb chips and row taps through drill-in callbacks', () => {
    const props = renderPicker({ isMobile: true });

    const breadcrumbs = screen.getByLabelText('路径层级');
    fireEvent.click(within(breadcrumbs).getByRole('button', { name: 'projects' }));
    fireEvent.click(screen.getByRole('button', { name: `进入 ${hubEntry.path}` }));

    expect(props.onLoadRoot).toHaveBeenCalledWith(projectsRoot.path);
    expect(props.onEnterEntry).toHaveBeenCalledWith(hubEntry, 1);
    expect(props.onChooseEntry).not.toHaveBeenCalled();
  });
});
