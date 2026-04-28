/**
 * [INPUT]: 依赖 node:child_process 的 ChildProcess 退出事件和 kill 信号能力
 * [OUTPUT]: 对外提供 createStopHandle 与 bindProcessExit，支持优雅停止后的强制终止收敛
 * [POS]: hub-service 的进程监督层，把自身启动的子进程生命周期压缩成可控回调
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { ChildProcess } from 'node:child_process';

const gracefulStopTimeoutMs = 3000;

export function createStopHandle(child: ChildProcess): (signal?: NodeJS.Signals) => void {
  let exited = false;
  child.once('exit', () => {
    exited = true;
  });
  child.once('error', () => {
    exited = true;
  });

  return (signal = 'SIGTERM') => {
    if (exited) return;
    child.kill(signal);
    if (signal === 'SIGKILL') return;

    const forceStopTimer = setTimeout(() => {
      if (!exited) child.kill('SIGKILL');
    }, gracefulStopTimeoutMs);
    forceStopTimer.unref();
    child.once('exit', () => clearTimeout(forceStopTimer));
    child.once('error', () => clearTimeout(forceStopTimer));
  };
}

export function bindProcessExit(child: ChildProcess, onExit: () => void): void {
  child.once('exit', onExit);
  child.once('error', onExit);
}
