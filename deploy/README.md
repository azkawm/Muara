# Deploying Muara to the VPS

Target: `muara.willian.asia` (frontend) and `api.muara.willian.asia` (backend), both → 202.10.42.3.
Two containers: `web` (Caddy: static frontend on the first host, reverse proxy to the backend on the
second, automatic HTTPS for both) and `backend` (prices, keeper, indexer, faucet).

## One-time VPS setup (Ubuntu/Debian)

```bash
# Docker Engine + compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# Ports 80 and 443 must be free for Caddy. Check what holds them:
sudo ss -ltnp | grep -E ':80 |:443 '
# e.g. nginx:  sudo systemctl disable --now nginx

git clone https://github.com/azkawm/Muara.git ~/muara && cd ~/muara
cp deploy/.env.example deploy/.env
nano deploy/.env      # keys, RPC URLs, DOMAIN
```

## Start / update

```bash
cd ~/muara && git pull
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f backend
```

Caddy requests the certificate on first start; the site is live within a minute of DNS
resolving. The backend backfills history from the deploy block on first run.

## Checks

```bash
curl https://api.muara.willian.asia/api/health
curl https://api.muara.willian.asia/api/price
```

## Admin from your laptop

```bash
BACKEND_URL=https://api.muara.willian.asia pnpm --filter @muara/backend admin status
BACKEND_URL=https://api.muara.willian.asia pnpm --filter @muara/backend admin target 190
```

## Full demo reset

Redeploy the hub (`pnpm --filter @muara/contracts redeploy:hub`), commit the new
`packages/shared/deployments`, then on the VPS: `git pull`, remove the old index
(`docker compose -f deploy/docker-compose.yml down -v`) and `up -d --build`.
