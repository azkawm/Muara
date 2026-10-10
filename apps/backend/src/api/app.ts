import { SCENARIO_IDS, SCENARIOS } from "@muara/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, eq, gte } from "drizzle-orm";
import { isAddress } from "viem";
import { STOCK_ASSET } from "../chain/contracts.js";
import { prices } from "../db/schema.js";
import { z } from "zod";
import type { ChainClients } from "../chain/clients.js";
import type { Config } from "../config/env.js";
import type { Db } from "../db/client.js";
import type { Indexer } from "../indexer/indexer.js";
import type { Keeper } from "../keeper/keeper.js";
import type { Faucet } from "./faucet.js";
import type { Logger } from "../lib/log.js";
import { formatUsd, parseUsd, serialize } from "../lib/units.js";
import { fetchPythEquityPrice } from "../prices/pyth.js";
import { ScenarioBusyError, type PriceRunner, type ScenarioRun } from "../prices/runner.js";
import { adminAuth } from "./adminAuth.js";
import { loadHistory } from "./history.js";

export interface AppContext {
  config: Config;
  log: Logger;
  db: Db;
  chain: ChainClients;
  prices?: PriceRunner;
  keeper?: Keeper;
  indexer?: Indexer;
  faucet?: Faucet;
}

const usdString = z.string().regex(/^\d+(\.\d{1,18})?$/, "expected a USD amount like 150 or 187.5");
const scenarioBody = z.union([
  z.object({ scenario: z.enum(SCENARIO_IDS as [string, ...string[]]) }),
  z.object({ target: usdString }),
]);
const priceBody = z.object({ price: usdString });
const anchorBody = z.union([z.object({ price: usdString }), z.object({ source: z.literal("pyth") })]);

function scenarioView(run: ScenarioRun | undefined) {
  if (!run) return null;
  return {
    id: run.id,
    status: run.status,
    from: formatUsd(run.from),
    to: formatUsd(run.to),
    step: run.step,
    steps: run.path.length,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt ?? null,
    error: run.error ?? null,
    txHashes: run.txHashes,
  };
}

