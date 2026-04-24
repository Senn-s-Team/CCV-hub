# [INPUT]: 依赖 ccv-hub workspace 的 Bun 依赖安装与 hub-web 构建产物，依赖 nginx 作为静态站运行时
# [OUTPUT]: 对外提供 ccv-hub hub-web 的静态站镜像，包含 dist 资源与 /api 反向代理配置
# [POS]: hub-web 的容器化入口，负责把 Vite 构建结果固化为 Dokploy 可部署镜像
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
COPY apps/hub-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/hub-web/dist /usr/share/nginx/html
EXPOSE 80
