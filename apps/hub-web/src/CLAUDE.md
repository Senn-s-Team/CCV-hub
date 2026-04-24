# src/
> L2 | 父级: ../CLAUDE.md

成员清单
api/: Hub API 客户端目录，负责实例列表读取与启动请求封装
components/: React 组件目录，负责实例卡片、启动弹窗与 Toast 展示
hooks/: React Query hooks 目录，负责实例轮询与启动 mutation
pages/: 页面目录，负责总览页状态编排与用户动作入口
test/: Vitest 测试目录，负责总览页交互与 Vite 代理分流回归测试
App.tsx: hub-web 根组件，负责挂载查询客户端与页面入口
main.tsx: React DOM 启动入口，负责把 App 挂载到页面根节点
styles.css: 全局样式表，负责页面布局、组件视觉与响应式规则

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
