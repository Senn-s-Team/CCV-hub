/**
 * [INPUT]: 依赖 node:child_process 启动 ccv CLI，依赖 shared-contracts 启动参数契约、宿主机进程环境与 process-supervisor 绑定退出/停止能力
 * [OUTPUT]: 对外提供 buildLaunchArgs、buildLaunchEnv、parseViewerUrl、resolveViewerUrl、CcvLauncher 类、LaunchResult 类型与 ViewerLauncher 接口
 * [POS]: hub-service 的统一入口启动器，把项目路径与 cc-viewer 参数转换成可登记的实例
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LaunchOptions } from '@ccv-hub/shared-contracts';
import { createAppError } from '../domain/error-mapper.js';
import { bindProcessExit, createStopHandle } from './process-supervisor.js';

export type LaunchResult = {
  projectName: string;
  url: string;
  port: number;
  pid: number;
  stop: (signal?: NodeJS.Signals) => void;
  onExit: (listener: () => void) => void;
};

export interface ViewerLauncher {
  launch(projectPath: string, options?: LaunchOptions): Promise<LaunchResult>;
}

function resolveCcvCliPath(): string {
  let currentDir = dirname(fileURLToPath(import.meta.url));
  while (basename(currentDir) !== 'ccv-hub') {
    const nextDir = dirname(currentDir);
    if (nextDir === currentDir) {
      throw createAppError('START_FAILED', 'Failed to resolve ccv-hub root');
    }
    currentDir = nextDir;
  }
  return resolve(currentDir, '../cc-viewer/cli.js');
}

export function parseViewerUrl(line: string): string | null {
  const match = line.match(/➜\s+(?:Local|Network):\s+(https?:\/\/\S+)/u);
  return match?.[1] ?? null;
}

function parsePort(url: string): number {
  const { port } = new URL(url);
  return Number(port);
}

export async function resolveViewerUrl(localUrl: string): Promise<string> {
  try {
    const response = await fetch(new URL('/api/local-url', localUrl));
    if (!response.ok) return localUrl;
    const payload = (await response.json()) as { url?: unknown };
    return typeof payload.url === 'string' && payload.url.length > 0 ? payload.url : localUrl;
  } catch {
    return localUrl;
  }
}

function collectOutput(child: ChildProcess, onViewerUrl: (url: string) => void): () => string {
  let buffer = '';
  let errorBuffer = '';

  const handleChunk = (chunk: Buffer | string) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const viewerUrl = parseViewerUrl(line);
      if (viewerUrl) {
        onViewerUrl(viewerUrl);
      }
    }
  };

  child.stdout?.on('data', handleChunk);
  child.stderr?.on('data', (chunk) => {
    errorBuffer += chunk.toString();
    handleChunk(chunk);
  });

  return () => `${errorBuffer}\n${buffer}`.trim();
}

export function buildLaunchEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR ?? `${process.env.HOME ?? '/home/opc'}/.claude`,
    CCV_HUB_PLUGIN_DISABLED: '1',
  };
}

export function buildLaunchArgs(ccvCliPath: string, options: LaunchOptions): string[] {
  const args = [ccvCliPath, '--no-open'];

  if (options.mode === 'continue') args.push('-c');
  if (options.mode === 'resume') args.push('-r');
  if (options.prompt) args.push('-p', options.prompt);
  if (options.model) args.push('--model', options.model);
  if (options.dangerouslySkipPermissions) args.push('--d');
  if (options.allowDangerouslySkipPermissions) args.push('--ad');

  return args;
}

export class CcvLauncher implements ViewerLauncher {
  private readonly ccvCliPath: string;
  private readonly startupTimeoutMs: number;

  constructor(options?: { ccvCliPath?: string; startupTimeoutMs?: number }) {
    this.ccvCliPath = options?.ccvCliPath ?? process.env.CCV_CLI_PATH ?? resolveCcvCliPath();
    this.startupTimeoutMs = options?.startupTimeoutMs ?? 30000;
  }

  async launch(projectPath: string, options: LaunchOptions): Promise<LaunchResult> {
    const child = spawn(process.execPath, buildLaunchArgs(this.ccvCliPath, options), {
      cwd: projectPath,
      env: buildLaunchEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (!child.pid) {
      throw createAppError('START_FAILED');
    }

    return new Promise<LaunchResult>((resolveLaunch, rejectLaunch) => {
      let settled = false;
      const getErrorOutput = collectOutput(child, (localUrl) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        void resolveViewerUrl(localUrl).then((viewerUrl) => {
          resolveLaunch({
            projectName: basename(projectPath),
            url: viewerUrl,
            port: parsePort(localUrl),
            pid: child.pid ?? 0,
            stop: createStopHandle(child),
            onExit: (listener) => bindProcessExit(child, listener),
          });
        });
      });

      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGTERM');
        rejectLaunch(createAppError('START_FAILED', 'Timed out while waiting for cc-viewer to start'));
      }, this.startupTimeoutMs);

      child.once('exit', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        const details = getErrorOutput();
        rejectLaunch(createAppError('START_FAILED', details || 'cc-viewer exited before startup completed'));
      });

      child.once('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        rejectLaunch(createAppError('START_FAILED', error.message));
      });
    });
  }
}
