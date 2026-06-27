# src/
> L2 | 父级: ../CLAUDE.md

成员清单
api/: Hub API 客户端目录，负责实例列表读取、启动请求与生命周期控制封装
components/: React 组件目录，负责登录守门、实例卡片、启动弹窗与 Toast 展示
hooks/: React Query hooks 目录，负责实例轮询、启动 mutation 与生命周期 mutation
pages/: 页面目录，负责总览页状态编排与用户动作入口
test/: Vitest 测试目录，负责总览页交互与 Vite 代理分流回归测试
styles/: 分层样式目录，负责主题 token、基础规则、鉴权页、控件、工作台、启动弹窗、响应式与 redesign 覆盖层
App.tsx: hub-web 根组件，负责挂载鉴权守门层与页面入口
main.tsx: React DOM 启动入口，负责把 App 挂载到页面根节点
styles.css: 全局样式入口，按 token、base、component、responsive、redesign 顺序聚合 src/styles/ 模块

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
