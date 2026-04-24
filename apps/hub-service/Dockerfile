# [INPUT]: 依赖 ccv-hub workspace 的 Bun 依赖安装、hub-service 源码与宿主机挂载的 cc-viewer 路径
# [OUTPUT]: 对外提供可运行 hub-service 的 Bun 运行时镜像
# [POS]: hub-service 的容器化入口，负责把本地 Fastify 服务封装为 Dokploy 可部署单元
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
FROM oven/bun:1.3.10
WORKDIR /workspace

COPY package.json bun.lock tsconfig.json ./
COPY apps/hub-web/package.json ./apps/hub-web/package.json
COPY apps/hub-service/package.json ./apps/hub-service/package.json
COPY packages/shared-contracts/package.json ./packages/shared-contracts/package.json
RUN bun install

COPY apps/hub-service ./apps/hub-service
COPY packages/shared-contracts ./packages/shared-contracts

ENV CCV_HUB_HOST=0.0.0.0
ENV CCV_HUB_PORT=4318
EXPOSE 4318
CMD ["bun", "run", "apps/hub-service/src/server.ts"]
