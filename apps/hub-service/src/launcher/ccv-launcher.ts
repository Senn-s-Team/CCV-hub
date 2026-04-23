/**
 * [INPUT]: 依赖 node:child_process 启动 ccv CLI，依赖 process-supervisor 绑定退出与停止能力
 * [OUTPUT]: 对外提供 CcvLauncher 类、LaunchResult 类型与 ViewerLauncher 接口
 * [POS]: hub-service 的统一入口启动器，把项目路径转换成可登记的 cc-viewer 实例
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppError } from '../domain/error-mapper.js';
import { bindProcessExit, createStopHandle } from './process-supervisor.js';

export type LaunchResult = {
  projectName: string;
  url: string;
  port: number;
  pid: number;
  stop: () => void;
  onExit: (listener: () => void) => void;
};

export interface ViewerLauncher {
  launch(projectPath: string): Promise<LaunchResult>;
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

function parseLocalUrl(line: string): string | null {
  const match = line.match(/➜\s+Local:\s+(https?:\/\/\S+)/u);
  return match?.[1] ?? null;
}

function parsePort(url: string): number {
  const { port } = new URL(url);
  return Number(port);
}

function collectOutput(child: ChildProcess, onLocalUrl: (url: string) => void): () => string {
  let buffer = '';
  let errorBuffer = '';

  const handleChunk = (chunk: Buffer | string) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const localUrl = parseLocalUrl(line);
      if (localUrl) {
        onLocalUrl(localUrl);
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

export class CcvLauncher implements ViewerLauncher {
  private readonly ccvCliPath: string;
  private readonly startupTimeoutMs: number;

  constructor(options?: { ccvCliPath?: string; startupTimeoutMs?: number }) {
    this.ccvCliPath = options?.ccvCliPath ?? resolveCcvCliPath();
    this.startupTimeoutMs = options?.startupTimeoutMs ?? 30000;
  }

  async launch(projectPath: string): Promise<LaunchResult> {
    const child = spawn(process.execPath, [this.ccvCliPath, '--no-open'], {
      cwd: projectPath,
      env: process.env,
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
        resolveLaunch({
          projectName: basename(projectPath),
          url: localUrl,
          port: parsePort(localUrl),
          pid: child.pid ?? 0,
          stop: createStopHandle(child),
          onExit: (listener) => bindProcessExit(child, listener),
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
