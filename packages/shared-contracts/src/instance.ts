/**
 * [INPUT]: 依赖 zod 的对象 schema，依赖 docs/api/api.md 的 Instance 字段定义
 * [OUTPUT]: 对外提供 instanceStatusSchema、internalInstanceStatusSchema、instanceSourceSchema、instanceSchema 与 Instance 类型
 * [POS]: shared-contracts 的实例模型中心，统一页面与服务端的字段边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { z } from 'zod';

export const instanceStatusSchema = z.literal('running');

export const internalInstanceStatusSchema = z.enum([
  'starting',
  'running',
  'stopping',
  'stale',
  'removed',
  'exited',
]);

export const instanceSourceSchema = z.string().min(1);

export const isoDatetimeSchema = z.iso.datetime({ offset: true });

export const instanceSchema = z.object({
  id: z.string().min(1),
  projectName: z.string().min(1),
  projectPath: z.string().min(1),
  url: z.string().url(),
  port: z.number().int().positive(),
  pid: z.number().int().positive(),
  status: instanceStatusSchema,
  source: instanceSourceSchema,
  startedAt: isoDatetimeSchema,
  lastSeen: isoDatetimeSchema,
  canStop: z.boolean(),
});

export type Instance = z.infer<typeof instanceSchema>;
export type InternalInstanceStatus = z.infer<typeof internalInstanceStatusSchema>;
