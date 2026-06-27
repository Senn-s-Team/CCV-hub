# [INPUT]: 依赖 ccv-hub workspace 的 Bun 依赖安装、shared-contracts 构建产物、hub-web 构建产物与 nginx 官方模板渲染机制作为静态站运行时
# [OUTPUT]: 对外提供 ccv-hub hub-web 的静态站镜像，包含 dist 资源与可环境变量渲染的 /api 和 /viewer 反向代理模板
# [POS]: hub-web 的容器化入口，负责把共享契约、Vite 构建结果和 nginx 配置模板固化为可部署镜像，公网 host 由运行时环境变量注入
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
FROM oven/bun:1.3.10 AS build
WORKDIR /workspace

COPY package.json bun.lock tsconfig.json ./
COPY apps/hub-web/package.json ./apps/hub-web/package.json
COPY apps/hub-service/package.json ./apps/hub-service/package.json
COPY packages/shared-contracts/package.json ./packages/shared-contracts/package.json
RUN bun install

COPY apps/hub-web ./apps/hub-web
COPY packages/shared-contracts ./packages/shared-contracts
RUN bun run --filter hub-web build

FROM nginx:1.27-alpine
ENV CCV_HUB_AGENT_UPSTREAM=http://host.docker.internal:4318 \
    CCV_HUB_VIEWER_PATH_PREFIX=/viewer
COPY apps/hub-web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /workspace/apps/hub-web/dist /usr/share/nginx/html
EXPOSE 80
