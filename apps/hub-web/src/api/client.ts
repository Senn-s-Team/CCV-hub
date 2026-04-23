/**
 * [INPUT]: 依赖 shared-contracts 的请求响应 schema，依赖浏览器 fetch
 * [OUTPUT]: 对外提供 getHealth、getInstances、createInstance 与 ApiClientError
 * [POS]: hub-web 的服务端访问层，负责把接口响应解析成稳定前端数据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import {
  createInstanceRequestSchema,
  createInstanceResponseSchema,
  healthResponseSchema,
  listInstancesResponseSchema,
  type CreateInstanceResponse,
  type HealthResponse,
  type ListInstancesResponse,
} from '@ccv-hub/shared-contracts';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:4318';

export class ApiClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit, parser: (payload: unknown) => T): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    ...init,
  });

  const payload = parser(await response.json());

  if ('ok' in (payload as object) && !(payload as { ok: boolean }).ok) {
    const failure = payload as { error: { code: string; message: string } };
    throw new ApiClientError(failure.error.code, failure.error.message);
  }

  return payload;
}

export function getHealth(): Promise<HealthResponse> {
  return request('/api/health', { method: 'GET' }, (payload) => healthResponseSchema.parse(payload));
}

export function getInstances(): Promise<ListInstancesResponse> {
  return request('/api/instances', { method: 'GET' }, (payload) => listInstancesResponseSchema.parse(payload));
}

export function createInstance(projectPath: string): Promise<CreateInstanceResponse> {
  const body = createInstanceRequestSchema.parse({ projectPath });
  return request('/api/instances', {
    method: 'POST',
    body: JSON.stringify(body),
  }, (payload) => createInstanceResponseSchema.parse(payload));
}
