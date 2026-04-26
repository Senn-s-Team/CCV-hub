/**
 * [INPUT]: 依赖 React Query 的 useMutation、shared-contracts 创建请求类型与 client.ts 的创建实例接口
 * [OUTPUT]: 对外提供 useLaunchInstance hook，处理启动后列表失效与错误透传
 * [POS]: hub-web 的启动动作入口，把弹窗提交和服务端创建接口接到一起
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateInstanceRequest } from '@ccv-hub/shared-contracts';
import { createInstance } from '../api/client.js';

export function useLaunchInstance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CreateInstanceRequest) => {
      const response = await createInstance(request);
      if (!response.ok) {
        throw new Error(response.error.message);
      }
      return response.data.instance;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['instances'] });
    },
  });
}
