/**
 * [INPUT]: 依赖 shared-contracts 的请求响应 schema，依赖浏览器 fetch
 * [OUTPUT]: 对外提供 getHealth、getAuthStatus、login、logout、getInstances、getHostPathRoots、getHostPathList、createInstance、controlInstanceLifecycle 与 ApiClientError
 * [POS]: hub-web 的服务端访问层，负责把接口响应解析成稳定前端数据
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import {
  authLoginRequestSchema,
  authStatusResponseSchema,
  createInstanceRequestSchema,
  createInstanceResponseSchema,
  healthResponseSchema,
  lifecycleInstanceResponseSchema,
  hostPathListResponseSchema,
  hostPathRootsResponseSchema,
  listInstancesResponseSchema,
  type AuthStatusResponse,
  type CreateInstanceRequest,
  type CreateInstanceResponse,
  type HealthResponse,
  type HostPathListResponse,
  type HostPathRootsResponse,
  type LifecycleAction,
  type LifecycleInstanceResponse,
  type ListInstancesResponse,
} from '@ccv-hub/shared-contracts';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiClientError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function readFailure(payload: unknown): { code: string; message: string } | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const envelope = payload as { ok?: unknown; error?: unknown };
  if (envelope.ok !== false || !envelope.error || typeof envelope.error !== 'object') return undefined;
  const error = envelope.error as { code?: unknown; message?: unknown };
  if (typeof error.code !== 'string' || typeof error.message !== 'string' || error.message.length === 0) return undefined;
  return { code: error.code, message: error.message };
}

async function request<T>(path: string, init: RequestInit, parser: (payload: unknown) => T): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    ...init,
  });

  const payload = await response.json();
  const failure = readFailure(payload);
  if (failure) {
    throw new ApiClientError(failure.code, failure.message);
  }

  return parser(payload);
}

export function getHealth(): Promise<HealthResponse> {
  return request('/api/health', { method: 'GET' }, (payload) => healthResponseSchema.parse(payload));
}

export function getAuthStatus(): Promise<AuthStatusResponse> {
  return request('/api/auth/me', { method: 'GET' }, (payload) => authStatusResponseSchema.parse(payload));
}

export function login(password: string): Promise<AuthStatusResponse> {
  const body = authLoginRequestSchema.parse({ password });
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  }, (payload) => authStatusResponseSchema.parse(payload));
}

export function logout(): Promise<AuthStatusResponse> {
  return request('/api/auth/logout', { method: 'POST' }, (payload) => authStatusResponseSchema.parse(payload));
}

export function getInstances(): Promise<ListInstancesResponse> {
  return request('/api/instances', { method: 'GET' }, (payload) => listInstancesResponseSchema.parse(payload));
}

export function getHostPathRoots(): Promise<HostPathRootsResponse> {
  return request('/api/host-paths/roots', { method: 'GET' }, (payload) => hostPathRootsResponseSchema.parse(payload));
}

export function getHostPathList(path: string): Promise<HostPathListResponse> {
  return request(`/api/host-paths/list?path=${encodeURIComponent(path)}`, { method: 'GET' }, (payload) => hostPathListResponseSchema.parse(payload));
}

export function createInstance(input: CreateInstanceRequest): Promise<CreateInstanceResponse> {
  const body = createInstanceRequestSchema.parse(input);
  return request('/api/instances', {
    method: 'POST',
    body: JSON.stringify(body),
  }, (payload) => createInstanceResponseSchema.parse(payload));
}

export function controlInstanceLifecycle(id: string, action: LifecycleAction): Promise<LifecycleInstanceResponse> {
  return request(`/api/instances/${encodeURIComponent(id)}/actions/${action}`, {
    method: 'POST',
  }, (payload) => lifecycleInstanceResponseSchema.parse(payload));
}
