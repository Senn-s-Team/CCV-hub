# Kubernetes 部署

Kubernetes 模式只承载 `ccv-hub-web` 控制面。`ccv-hub-agent` 继续运行在目标节点宿主机。

## 1. 拓扑

```text
Kubernetes Ingress
  |
  v
ccv-hub-web Deployment / Service
  |
  v
Node reachable ccv-hub-agent
  |
  v
Host cc-viewer process
```

Kubernetes 负责 Web image、Service 和 Ingress。Agent 需要访问宿主机 Claude 配置、项目路径和 `cc-viewer` CLI，因此默认保持节点 systemd。

## 2. 使用的模板

- `deploy/kubernetes-web.yaml`
- `deploy/.env.agent.example`

## 3. 必填配置

Web Pod 环境变量：

```env
CCV_HUB_AGENT_UPSTREAM=http://node-agent.example.internal:4318
CCV_HUB_PUBLIC_PROTOCOL=https
CCV_HUB_PUBLIC_HOST=hub.example.com
CCV_HUB_PUBLIC_DOMAIN=example.com
CCV_HUB_PUBLIC_DOMAIN_REGEX=example\.com
CCV_HUB_VIEWER_SUBDOMAIN_PREFIX=ccv-
```

Ingress 需要同时覆盖：

```text
hub.example.com
ccv-*.example.com
```

## 4. 节点约束

Web 控制的 Agent 必须与目标宿主机绑定。可选策略：

- 单节点集群直接指向该节点 Agent。
- 固定 `nodeSelector`，让 Web Pod 调度到 Agent 所在节点。
- 用内部 DNS 指向目标节点 Agent。

DaemonSet Agent 属于高级模式，需要额外解决 Claude 配置、项目目录、CLI 版本、路径授权和停止语义。

## 5. 验证

```bash
kubectl apply --dry-run=client -f deploy/kubernetes-web.yaml
kubectl rollout status deployment/ccv-hub-web
curl -fsS https://hub.example.com/api/health
```

Smoke path：

1. Ingress 打开 Hub 首页。
2. Web Pod 能访问 `CCV_HUB_AGENT_UPSTREAM`。
3. `/api/instances` 返回目标节点实例。
4. viewer wildcard 域名经 Ingress 到达 Web，再到 Agent bridge。
5. SSE 与 WebSocket 通过 Ingress 控制器。
