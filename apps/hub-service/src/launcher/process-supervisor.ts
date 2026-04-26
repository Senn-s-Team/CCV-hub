/**
 * [INPUT]: 依赖 node:child_process 的 ChildProcess 退出事件
 * [OUTPUT]: 对外提供 createStopHandle 与 bindProcessExit
 * [POS]: hub-service 的进程监督层，把自身启动的子进程生命周期压缩成可控回调
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { ChildProcess } from 'node:child_process';

export function createStopHandle(child: ChildProcess): (signal?: NodeJS.Signals) => void {
  return (signal = 'SIGTERM') => {
    if (child.killed) return;
    child.kill(signal);
  };
}

export function bindProcessExit(child: ChildProcess, onExit: () => void): void {
  child.once('exit', onExit);
  child.once('error', onExit);
}
