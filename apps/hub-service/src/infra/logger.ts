/**
 * [INPUT]: 依赖 pino 的结构化日志能力
 * [OUTPUT]: 对外提供 createLogger，生成 hub-service 的日志实例
 * [POS]: hub-service 的基础设施层入口，为路由与启动器提供统一日志面
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import pino from 'pino';

export function createLogger() {
  return pino({
    name: 'hub-service',
    level: process.env.LOG_LEVEL ?? 'info',
  });
}
