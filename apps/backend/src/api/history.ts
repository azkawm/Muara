import { lzScanTxUrl } from "@muara/shared";
import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { deliveries, events } from "../db/schema.js";

export interface HistoryEntry {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  actions: {
    name: string;
    source: string;
    account: string | null;
    asset: string | null;
    amount: string | null;
    dstEid: number | null;
    args: Record<string, unknown>;
  }[];
  deliveries: {
    guid: string;
    asset: string;
    recipient: string;
    amount: string;
    dstEid: number;
    status: string;
    dstTxHash: string | null;
    lzScanUrl: string;
  }[];
}

/** Transactions touching `account` (or every account when omitted), newest first, with delivery status. */
export async function loadHistory(db: Db, account: string | undefined, limit: number): Promise<HistoryEntry[]> {
  const base = db.selectDistinct({ txHash: events.txHash, blockNumber: events.blockNumber }).from(events);
  const txs = await (account ? base.where(eq(events.account, account.toLowerCase())) : base)
    .orderBy(desc(events.blockNumber))
    .limit(limit)
    .all();
  if (!txs.length) return [];

  const hashes = txs.map((t) => t.txHash);
  const [rows, sent] = await Promise.all([
    db.select().from(events).where(inArray(events.txHash, hashes)).orderBy(events.logIndex).all(),
    db.select().from(deliveries).where(inArray(deliveries.txHash, hashes)).all(),
  ]);

  return txs.map(({ txHash, blockNumber }) => {
    const actions = rows.filter((r) => r.txHash === txHash);
    return {
      txHash,
      blockNumber,
      timestamp: actions[0]?.timestamp ?? 0,
      actions: actions.map((r) => ({
        name: r.name,
        source: r.source,
        account: r.account,
        asset: r.asset,
        amount: r.amount,
        dstEid: r.dstEid,
        args: JSON.parse(r.args) as Record<string, unknown>,
      })),
      deliveries: sent
        .filter((d) => d.txHash === txHash)
        .map((d) => ({
          guid: d.guid,
          asset: d.asset,
          recipient: d.recipient,
          amount: d.amount,
          dstEid: d.dstEid,
          status: d.status,
          dstTxHash: d.dstTxHash,
          lzScanUrl: lzScanTxUrl(d.txHash),
        })),
    };
  });
}
