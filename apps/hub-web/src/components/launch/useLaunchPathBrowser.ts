/**
 * [INPUT]: 依赖 React 状态、hub-web API 客户端的宿主机路径能力与 LaunchPathPicker 的目录列类型
 * [OUTPUT]: 对外提供 useLaunchPathBrowser hook，封装路径浏览开关、roots、columns、搜索、加载状态、错误与目录读取动作
 * [POS]: components/launch 的路径浏览状态层，被 LaunchDialog 用来维持启动容器的单一编排职责
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useRef, useState } from 'react';
import type { HostPathEntry } from '@ccv-hub/shared-contracts';
import { getHostPathList, getHostPathRoots } from '../../api/client.js';
import { pathColumnFrom, type LoadPathPlacement, type PathColumn } from './LaunchPathPicker.js';

export function useLaunchPathBrowser() {
  const [browserOpen, setBrowserOpen] = useState(false);
  const [roots, setRoots] = useState<HostPathEntry[]>([]);
  const [columns, setColumns] = useState<PathColumn[]>([]);
  const [pathBrowserError, setPathBrowserError] = useState('');
  const [isBrowsingPaths, setIsBrowsingPaths] = useState(false);
  const [pathSearch, setPathSearch] = useState('');
  const pathRequestIdRef = useRef(0);
  const activePath = columns.at(-1)?.currentPath ?? '';

  function resetPathBrowser() {
    setBrowserOpen(false);
    setRoots([]);
    setColumns([]);
    setPathBrowserError('');
    setIsBrowsingPaths(false);
    setPathSearch('');
    pathRequestIdRef.current = 0;
  }

  function applyLoadedPath(pathname: string, column: PathColumn, placement: LoadPathPlacement) {
    setColumns((current) => {
      if (placement.replace || placement.afterColumn === undefined) return [column];
      const base = current.slice(0, placement.afterColumn + 1);
      const selected = base[placement.afterColumn];
      if (selected) base[placement.afterColumn] = { ...selected, selectedPath: pathname };
      return [...base, column];
    });
  }

  async function openPathBrowser() {
    setBrowserOpen(true);
    setPathBrowserError('');
    setIsBrowsingPaths(true);
    try {
      const rootsResponse = await getHostPathRoots();
      if (!rootsResponse.ok) return;
      setRoots(rootsResponse.data.roots);
      const firstRoot = rootsResponse.data.roots[0]?.path;
      if (firstRoot) await loadPath(firstRoot, { replace: true });
      else setColumns([]);
    } catch (error) {
      setPathBrowserError(error instanceof Error ? error.message : '宿主机路径读取失败');
    } finally {
      setIsBrowsingPaths(false);
    }
  }

  async function loadPath(pathname: string, placement: LoadPathPlacement = {}) {
    const requestId = pathRequestIdRef.current + 1;
    pathRequestIdRef.current = requestId;
    setPathBrowserError('');
    setPathSearch('');
    setIsBrowsingPaths(true);
    try {
      const response = await getHostPathList(pathname);
      if (requestId !== pathRequestIdRef.current || !response.ok) return;
      applyLoadedPath(pathname, pathColumnFrom(response.data.currentPath, response.data.parentPath, response.data.entries), placement);
    } catch (error) {
      if (requestId === pathRequestIdRef.current) {
        setPathBrowserError(error instanceof Error ? error.message : '宿主机路径读取失败');
      }
    } finally {
      if (requestId === pathRequestIdRef.current) setIsBrowsingPaths(false);
    }
  }

  return {
    activePath,
    browserOpen,
    columns,
    isBrowsingPaths,
    pathBrowserError,
    pathSearch,
    roots,
    loadPath,
    openPathBrowser,
    resetPathBrowser,
    setPathSearch,
  };
}
