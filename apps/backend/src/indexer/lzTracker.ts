import { deliveryStatusFromScan, type LzScanMessage } from "@muara/shared";
import { and, eq, gt, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { deliveries } from "../db/schema.js";
import type { Logger } from "../lib/log.js";

const PENDING = ["sent", "verified"];
/** Stop chasing deliveries that never resolve after a day. */
const GIVE_UP_MS = 24 * 60 * 60 * 1000;

/** Follows pending deliveries on LayerZero Scan: sent, then verified, then delivered or failed. */
export class LzTracker {
  constructor(
    private readonly db: Db,
    private readonly apiBase: string,
    private readonly log: Logger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async tick(): Promise<void> {
    const pending = await this.db
      .select()
      .from(deliveries)
      .where(and(inArray(deliveries.status, PENDING), gt(deliveries.createdAt, Date.now() - GIVE_UP_MS)))
      .all();
    const txHashes = [...new Set(pending.map((d) => d.txHash))];

    for (const txHash of txHashes) {
      const messages = await this.fetchMessages(txHash);
      for (const delivery of pending.filter((d) => d.txHash === txHash)) {
        const message = messages.find((m) => m.guid?.toLowerCase() === delivery.guid.toLowerCase());
        const status = deliveryStatusFromScan(message);
        const dstTxHash = message?.destination?.tx?.txHash ?? null;
        if (status === delivery.status && dstTxHash === delivery.dstTxHash) continue;

        await this.db
          .update(deliveries)
          .set({ status, dstTxHash, updatedAt: Date.now() })
          .where(eq(deliveries.guid, delivery.guid));
        this.log.info({ guid: delivery.guid, status }, "delivery status changed");
      }
    }
  }

  private async fetchMessages(txHash: string): Promise<LzScanMessage[]> {
    const res = await this.fetchImpl(`${this.apiBase}/messages/tx/${txHash}`);
    // Scan answers 404 until it has seen the source transaction.
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`LayerZero Scan ${res.status} for ${txHash}`);
    const body = (await res.json()) as { data?: LzScanMessage[] };
    return body.data ?? [];
  }
}
