/**
 * [INPUT]: 依赖父级传入的消息字符串
 * [OUTPUT]: 对外提供 Toast 组件，渲染短促操作反馈
 * [POS]: hub-web 的轻提示组件，承接 prototype 中复制与刷新反馈位置
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
type ToastProps = {
  message: string;
};

export default function Toast({ message }: ToastProps) {
  return <div className={`toast ${message ? 'show' : ''}`}>{message}</div>;
}
