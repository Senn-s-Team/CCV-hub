/**
 * [INPUT]: 依赖 @ccv-hub/shared-contracts 的实例类型与内部状态定义
 * [OUTPUT]: 对外提供 ManagedInstanceRecord、CreateManagedInstanceInput 与 toPublicInstance，内部保留 viewer upstream 地址
 * [POS]: hub-service 的领域模型中心，负责区分内部记录与页面可见实例
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { Instance, InternalInstanceStatus } from '@ccv-hub/shared-contracts';

export type CreateManagedInstanceInput = Omit<Instance, 'status'> & {
  internalStatus: InternalInstanceStatus;
  upstreamUrl?: string;
  bridgeId?: string;
  stop?: () => void;
};

export type ManagedInstanceRecord = {
  instance: Instance;
  internalStatus: InternalInstanceStatus;
  upstreamUrl: string;
  bridgeId: string;
  stop?: () => void;
};

export function createManagedInstance(input: CreateManagedInstanceInput): ManagedInstanceRecord {
  return {
    instance: {
      id: input.id,
      projectName: input.projectName,
      projectPath: input.projectPath,
      url: input.url,
      port: input.port,
      pid: input.pid,
      status: 'running',
      source: input.source,
      startedAt: input.startedAt,
      lastSeen: input.lastSeen,
    },
    internalStatus: input.internalStatus,
    upstreamUrl: input.upstreamUrl ?? input.url,
    bridgeId: input.bridgeId ?? input.id,
    stop: input.stop,
  };
}

export function toPublicInstance(record: ManagedInstanceRecord): Instance {
  return record.instance;
}
