/**
 * [INPUT]: 依赖 node:fs/promises 与 node:path，读取宿主机 allowlist 内目录
 * [OUTPUT]: 对外提供 HostPathBrowser、resolveHostPathRoots，用于安全枚举宿主机项目路径
 * [POS]: hub-service 的宿主机路径浏览守门器，被 host-paths 路由消费并服务启动弹窗
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { access, readdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve, sep } from 'node:path';
import { createAppError } from './error-mapper.js';

const hiddenNames = new Set(['.ssh', '.gnupg', '.claude', '.config', '.git', 'node_modules']);
const maxEntries = 200;

export type HostPathEntry = {
  name: string;
  path: string;
  readable: boolean;
};

export type HostPathList = {
  currentPath: string;
  parentPath: string | null;
  entries: HostPathEntry[];
};

function splitRoots(input: string | undefined): string[] {
  return (input ?? '/home/opc/projects')
    .split(':')
    .map((value) => value.trim())
    .filter(Boolean);
}

function isWithinRoot(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}${sep}`);
}

async function readableDirectory(pathname: string): Promise<boolean> {
  try {
    const stats = await stat(pathname);
    await access(pathname);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function resolveDirectory(pathname: string): Promise<string> {
  if (!isAbsolute(pathname)) {
    throw createAppError('INVALID_PATH');
  }

  const resolvedPath = resolve(pathname);
  const stats = await stat(resolvedPath).catch(() => undefined);
  if (!stats?.isDirectory()) {
    throw createAppError('INVALID_PATH');
  }

  return realpath(resolvedPath);
}

export async function resolveHostPathRoots(input = process.env.CCV_HUB_PATH_ROOTS): Promise<string[]> {
  const roots = await Promise.all(splitRoots(input).map((root) => resolveDirectory(root)));
  return Array.from(new Set(roots));
}

export class HostPathBrowser {
  constructor(private readonly roots: string[]) {}

  static async fromEnv(): Promise<HostPathBrowser> {
    return new HostPathBrowser(await resolveHostPathRoots());
  }

  getRoots(): HostPathEntry[] {
    return this.roots.map((root) => ({
      name: basename(root) || root,
      path: root,
      readable: true,
    }));
  }

  async list(pathname: string): Promise<HostPathList> {
    const currentPath = await this.normalizeInsideRoot(pathname);
    const names = await readdir(currentPath);
    const entries = await Promise.all(names
      .filter((name) => !hiddenNames.has(name))
      .sort((left, right) => left.localeCompare(right))
      .slice(0, maxEntries)
      .map((name) => this.toEntry(currentPath, name)));

    return {
      currentPath,
      parentPath: this.parentPath(currentPath),
      entries: entries.filter((entry): entry is HostPathEntry => Boolean(entry)),
    };
  }

  private async toEntry(currentPath: string, name: string): Promise<HostPathEntry | null> {
    const candidatePath = resolve(currentPath, name);
    const readable = await readableDirectory(candidatePath);
    if (!readable) return null;

    const realCandidatePath = await realpath(candidatePath);
    if (!this.roots.some((root) => isWithinRoot(realCandidatePath, root))) return null;

    return {
      name,
      path: realCandidatePath,
      readable,
    };
  }

  private async normalizeInsideRoot(pathname: string): Promise<string> {
    const currentPath = await resolveDirectory(pathname);
    if (!this.roots.some((root) => isWithinRoot(currentPath, root))) {
      throw createAppError('INVALID_PATH');
    }

    return currentPath;
  }

  private parentPath(currentPath: string): string | null {
    if (this.roots.includes(currentPath)) return null;
    const parent = dirname(currentPath);
    return this.roots.some((root) => isWithinRoot(parent, root)) ? parent : null;
  }
}
