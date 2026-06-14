/**
 * [INPUT]: 依赖 node:fs/promises 与 node:path 的文件定位、regular-file 校验与 symlink 拒绝能力，依赖 CCV_LOG_DIR/CLAUDE_CONFIG_DIR/HOME 环境确定 cc-viewer 插件目录
 * [OUTPUT]: 对外提供 installHubPlugin、resolveClaudeConfigDir、resolveCcvPluginDir 与 HubPluginInstallResult，用于把受管 ccv-hub 插件同步到 cc-viewer 用户插件目录
 * [POS]: hub-service 的 logger 发现播种器，在显式启用后把受管 Hub 注册能力安全注入 cc-viewer 插件加载面
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export type HubPluginInstallResult = {
  targetPath: string;
  installed: boolean;
  reason: 'disabled' | 'created' | 'updated' | 'current' | 'custom';
};

type InstallHubPluginOptions = {
  sourcePath?: string;
  claudeConfigDir?: string;
  logDir?: string;
  allowSourceOverride?: boolean;
  disabled?: boolean;
};

const pluginFileName = 'ccv-hub-plugin.mjs';
const managedPluginMarker = '[CCV_HUB_MANAGED_PLUGIN]';

function expandHome(path: string): string {
  if (!path.startsWith('~/')) return path;
  return join(process.env.HOME ?? '/home/opc', path.slice(2));
}

export function resolveClaudeConfigDir(): string {
  const configured = process.env.CLAUDE_CONFIG_DIR?.trim();
  if (configured) return resolve(expandHome(configured));
  return join(process.env.HOME ?? '/home/opc', '.claude');
}

export function resolveCcvPluginDir(claudeConfigDir = resolveClaudeConfigDir(), configuredLogDir = process.env.CCV_LOG_DIR): string {
  const configured = configuredLogDir?.trim();
  const logDir = configured ? resolve(expandHome(configured)) : join(claudeConfigDir, 'cc-viewer');
  return join(logDir, 'plugins');
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveBundledPluginSource(): Promise<string> {
  let currentDir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(currentDir, 'deploy', pluginFileName);
    if (await exists(candidate)) return candidate;
    const nextDir = dirname(currentDir);
    if (nextDir === currentDir) break;
    currentDir = nextDir;
  }
  throw new Error(`Unable to locate deploy/${pluginFileName}`);
}

function isWithinDir(path: string, dir: string): boolean {
  return path === dir || path.startsWith(`${dir}${sep}`);
}

async function assertRegularFile(path: string): Promise<void> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Expected regular file: ${path}`);
  }
}

async function assertTargetPath(pluginDir: string, targetPath: string): Promise<void> {
  const parentDir = await realpath(pluginDir).catch(() => pluginDir);
  const resolvedTarget = resolve(targetPath);
  if (!isWithinDir(resolvedTarget, parentDir)) {
    throw new Error(`Plugin target escapes plugin directory: ${targetPath}`);
  }
  try {
    await assertRegularFile(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function installHubPlugin(options: InstallHubPluginOptions = {}): Promise<HubPluginInstallResult> {
  const targetDir = resolveCcvPluginDir(options.claudeConfigDir ?? resolveClaudeConfigDir(), options.logDir ?? process.env.CCV_LOG_DIR);
  const targetPath = join(targetDir, pluginFileName);
  const disabled = options.disabled ?? process.env.CCV_HUB_PLUGIN_INSTALL_DISABLED === '1';
  if (disabled) {
    return { targetPath, installed: false, reason: 'disabled' };
  }

  const sourcePath = options.sourcePath ?? await resolveBundledPluginSource();
  if (options.sourcePath && !options.allowSourceOverride) {
    throw new Error('Plugin source override requires allowSourceOverride');
  }
  await assertRegularFile(sourcePath);
  await mkdir(targetDir, { recursive: true });
  await assertTargetPath(targetDir, targetPath);

  const sourceContent = await readFile(sourcePath, 'utf8');
  const currentContent = await readFile(targetPath, 'utf8').catch(() => null);

  if (currentContent === sourceContent) {
    return { targetPath, installed: false, reason: 'current' };
  }
  if (currentContent !== null && !currentContent.includes(managedPluginMarker)) {
    return { targetPath, installed: false, reason: 'custom' };
  }

  await writeFile(targetPath, sourceContent, { mode: 0o600 });

  return {
    targetPath,
    installed: true,
    reason: currentContent === null ? 'created' : 'updated',
  };
}
