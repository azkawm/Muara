import { muaraPoolAbi, rewardsModuleAbi, shortModuleAbi } from "@muara/shared";
import { parseEventLogs, type Address, type Log } from "viem";
import { hub } from "../chain/contracts.js";
import { toJson } from "../lib/units.js";

export type EventSource = "pool" | "shortModule" | "rewardsModule";

export const SOURCES: Record<EventSource, Address> = {
  pool: hub.pool.address,
  shortModule: hub.shortModule.address,
  rewardsModule: hub.rewardsModule.address,
};

const ABI = [...muaraPoolAbi, ...shortModuleAbi, ...rewardsModuleAbi];

/** User-facing events kept in history. Reserve bookkeeping like ReserveUpdated is skipped. */
export const INDEXED_EVENTS = new Set([
  "Supply",
  "Withdraw",
  "Borrow",
  "Repay",
  "LendableSet",
  "Liquidation",
  "RewardsClaimed",
  "CrossChainDelivery",
  "ShortOpened",
  "ShortClosed",
  "RewardsPaidInUsdc",
]);

export interface EventRow {
  id: string;
  blockNumber: number;
  txHash: string;
  logIndex: number;
  timestamp: number;
  source: EventSource;
  name: string;
  account: string | null;
  asset: string | null;
  amount: string | null;
  dstEid: number | null;
  args: string;
}

export interface DecodedEvent {
  name: string;
  args: Record<string, unknown>;
  log: Log;
}

export function decodeLogs(logs: Log[]): DecodedEvent[] {
  return parseEventLogs({ abi: ABI, logs, strict: false })
    .filter((e) => INDEXED_EVENTS.has(e.eventName))
    .map((e) => ({ name: e.eventName, args: e.args as Record<string, unknown>, log: e }));
}

const lower = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : null);
const str = (v: unknown) => (typeof v === "bigint" ? v.toString() : null);
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : null);

/** Which user an event belongs to, plus the headline asset and amount for the history list. */
export function summarize(name: string, a: Record<string, unknown>) {
  switch (name) {
    case "Supply":
      return { account: lower(a.onBehalfOf), asset: lower(a.asset), amount: str(a.amount), dstEid: null };
    case "Withdraw":
    case "Borrow":
      return { account: lower(a.user), asset: lower(a.asset), amount: str(a.amount), dstEid: num(a.dstEid) };
    case "Repay":
    case "LendableSet":
      return { account: lower(a.user), asset: lower(a.asset), amount: str(a.amount), dstEid: null };
    case "RewardsClaimed":
      return { account: lower(a.user), asset: lower(a.asset), amount: str(a.amount), dstEid: num(a.dstEid) };
    case "Liquidation":
      return { account: lower(a.user), asset: lower(a.collateralAsset), amount: str(a.collateralSeized), dstEid: null };
    case "CrossChainDelivery":
      return { account: lower(a.to), asset: lower(a.asset), amount: str(a.amount), dstEid: num(a.dstEid) };
    case "ShortOpened":
      return { account: lower(a.user), asset: lower(a.asset), amount: str(a.stockAmount), dstEid: null };
    case "ShortClosed":
      return { account: lower(a.user), asset: lower(a.asset), amount: str(a.stockRepaid), dstEid: null };
    case "RewardsPaidInUsdc":
      return { account: lower(a.user), asset: lower(a.asset), amount: str(a.usdcPaid), dstEid: num(a.dstEid) };
    default:
      return { account: null, asset: null, amount: null, dstEid: null };
  }
}

export function sourceOf(address: Address): EventSource | undefined {
  const a = address.toLowerCase();
  return (Object.keys(SOURCES) as EventSource[]).find((s) => SOURCES[s].toLowerCase() === a);
}

export function toRow(event: DecodedEvent, timestamp: number): EventRow | undefined {
  const { log } = event;
  const source = log.address ? sourceOf(log.address) : undefined;
  if (!source || log.transactionHash == null || log.logIndex == null || log.blockNumber == null) return undefined;
  return {
    id: `${log.transactionHash}:${log.logIndex}`,
    blockNumber: Number(log.blockNumber),
    txHash: log.transactionHash,
    logIndex: log.logIndex,
    timestamp,
    source,
    name: event.name,
    ...summarize(event.name, event.args),
    args: toJson(event.args),
  };
}
