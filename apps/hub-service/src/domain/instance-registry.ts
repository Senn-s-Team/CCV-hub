/**
 * [INPUT]: 依赖 node:net 与 URL 的端口探测能力，依赖 instance-model 的记录构造与公共投影能力
 * [OUTPUT]: 对外提供 InstanceRegistry 类、路径级实例单例、实例注册/注销、bridge 查找、端口存活清理与受控状态流转方法
 * [POS]: hub-service 的运行态真相源，集中收敛实例状态与排序逻辑
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { createConnection } from 'node:net';
import type { Instance, LifecycleAction } from '@ccv-hub/shared-contracts';
import { createManagedInstance, toPublicInstance, type CreateManagedInstanceInput, type ManagedInstanceRecord } from './instance-model.js';

type RemoveMatch = {
  id?: string;
  pid?: number;
  port?: number;
  projectPath?: string;
  source?: string;
};

function canConnectToPort(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(300);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      resolve(false);
    });
  });
}

function resolveHealthHost(record: ManagedInstanceRecord): string {
  try {
    return new URL(record.upstreamUrl).hostname;
  } catch {
    return '127.0.0.1';
  }
}

export class InstanceRegistry {
  private readonly records = new Map<string, ManagedInstanceRecord>();
  private readonly activePathIndex = new Map<string, string>();

  private create(input: CreateManagedInstanceInput): ManagedInstanceRecord {
    const existing = this.findActiveByProjectPath(input.projectPath);
    if (existing) return existing;

    const record = createManagedInstance(input);
    this.records.set(record.instance.id, record);
    this.activePathIndex.set(record.instance.projectPath, record.instance.id);
    return record;
  }

  findActiveByProjectPath(projectPath: string): ManagedInstanceRecord | undefined {
    const id = this.activePathIndex.get(projectPath);
    if (!id) return undefined;

    const record = this.records.get(id);
    if (record && record.internalStatus !== 'removed' && record.internalStatus !== 'exited' && record.internalStatus !== 'stale') {
      return record;
    }

    this.activePathIndex.delete(projectPath);
    return undefined;
  }

  createStarting(input: Omit<CreateManagedInstanceInput, 'internalStatus'>): ManagedInstanceRecord {
    return this.create({
      ...input,
      internalStatus: 'starting',
    });
  }

  createRunning(input: Omit<CreateManagedInstanceInput, 'internalStatus'>): ManagedInstanceRecord {
    return this.create({
      ...input,
      internalStatus: 'running',
    });
  }

  updateRunning(id: string, input: Omit<CreateManagedInstanceInput, 'internalStatus' | 'id'>): ManagedInstanceRecord | undefined {
    const record = this.records.get(id);
    if (!record) return undefined;

    this.activePathIndex.delete(record.instance.projectPath);
    record.instance = createManagedInstance({
      ...input,
      id,
      internalStatus: 'running',
    }).instance;
    record.internalStatus = 'running';
    record.upstreamUrl = input.upstreamUrl ?? input.url;
    record.bridgeId = input.bridgeId ?? id;
    record.stop = input.stop;
    this.activePathIndex.set(record.instance.projectPath, id);
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
    this.activePathIndex.delete(record.instance.projectPath);
    return record;
  }

  markStopping(id: string, lastSeen = new Date().toISOString()): ManagedInstanceRecord | undefined {
    const record = this.records.get(id);
    if (!record) return undefined;
    record.internalStatus = 'stopping';
    record.instance.lastSeen = lastSeen;
    return record;
  }

  markExited(id: string, lastSeen = new Date().toISOString()): ManagedInstanceRecord | undefined {
    const record = this.records.get(id);
    if (!record) return undefined;
    record.internalStatus = 'exited';
    record.instance.lastSeen = lastSeen;
    this.activePathIndex.delete(record.instance.projectPath);
    return record;
  }

  markRemoved(id: string): void {
    const record = this.records.get(id);
    if (!record) return;
    record.internalStatus = 'removed';
    this.activePathIndex.delete(record.instance.projectPath);
    this.records.delete(id);
  }

  discard(id: string): void {
    const record = this.records.get(id);
    if (record) this.activePathIndex.delete(record.instance.projectPath);
    this.records.delete(id);
  }

  stop(id: string, action: Extract<LifecycleAction, 'stop' | 'force-stop'>): boolean {
    const record = this.records.get(id);
    if (!record?.stop) return false;

    const signal = action === 'force-stop' ? 'SIGKILL' : 'SIGTERM';
    record.stop(signal);
    this.markStopping(id);
    return true;
  }

  removeMatching(match: RemoveMatch): boolean {
    const record = [...this.records.values()].find((candidate) => {
      if (match.source && candidate.instance.source !== match.source) return false;
      if (match.id && candidate.instance.id !== match.id) return false;
      if (match.pid && candidate.instance.pid !== match.pid) return false;
      if (match.port && candidate.instance.port !== match.port) return false;
      if (match.projectPath && candidate.instance.projectPath !== match.projectPath) return false;
      return Boolean(match.id ?? match.pid ?? match.port ?? match.projectPath);
    });
    if (!record) return false;
    this.markExited(record.instance.id);
    this.markRemoved(record.instance.id);
    return true;
  }

  async removeDeadRunningInstances(): Promise<void> {
    const checks = [...this.records.values()]
      .filter((record) => record.internalStatus === 'running')
      .map(async (record) => {
        if (await canConnectToPort(resolveHealthHost(record), record.instance.port)) return;
        this.markExited(record.instance.id);
        this.markRemoved(record.instance.id);
      });
    await Promise.all(checks);
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

  getByBridgeId(bridgeId: string): ManagedInstanceRecord | undefined {
    return [...this.records.values()].find((record) => record.internalStatus === 'running' && record.bridgeId === bridgeId);
  }
}
