/**
 * [INPUT]: 依赖 node:child_process 的 ChildProcess 退出事件
 * [OUTPUT]: 对外提供 createStopHandle 与 bindProcessExit
 * [POS]: hub-service 的进程监督层，把外部实例生命周期压缩成可控回调
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { ChildProcess } from 'node:child_process';

export function createStopHandle(child: ChildProcess): () => void {
  return () => {
    if (child.killed) return;
    child.kill('SIGTERM');
  };
}

export function bindProcessExit(child: ChildProcess, onExit: () => void): void {
  child.once('exit', onExit);
  child.once('error', onExit);
}
