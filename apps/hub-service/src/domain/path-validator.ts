/**
 * [INPUT]: 依赖 node:path 的绝对路径判断与 node:fs 的目录存在性检查
 * [OUTPUT]: 对外提供 assertProjectPath，用于验证启动输入路径
 * [POS]: hub-service 的系统边界守门器，在进入启动器前收紧无效输入
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { existsSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { createAppError } from './error-mapper.js';

export function assertProjectPath(projectPath: string): string {
  const normalizedPath = projectPath.trim();
  if (!normalizedPath || !isAbsolute(normalizedPath)) {
    throw createAppError('INVALID_PATH');
  }

  const resolvedPath = resolve(normalizedPath);
  if (!existsSync(resolvedPath)) {
    throw createAppError('INVALID_PATH');
  }

  const stats = statSync(resolvedPath);
  if (!stats.isDirectory()) {
    throw createAppError('INVALID_PATH');
  }

  return resolvedPath;
}
