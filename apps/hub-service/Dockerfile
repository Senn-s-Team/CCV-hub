# [INPUT]: 依赖 ccv-hub workspace 的 Bun 依赖安装、hub-service 源码、shared-contracts 构建产物、Hub 插件、Node 运行时与宿主机挂载的 cc-viewer 路径
# [OUTPUT]: 对外提供运行 hub-service dist/server.js 且携带 ccv-hub-plugin.mjs 的 Agent 容器镜像
# [POS]: hub-service 的容器化入口，负责把 Fastify Agent 构建产物与 logger 发现插件封装为可部署单元
# [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
FROM node:24-bookworm-slim
WORKDIR /workspace

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl unzip ca-certificates \
  && curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local/bun bash \
  && ln -s /usr/local/bun/bin/bun /usr/local/bin/bun \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock tsconfig.json ./
COPY apps/hub-web/package.json ./apps/hub-web/package.json
COPY apps/hub-service/package.json ./apps/hub-service/package.json
COPY packages/shared-contracts/package.json ./packages/shared-contracts/package.json
RUN bun install

COPY apps/hub-service ./apps/hub-service
COPY packages/shared-contracts ./packages/shared-contracts
COPY deploy/ccv-hub-plugin.mjs ./deploy/ccv-hub-plugin.mjs
RUN bun run --filter hub-service build

ENV CCV_HUB_HOST=0.0.0.0
ENV CCV_HUB_PORT=4318
EXPOSE 4318
CMD ["sh", "-lc", "cd apps/hub-service && node dist/server.js"]
