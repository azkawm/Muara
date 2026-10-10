import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Decoded hub events, one row per log. Addresses are lowercase. */
export const events = sqliteTable(
  "events",
  {
    /** `${txHash}:${logIndex}` */
    id: text("id").primaryKey(),
    blockNumber: integer("block_number").notNull(),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull(),
    timestamp: integer("timestamp").notNull(),
    /** Emitting contract: pool, shortModule or rewardsModule. */
    source: text("source").notNull(),
    name: text("name").notNull(),
    /** The user the event is about, used for history lookups. */
    account: text("account"),
    asset: text("asset"),
    amount: text("amount"),
    dstEid: integer("dst_eid"),
    /** Full decoded args as JSON, bigints as strings. */
    args: text("args").notNull(),
  },
  (t) => [index("events_account_idx").on(t.account), index("events_tx_idx").on(t.txHash), index("events_name_idx").on(t.name)],
);

/** LayerZero deliveries leaving the hub, tracked until delivered or failed. */
export const deliveries = sqliteTable(
  "deliveries",
  {
    guid: text("guid").primaryKey(),
    txHash: text("tx_hash").notNull(),
    asset: text("asset").notNull(),
    recipient: text("recipient").notNull(),
    amount: text("amount").notNull(),
    dstEid: integer("dst_eid").notNull(),
    status: text("status").notNull(),
    dstTxHash: text("dst_tx_hash"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("deliveries_tx_idx").on(t.txHash), index("deliveries_status_idx").on(t.status)],
);

/** Last indexed block per log source. */
export const cursors = sqliteTable("cursors", {
  name: text("name").primaryKey(),
  block: integer("block").notNull(),
});

/** Oracle price updates, one row per PriceUpdated log, for the price chart. */
export const prices = sqliteTable(
  "prices",
  {
    id: text("id").primaryKey(),
    asset: text("asset").notNull(),
    /** WAD USD as a decimal string. */
    price: text("price").notNull(),
    timestamp: integer("timestamp").notNull(),
    blockNumber: integer("block_number").notNull(),
  },
  (t) => [index("prices_asset_time_idx").on(t.asset, t.timestamp)],
);

/** One faucet preparation per wallet per cooldown window. */
export const faucetClaims = sqliteTable("faucet_claims", {
  address: text("address").primaryKey(),
  claimedAt: integer("claimed_at").notNull(),
});
