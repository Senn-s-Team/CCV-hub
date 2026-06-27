/**
 * [INPUT]: 依赖 React 状态、shared-contracts 的 LaunchMode 与 launch-dialog-utils 的最近路径存储能力
 * [OUTPUT]: 对外提供 useLaunchDraft hook，封装启动路径、参数、权限、最近路径与提交派生数据
 * [POS]: components/launch 的启动草稿状态层，被 LaunchDialog 用来隔离表单状态与向导编排
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useState } from 'react';
import type { LaunchMode } from '@ccv-hub/shared-contracts';
import { persistRecentPaths, promoteRecentPath, readRecentPaths } from './launch-dialog-utils.js';

export type ProjectPathSource = 'recent' | 'browser' | 'manual';

const launchModeLabels: Record<LaunchMode, string> = {
  default: '普通启动',
  continue: '继续最近会话 (-c)',
  resume: '选择历史会话 (-r)',
};

export function useLaunchDraft() {
  const [projectPath, setProjectPath] = useState('');
  const [projectPathSource, setProjectPathSource] = useState<ProjectPathSource>('browser');
  const [mode, setMode] = useState<LaunchMode>('default');
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('');
  const [dangerouslySkipPermissions, setDangerouslySkipPermissions] = useState(false);
  const [allowDangerouslySkipPermissions, setAllowDangerouslySkipPermissions] = useState(false);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const trimmedPath = projectPath.trim();
  const trimmedPrompt = prompt.trim();
  const trimmedModel = model.trim();
  const canSubmit = trimmedPath.startsWith('/');
  const hasPathFormatError = trimmedPath.length > 0 && !canSubmit;
  const pathFieldError = hasPathFormatError ? '请输入以 / 开头的绝对路径' : '';
  const sourceLabel = projectPathSource === 'recent' ? '来自最近使用' : projectPathSource === 'manual' ? '来自粘贴路径' : '来自宿主机目录';
  const launchSummaryBadges = [
    launchModeLabels[mode],
    trimmedModel ? `模型 ${trimmedModel}` : '默认模型',
    trimmedPrompt ? '附带初始提示词' : '无初始提示词',
    dangerouslySkipPermissions ? '跳过权限确认 (--d)' : '',
    allowDangerouslySkipPermissions ? '允许跳过权限确认 (--ad)' : '',
  ].filter(Boolean);

  function resetDraft() {
    setProjectPath('');
    setProjectPathSource('browser');
    setMode('default');
    setPrompt('');
    setModel('');
    setDangerouslySkipPermissions(false);
    setAllowDangerouslySkipPermissions(false);
    setRecentPaths(readRecentPaths());
  }

  function rememberPath(pathname: string) {
    setRecentPaths((paths) => {
      const nextPaths = promoteRecentPath(paths, pathname);
      persistRecentPaths(nextPaths);
      return nextPaths;
    });
  }

  function removeRecentPath(pathname: string) {
    setRecentPaths((paths) => {
      const nextPaths = paths.filter((path) => path !== pathname);
      persistRecentPaths(nextPaths);
      return nextPaths;
    });
  }

  function selectPath(pathname: string, source: ProjectPathSource = 'browser') {
    setProjectPath(pathname);
    setProjectPathSource(source);
  }

  function editManualPath(pathname: string) {
    selectPath(pathname, 'manual');
  }

  return {
    allowDangerouslySkipPermissions,
    canSubmit,
    dangerouslySkipPermissions,
    hasPathFormatError,
    launchSummaryBadges,
    mode,
    model,
    pathFieldError,
    projectPath,
    prompt,
    recentPaths,
    sourceLabel,
    trimmedModel,
    trimmedPath,
    trimmedPrompt,
    editManualPath,
    rememberPath,
    removeRecentPath,
    resetDraft,
    selectPath,
    setAllowDangerouslySkipPermissions,
    setDangerouslySkipPermissions,
    setMode,
    setModel,
    setPrompt,
  };
}
