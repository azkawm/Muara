# Build context: repo root. Builds the frontend and serves it from Caddy, which also
# terminates TLS for the domain and proxies /api to the backend container.
FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @muara/web...

COPY packages/tsconfig packages/tsconfig
COPY packages/shared packages/shared
COPY apps/web apps/web
# Browser-side config is baked in at build time (Vite only exposes VITE_*).
ARG VITE_API_URL=https://api.muara.willian.asia/api
ARG VITE_BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
ARG VITE_ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
ARG VITE_WALLETCONNECT_PROJECT_ID=
RUN pnpm --filter @muara/web exec vite build

FROM caddy:2
# deploy/Caddyfile terminates TLS itself; deploy/Caddyfile.proxied sits behind host nginx.
ARG CADDYFILE=deploy/Caddyfile
COPY ${CADDYFILE} /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
