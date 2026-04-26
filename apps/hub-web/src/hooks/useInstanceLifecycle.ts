/**
 * [INPUT]: 依赖 React Query 的 useMutation、shared-contracts 生命周期动作类型与 client.ts 的生命周期接口
 * [OUTPUT]: 对外提供 useInstanceLifecycle hook，处理实例生命周期动作后列表失效与错误透传
 * [POS]: hub-web 的实例控制动作入口，把卡片停止按钮和服务端生命周期 API 接到一起
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LifecycleAction } from '@ccv-hub/shared-contracts';
import { controlInstanceLifecycle } from '../api/client.js';

export function useInstanceLifecycle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: LifecycleAction }) => {
      const response = await controlInstanceLifecycle(id, action);
      if (!response.ok) {
        throw new Error(response.error.message);
      }
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['instances'] });
    },
  });
}
