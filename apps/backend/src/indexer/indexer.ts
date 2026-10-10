import { HUB_CONTRACTS } from "@muara/shared";
import { eq } from "drizzle-orm";
import type { BaseClient } from "../chain/clients.js";
import type { Db } from "../db/client.js";
import { cursors, deliveries, events, prices } from "../db/schema.js";
import type { Logger } from "../lib/log.js";
import { decodeLogs, SOURCES, toRow, type EventRow } from "./decode.js";
import { mockPriceOracleAbi } from "@muara/shared";
import { parseEventLogs } from "viem";
import { hub } from "../chain/contracts.js";

const CURSOR = "hub";

/**
 * Polls hub logs into SQLite. Every user-facing event becomes a history row, and every
 * CrossChainDelivery starts a delivery the LayerZero tracker follows to completion.
 */
export class Indexer {
  private lastBlock = 0;

  constructor(
    private readonly client: BaseClient,
    private readonly db: Db,
    private chunk: number,
    private readonly log: Logger,
  ) {}

  get indexedBlock() {
    return this.lastBlock;
  }

  async tick(): Promise<void> {
    await this.ensurePriceHistory();
    const from = (await this.cursor()) + 1;
    const head = Number(await this.client.getBlockNumber());
    if (from > head) return;

    let start = from;
    while (start <= head) {
      const end = Math.min(start + this.chunk - 1, head);
      let count: number;
      try {
        count = await this.indexRange(start, end);
      } catch (err) {
        // Public RPCs cap eth_getLogs ranges (Base Sepolia: 200 blocks). Adopt the cap and retry.
        const limit = rangeLimit(err);
        if (limit === undefined || limit >= this.chunk) throw err;
        this.log.warn({ chunk: limit }, "RPC limits log range, shrinking chunk");
        this.chunk = limit;
        continue;
      }
      await this.setCursor(end);
      if (count) this.log.info({ from: start, to: end, events: count }, "indexed events");
      start = end + 1;
    }
  }

  /** Blocks indexed before the prices table existed are scanned once for oracle updates. */
  private async ensurePriceHistory(): Promise<void> {
    if (this.pricesChecked) return;
    this.pricesChecked = true;
    const existing = await this.db.select({ id: prices.id }).from(prices).limit(1).all();
    const last = await this.cursor();
    if (existing.length || last < HUB_CONTRACTS.deployedAtBlock) return;
    this.log.info({ from: HUB_CONTRACTS.deployedAtBlock, to: last }, "backfilling oracle price history");
    let start = HUB_CONTRACTS.deployedAtBlock;
    while (start <= last) {
      const end = Math.min(start + this.chunk - 1, last);
      try {
        await this.indexRange(start, end, true);
      } catch (err) {
        const limit = rangeLimit(err);
        if (limit === undefined || limit >= this.chunk) throw err;
        this.chunk = limit;
        continue;
      }
      start = end + 1;
    }
  }

  private pricesChecked = false;

  private async indexRange(fromBlock: number, toBlock: number, pricesOnly = false): Promise<number> {
    const logs = await this.client.getLogs({
      address: pricesOnly ? [hub.oracle.address] : [...Object.values(SOURCES), hub.oracle.address],
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(toBlock),
    });
    const decoded = decodeLogs(logs);
    const priceLogs = parseEventLogs({ abi: mockPriceOracleAbi, logs, eventName: "PriceUpdated" });
    if (!decoded.length && !priceLogs.length) return 0;

    const timestamps = await this.blockTimestamps([...decoded, ...priceLogs].map((d) => ("log" in d ? d.log : d).blockNumber!));
    if (priceLogs.length) {
      await this.db
        .insert(prices)
        .values(
          priceLogs.map((l) => ({
            id: `${l.transactionHash}:${l.logIndex}`,
            asset: l.args.asset.toLowerCase(),
            price: l.args.price.toString(),
            timestamp: Number(l.args.updatedAt),
            blockNumber: Number(l.blockNumber),
          })),
        )
        .onConflictDoNothing();
    }
    if (!decoded.length) return priceLogs.length;
    const rows = decoded
      .map((d) => toRow(d, timestamps.get(d.log.blockNumber!)!))
      .filter((r): r is EventRow => r !== undefined);

    await this.db.insert(events).values(rows).onConflictDoNothing();
    await this.recordDeliveries(rows);
    return rows.length;
  }

  private async recordDeliveries(rows: EventRow[]) {
    const now = Date.now();
    const sent = rows
      .filter((r) => r.name === "CrossChainDelivery")
      .map((r) => {
        const args = JSON.parse(r.args) as { guid: string };
        return {
          guid: args.guid,
          txHash: r.txHash,
          asset: r.asset!,
          recipient: r.account!,
          amount: r.amount!,
          dstEid: r.dstEid!,
          status: "sent",
          createdAt: r.timestamp * 1000,
          updatedAt: now,
        };
      });
    if (sent.length) await this.db.insert(deliveries).values(sent).onConflictDoNothing();
  }

  private async blockTimestamps(blocks: bigint[]): Promise<Map<bigint, number>> {
    const unique = [...new Set(blocks)];
    const results = await Promise.all(unique.map((n) => this.client.getBlock({ blockNumber: n })));
    return new Map(results.map((b) => [b.number, Number(b.timestamp)]));
  }

  private async cursor(): Promise<number> {
    if (this.lastBlock) return this.lastBlock;
    const row = await this.db.select().from(cursors).where(eq(cursors.name, CURSOR)).get();
    this.lastBlock = row?.block ?? HUB_CONTRACTS.deployedAtBlock - 1;
    return this.lastBlock;
  }

  private async setCursor(block: number) {
    await this.db
      .insert(cursors)
      .values({ name: CURSOR, block })
      .onConflictDoUpdate({ target: cursors.name, set: { block } });
    this.lastBlock = block;
  }
}

export function rangeLimit(err: unknown): number | undefined {
  const text = err instanceof Error ? `${err.message} ${(err as { details?: string }).details ?? ""}` : String(err);
  // Public Base RPC: "limited to a 200 range". Alchemy free tier: "up to a 10 block range".
  const match =
    /(?:limited to|up to) a (\d+) (?:block )?range/i.exec(text) ?? /range (?:is )?limited to (\d+)/i.exec(text);
  return match ? Number(match[1]) : undefined;
}
