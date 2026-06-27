# launch/
> L2 | 父级: ../CLAUDE.md

成员清单
LaunchPathPicker.tsx: 启动路径浏览组件，渲染 Finder column 桌面路径选择与移动端点击进入的 drill-in 路径选择
LaunchPathStep.tsx: 启动路径步骤组件，按浏览宿主机目录、最近路径、粘贴绝对路径的优先级渲染路径页
LaunchOptions.tsx: 启动参数组件，默认渲染启动模式与权限开关，在高级设置中渲染模型与初始提示词
LaunchWizardFooter.tsx: 启动底部动作组件，渲染两段式 sticky 提交栏、路径阻断与提交错误
MobileLaunchFlow.tsx: 启动流程组件，渲染跨端路径/参数两段式 step rail
RecentPaths.tsx: 最近路径组件，渲染默认收敛、按需展开并可删除的项目路径列表
launch-dialog-utils.ts: 启动弹窗工具模块，封装最近路径存储、移动断点判断与路径展示派生函数
useLaunchDraft.ts: 启动草稿 hook，封装路径、参数、权限、最近路径与提交派生数据
useLaunchPathBrowser.ts: 启动路径浏览 hook，封装 roots、columns、搜索、加载、错误与宿主机目录读取动作

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
