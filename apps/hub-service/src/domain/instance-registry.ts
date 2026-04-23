/**
 * [INPUT]: 依赖 instance-model 的记录构造与公共投影能力
 * [OUTPUT]: 对外提供 InstanceRegistry 类与受控状态流转方法
 * [POS]: hub-service 的运行态真相源，集中收敛实例状态与排序逻辑
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { Instance } from '@ccv-hub/shared-contracts';
import { createManagedInstance, toPublicInstance, type CreateManagedInstanceInput, type ManagedInstanceRecord } from './instance-model.js';

export class InstanceRegistry {
  private readonly records = new Map<string, ManagedInstanceRecord>();

  createStarting(input: Omit<CreateManagedInstanceInput, 'internalStatus'>): ManagedInstanceRecord {
    const record = createManagedInstance({
      ...input,
      internalStatus: 'starting',
    });
    this.records.set(record.instance.id, record);
    return record;
  }

  markRunning(id: string, lastSeen = new Date().toISOString()): ManagedInstanceRecord | undefined {
    const record = this.records.get(id);
    if (!record) return undefined;
    record.internalStatus = 'running';
    record.instance.lastSeen = lastSeen;
    return record;
  }

  markStale(id: string, lastSeen = new Date().toISOString()): ManagedInstanceRecord | undefined {
    const record = this.records.get(id);
    if (!record) return undefined;
    record.internalStatus = 'stale';
    record.instance.lastSeen = lastSeen;
    return record;
  }

  markExited(id: string, lastSeen = new Date().toISOString()): ManagedInstanceRecord | undefined {
    const record = this.records.get(id);
    if (!record) return undefined;
    record.internalStatus = 'exited';
    record.instance.lastSeen = lastSeen;
    return record;
  }

  markRemoved(id: string): void {
    const record = this.records.get(id);
    if (!record) return;
    record.internalStatus = 'removed';
    this.records.delete(id);
  }

  discard(id: string): void {
    this.records.delete(id);
  }

  listRunning(): Instance[] {
    return [...this.records.values()]
      .filter((record) => record.internalStatus === 'running')
      .sort((left, right) => right.instance.startedAt.localeCompare(left.instance.startedAt))
      .map(toPublicInstance);
  }

  get(id: string): ManagedInstanceRecord | undefined {
    return this.records.get(id);
  }
}
