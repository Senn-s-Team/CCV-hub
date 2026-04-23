/**
 * [INPUT]: 依赖 zod 泛型组合能力，依赖错误码与实例 schema
 * [OUTPUT]: 对外提供 apiSuccessSchema、apiFailureSchema、apiResponseSchema 与相关类型
 * [POS]: shared-contracts 的响应契约层，统一本地服务全部 JSON 结构
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { z } from 'zod';
import { errorCodeSchema } from './errors.js';
import { instanceSchema } from './instance.js';

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

export const listInstancesDataSchema = z.object({
  instances: z.array(instanceSchema),
});

export const listInstancesResponseSchema = apiResponseSchema(listInstancesDataSchema);

export const createInstanceRequestSchema = z.object({
  projectPath: z.string().min(1),
});

export const createInstanceDataSchema = z.object({
  instance: instanceSchema,
});

export const createInstanceResponseSchema = apiResponseSchema(createInstanceDataSchema);

export type ApiSuccess<TData> = {
  ok: true;
  data: TData;
};

export type ApiFailure = z.infer<typeof apiFailureSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ListInstancesResponse = z.infer<typeof listInstancesResponseSchema>;
export type CreateInstanceRequest = z.infer<typeof createInstanceRequestSchema>;
export type CreateInstanceResponse = z.infer<typeof createInstanceResponseSchema>;
