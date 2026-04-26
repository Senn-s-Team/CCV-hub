/**
 * [INPUT]: 依赖 zod 的枚举定义能力，依赖 docs/api/api.md 的错误码约束
 * [OUTPUT]: 对外提供 errorCodeSchema、ErrorCode 类型与 errorMessageMap
 * [POS]: shared-contracts 的错误契约入口，被 hub-service 与 hub-web 共用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { z } from 'zod';

export const errorCodeSchema = z.enum([
  'INVALID_PATH',
  'START_FAILED',
  'REGISTER_FAILED',
  'LIST_FAILED',
  'UNREGISTER_FAILED',
  'HOST_PATH_FAILED',
  'UNAUTHORIZED',
  'AUTH_NOT_CONFIGURED',
  'INTERNAL_ERROR',
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorMessageMap: Record<ErrorCode, string> = {
  INVALID_PATH: 'Project path is invalid',
  START_FAILED: 'Failed to start cc-viewer',
  REGISTER_FAILED: 'Failed to register instance',
  LIST_FAILED: 'Failed to list instances',
  UNREGISTER_FAILED: 'Failed to unregister instance',
  HOST_PATH_FAILED: 'Failed to list host paths',
  UNAUTHORIZED: 'Authentication required',
  AUTH_NOT_CONFIGURED: 'Hub authentication is not configured',
  INTERNAL_ERROR: 'Internal server error',
};
