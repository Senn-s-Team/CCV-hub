/**
 * [INPUT]: 依赖 AuthGate 鉴权守门层与 OverviewPage 总览页面
 * [OUTPUT]: 对外提供 App 根组件，完成登录态控制与主页面挂载
 * [POS]: hub-web 的 React 根组件，位于 QueryClientProvider 下方，收敛面板级访问控制
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import AuthGate from './components/AuthGate.js';
import OverviewPage from './pages/OverviewPage.js';

export default function App() {
  return <AuthGate>{(onLogout) => <OverviewPage onLogout={onLogout} />}</AuthGate>;
}
