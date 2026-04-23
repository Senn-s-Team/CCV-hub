/**
 * [INPUT]: 依赖 shared-contracts 的错误码与默认文案
 * [OUTPUT]: 对外提供 createAppError、toFailureResponse 与 isAppError
 * [POS]: hub-service 的错误归一层，负责把领域异常映射成统一接口响应
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { errorMessageMap, type ApiFailure, type ErrorCode } from '@ccv-hub/shared-contracts';

export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message = errorMessageMap[code]) {
    super(message);
    this.code = code;
  }
}

export function createAppError(code: ErrorCode, message?: string): AppError {
  return new AppError(code, message);
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toFailureResponse(error: unknown, fallbackCode: ErrorCode = 'INTERNAL_ERROR'): ApiFailure {
  if (isAppError(error)) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: fallbackCode,
      message: errorMessageMap[fallbackCode],
    },
  };
}
