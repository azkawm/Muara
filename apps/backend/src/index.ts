import { serve } from "@hono/node-server";
import { createApp, type AppContext } from "./api/app.js";
import { createChainClients } from "./chain/clients.js";
import { loadConfig, loadEnvFiles } from "./config/env.js";
import { openDb } from "./db/client.js";
import { Faucet } from "./api/faucet.js";
import { Indexer } from "./indexer/indexer.js";
import { LzTracker } from "./indexer/lzTracker.js";
import { Keeper } from "./keeper/keeper.js";
import { createLogger } from "./lib/log.js";
import { startLoop, type Loop } from "./lib/loop.js";
import { parseUsd } from "./lib/units.js";
import { PriceRunner } from "./prices/runner.js";

async function main() {
  loadEnvFiles();
  const config = loadConfig();
  const log = createLogger(config.LOG_LEVEL, config.LOG_PRETTY);
  const { db, close } = await openDb(config.DB_PATH);
  const chain = createChainClients(config);
  const ctx: AppContext = { config, log, db, chain };
  const loops: Loop[] = [];

  if (config.MODULES.has("indexer")) {
    ctx.indexer = new Indexer(chain.base, db, config.LOG_CHUNK_BLOCKS, log.child({ module: "indexer" }));
    loops.push(startLoop("indexer", config.INDEXER_INTERVAL_MS, () => ctx.indexer!.tick(), log));
    const tracker = new LzTracker(db, config.LZ_SCAN_API, log.child({ module: "lz" }));
    loops.push(startLoop("lz", config.LZ_POLL_INTERVAL_MS, () => tracker.tick(), log));
  }

  if (config.MODULES.has("prices")) {
    ctx.prices = new PriceRunner(
      chain.base,
      chain.updater,
      {
        anchor: parseUsd(config.ANCHOR_PRICE),
        durationMs: config.SCENARIO_DURATION_MS,
        steps: config.SCENARIO_STEPS,
        refreshAgeS: config.PRICE_REFRESH_AGE_S,
      },
      log.child({ module: "prices" }),
    );
    loops.push(startLoop("heartbeat", config.HEARTBEAT_INTERVAL_MS, () => ctx.prices!.heartbeat(), log));
  }

  if (config.MODULES.has("keeper")) {
    if (!ctx.indexer) throw new Error("the keeper finds borrowers through the indexer; enable both");
    const keeper = new Keeper(chain.base, chain.keeper, db, log.child({ module: "keeper" }));
    // Approvals run on the first tick so an RPC hiccup retries instead of stopping the server.
    ctx.keeper = keeper;
    loops.push(startLoop("keeper", config.KEEPER_INTERVAL_MS, () => keeper.tick(), log));
  }

  if (config.MODULES.has("faucet")) {
    ctx.faucet = new Faucet(config, db, { base: chain.base, arbitrum: chain.arbitrum }, log.child({ module: "faucet" }));
  }

  const server = serve({ fetch: createApp(ctx).fetch, port: config.PORT });
  log.info(
    { port: config.PORT, modules: [...config.MODULES], admin: config.ADMIN_ADDRESS },
    "muara backend listening",
  );

  const shutdown = async () => {
    log.info("shutting down");
    server.close();
    await Promise.all(loops.map((l) => l.stop()));
    close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
