# Build context: repo root.  docker compose -f deploy/docker-compose.yml build
FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile --filter @muara/backend...

COPY packages/tsconfig packages/tsconfig
COPY packages/shared packages/shared
COPY apps/backend apps/backend
RUN pnpm --filter @muara/backend build \
 && pnpm --filter @muara/backend deploy --legacy --prod /out

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    DB_PATH=/data/muara.sqlite \
    PORT=8787
COPY --from=build /out/package.json ./
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
COPY --from=build /out/drizzle ./drizzle
VOLUME /data
EXPOSE 8787
CMD ["node", "dist/index.js"]
