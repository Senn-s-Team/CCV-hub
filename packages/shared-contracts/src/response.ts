/**
 * [INPUT]: 依赖 zod 泛型组合能力，依赖错误码与实例 schema
 * [OUTPUT]: 对外提供 apiSuccessSchema、apiFailureSchema、apiResponseSchema、启动参数、宿主机路径浏览、鉴权、实例创建/注册/注销契约与相关类型
 * [POS]: shared-contracts 的响应契约层，统一本地服务全部 JSON 结构
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { z } from 'zod';
import { errorCodeSchema } from './errors.js';
import { instanceSchema, isoDatetimeSchema } from './instance.js';

export const apiSuccessSchema = <TSchema extends z.ZodTypeAny>(dataSchema: TSchema) => z.object({
  ok: z.literal(true),
  data: dataSchema,
});

export const apiFailureSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: errorCodeSchema,
    message: z.string().min(1),
  }),
});

export const apiResponseSchema = <TSchema extends z.ZodTypeAny>(dataSchema: TSchema) => z.union([
  apiSuccessSchema(dataSchema),
  apiFailureSchema,
]);

export const healthDataSchema = z.object({
  status: z.literal('ok'),
});

export const healthResponseSchema = apiSuccessSchema(healthDataSchema);

export const authLoginRequestSchema = z.object({
  password: z.string().min(1),
});

export const authStatusDataSchema = z.object({
  authenticated: z.boolean(),
  configured: z.boolean(),
});

export const authStatusResponseSchema = apiSuccessSchema(authStatusDataSchema);

export const listInstancesDataSchema = z.object({
  instances: z.array(instanceSchema),
});

export const listInstancesResponseSchema = apiResponseSchema(listInstancesDataSchema);

export const hostPathEntrySchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  readable: z.boolean(),
});

export const hostPathRootsDataSchema = z.object({
  roots: z.array(hostPathEntrySchema),
});

export const hostPathRootsResponseSchema = apiResponseSchema(hostPathRootsDataSchema);

export const hostPathListDataSchema = z.object({
  currentPath: z.string().min(1),
  parentPath: z.string().min(1).nullable(),
  entries: z.array(hostPathEntrySchema),
});

export const hostPathListResponseSchema = apiResponseSchema(hostPathListDataSchema);

export const launchModeSchema = z.enum(['default', 'continue', 'resume']);

export const launchOptionsSchema = z.object({
  mode: launchModeSchema.default('default'),
  prompt: z.string().default(''),
  model: z.string().default(''),
  dangerouslySkipPermissions: z.boolean().default(false),
  allowDangerouslySkipPermissions: z.boolean().default(false),
});

export const defaultLaunchOptions = {
  mode: 'default',
  prompt: '',
  model: '',
  dangerouslySkipPermissions: false,
  allowDangerouslySkipPermissions: false,
} as const;

export const createInstanceRequestSchema = z.object({
  projectPath: z.string().min(1),
  options: launchOptionsSchema.default(defaultLaunchOptions),
});

export const createInstanceDataSchema = z.object({
  instance: instanceSchema,
});

export const createInstanceResponseSchema = apiResponseSchema(createInstanceDataSchema);

export const registerInstanceRequestSchema = z.object({
  id: z.string().min(1).optional(),
  projectName: z.string().min(1),
  projectPath: z.string().min(1),
  url: z.string().url(),
  port: z.number().int().positive(),
  pid: z.number().int().positive(),
  source: z.string().min(1).default('manual'),
  startedAt: isoDatetimeSchema.optional(),
});

export const registerInstanceDataSchema = z.object({
  instance: instanceSchema,
});

export const registerInstanceResponseSchema = apiResponseSchema(registerInstanceDataSchema);

export const unregisterInstanceRequestSchema = z.object({
  id: z.string().min(1).optional(),
  pid: z.number().int().positive().optional(),
  port: z.number().int().positive().optional(),
  projectPath: z.string().min(1).optional(),
});

export const unregisterInstanceDataSchema = z.object({
  removed: z.boolean(),
});

export const unregisterInstanceResponseSchema = apiResponseSchema(unregisterInstanceDataSchema);

export type ApiSuccess<TData> = {
  ok: true;
  data: TData;
};

export type ApiFailure = z.infer<typeof apiFailureSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type AuthLoginRequest = z.infer<typeof authLoginRequestSchema>;
export type AuthStatusResponse = z.infer<typeof authStatusResponseSchema>;
export type ListInstancesResponse = z.infer<typeof listInstancesResponseSchema>;
export type HostPathEntry = z.infer<typeof hostPathEntrySchema>;
export type HostPathRootsResponse = z.infer<typeof hostPathRootsResponseSchema>;
export type HostPathListResponse = z.infer<typeof hostPathListResponseSchema>;
export type LaunchMode = z.infer<typeof launchModeSchema>;
export type LaunchOptions = z.infer<typeof launchOptionsSchema>;
export type CreateInstanceRequest = z.infer<typeof createInstanceRequestSchema>;
export type CreateInstanceResponse = z.infer<typeof createInstanceResponseSchema>;
export type RegisterInstanceRequest = z.infer<typeof registerInstanceRequestSchema>;
export type RegisterInstanceResponse = z.infer<typeof registerInstanceResponseSchema>;
export type UnregisterInstanceRequest = z.infer<typeof unregisterInstanceRequestSchema>;
export type UnregisterInstanceResponse = z.infer<typeof unregisterInstanceResponseSchema>;
