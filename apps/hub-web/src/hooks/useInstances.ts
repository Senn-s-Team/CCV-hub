/**
 * [INPUT]: 依赖 React Query 的 useQuery，依赖 client.ts 的实例读取接口
 * [OUTPUT]: 对外提供 useInstances hook 与后台降频轮询策略
 * [POS]: hub-web 的实例列表数据入口，负责固定轮询节奏与页面状态来源
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useQuery } from '@tanstack/react-query';
import type { Instance } from '@ccv-hub/shared-contracts';
import { getInstances } from '../api/client.js';

function getRefetchInterval(): number {
  if (typeof document === 'undefined') {
    return 2000;
  }
  return document.visibilityState === 'visible' ? 2000 : 7000;
}

export function useInstances() {
  return useQuery<{ instances: Instance[] }>({
    queryKey: ['instances'],
    queryFn: async () => {
      const response = await getInstances();
      if (!response.ok) {
        throw new Error(response.error.message);
      }
      return response.data;
    },
    refetchInterval: getRefetchInterval,
    retry: false,
  });
}