export function createApp(ctx: AppContext): Hono {
  const { config, log, db, chain } = ctx;
  const app = new Hono();

  app.use("/api/*", cors({ origin: config.CORS_ORIGINS, allowHeaders: ["content-type", "x-admin-address", "x-admin-timestamp", "x-admin-signature"] }));

  app.onError((err, c) => {
    if (err instanceof ScenarioBusyError) return c.json({ error: err.message }, 409);
    if (err instanceof z.ZodError) return c.json({ error: "invalid request body", issues: err.issues }, 400);
    if (err instanceof SyntaxError) return c.json({ error: "request body must be JSON" }, 400);
    log.error({ err, path: c.req.path }, "request failed");
    return c.json({ error: err.message }, 500);
  });

  app.get("/api/health", async (c) => {
    const [block, updaterBalance, keeperBalance] = await Promise.all([
      chain.base.getBlockNumber(),
      chain.base.getBalance({ address: chain.updater.account.address }),
      chain.base.getBalance({ address: chain.keeper.account.address }),
    ]);
    return c.json(
      serialize({
        ok: true,
        block,
        modules: [...config.MODULES],
        indexedBlock: ctx.indexer?.indexedBlock ?? null,
        updater: { address: chain.updater.account.address, balanceWei: updaterBalance },
        keeper: { address: chain.keeper.account.address, balanceWei: keeperBalance },
      }),
    );
  });

  app.get("/api/price", async (c) => {
    const prices = requirePrices(ctx);
    const { price, updatedAt } = await prices.readPrice();
    return c.json({
      asset: "NVDA",
      price: formatUsd(price),
      updatedAt: Number(updatedAt),
      ageSeconds: Math.floor(Date.now() / 1000) - Number(updatedAt),
      anchor: formatUsd(prices.anchorPrice),
      scenario: scenarioView(prices.scenario),
    });
  });

  app.get("/api/scenarios", (c) => c.json({ scenarios: Object.values(SCENARIOS) }));

  /** Oracle price points for the chart, oldest first. `minutes` caps the window (default 120). */
  app.get("/api/price/history", async (c) => {
    const minutes = Math.min(Number(c.req.query("minutes") ?? 120) || 120, 24 * 60);
    const since = Math.floor(Date.now() / 1000) - minutes * 60;
    const rows = await db
      .select({ timestamp: prices.timestamp, price: prices.price })
      .from(prices)
      .where(and(eq(prices.asset, STOCK_ASSET.toLowerCase()), gte(prices.timestamp, since)))
      .orderBy(prices.timestamp)
      .all();
    return c.json({ points: rows.map((r) => ({ time: r.timestamp, value: formatUsd(BigInt(r.price)) })) });
  });

  app.get("/api/history/:address", async (c) => {
    const address = c.req.param("address");
    if (!isAddress(address)) return c.json({ error: "invalid address" }, 400);
    const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 200);
    return c.json({ address, entries: await loadHistory(db, address, limit) });
  });

  app.get("/api/activity", async (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? 30) || 30, 200);
    return c.json({ entries: await loadHistory(db, undefined, limit) });
  });

  app.get("/api/faucet/:address", async (c) => {
    const address = c.req.param("address");
    if (!isAddress(address)) return c.json({ error: "invalid address" }, 400);
    if (!ctx.faucet) return c.json({ error: "faucet disabled" }, 503);
    return c.json({ funder: ctx.faucet.address, gasEth: config.FAUCET_GAS_ETH, ...(await ctx.faucet.status(address)) });
  });

  /** Allowlist a wallet on both chains and top up its gas. The user mints tokens themselves afterwards. */
  app.post("/api/faucet", async (c) => {
    if (!ctx.faucet) return c.json({ error: "faucet disabled" }, 503);
    const body = z.object({ address: z.string() }).parse(await c.req.json());
    if (!isAddress(body.address)) return c.json({ error: "invalid address" }, 400);
    try {
      return c.json(await ctx.faucet.prepare(body.address));
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 429) return c.json({ error: (err as Error).message }, 429);
      throw err;
    }
  });

  app.get("/api/keeper", (c) => {
    const keeper = ctx.keeper;
    if (!keeper) return c.json({ error: "keeper module disabled" }, 503);
    return c.json(
      serialize({
        address: keeper.address,
        tracked: keeper.trackedCount,
        atRisk: keeper.atRisk,
        recent: keeper.recentActions,
      }),
    );
  });

  const admin = new Hono();
  admin.use(adminAuth({ admin: config.ADMIN_ADDRESS }));

  admin.post("/scenario", async (c) => {
    const prices = requirePrices(ctx);
    const body = scenarioBody.parse(await c.req.json());
    const run =
      "scenario" in body
        ? await prices.startScenario(body.scenario as (typeof SCENARIO_IDS)[number])
        : await prices.startCustom(parseUsd(body.target));
    return c.json({ scenario: scenarioView(run) }, 202);
  });

  admin.post("/price", async (c) => {
    const prices = requirePrices(ctx);
    const { price } = priceBody.parse(await c.req.json());
    return c.json({ scenario: scenarioView(await prices.setNow(parseUsd(price))) }, 202);
  });

  admin.post("/anchor", async (c) => {
    const prices = requirePrices(ctx);
    const body = anchorBody.parse(await c.req.json());
    const anchor = "price" in body ? parseUsd(body.price) : await fetchPythEquityPrice(config.HERMES_URL, "NVDA", config.HERMES_API_KEY);
    prices.setAnchor(anchor);
    return c.json({ anchor: formatUsd(anchor) });
  });

  app.route("/api/admin", admin);
  return app;
}

function requirePrices(ctx: AppContext): PriceRunner {
  if (!ctx.prices) throw new Error("prices module disabled");
  return ctx.prices;
}
