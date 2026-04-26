# hooks/
> L2 | 父级: ../CLAUDE.md

成员清单
useInstances.ts: 实例列表 query，封装 GET /api/instances 与前后台轮询节奏
useLaunchInstance.ts: 启动实例 mutation，封装 POST /api/instances、启动后列表失效与错误向上传递
useInstanceLifecycle.ts: 实例生命周期 mutation，封装 stop 与 force-stop 动作、成功后列表失效与错误向上传递

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
