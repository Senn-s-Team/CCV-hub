# src/
> L2 | 父级: ../CLAUDE.md

成员清单
index.ts: 共享契约公共出口，统一导出错误码、实例模型与响应契约
errors.ts: 错误契约模块，定义错误码 schema、ErrorCode 类型与默认错误文案
instance.ts: 实例契约模块，定义公开状态、内部状态、来源、时间戳、可停止能力与 Instance schema
response.ts: 响应契约模块，定义健康检查、鉴权、宿主机路径浏览、列表、创建、注册、注销与 stop/force-stop 生命周期响应 schema 与类型

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
