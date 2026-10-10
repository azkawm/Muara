import type { HistoryAction, HistoryEntry } from "../../lib/api";
import { assetByAddress, SPOKE_EID, USDC } from "../../lib/contracts";
import { formatToken, shortAddress } from "../../lib/format";

const amt = (raw: string | number | boolean | undefined | null, asset: string | null | undefined) => {
  const meta = assetByAddress(asset ?? undefined);
  if (raw === undefined || raw === null || !meta) return String(raw ?? "");
  return `${formatToken(BigInt(String(raw)), meta.decimals)} ${meta.symbol}`;
};

const usdc = (raw: string | number | boolean | undefined) => `$${formatToken(BigInt(String(raw ?? 0)), USDC.decimals, 2)}`;
const toSpoke = (dstEid: number | null) => (dstEid === SPOKE_EID ? " to Arbitrum" : "");

export function describeAction(a: HistoryAction): string {
  const g = a.args;
  switch (a.name) {
    case "Supply":
      return `Supplied ${amt(a.amount, a.asset)}${g.from && String(g.from).toLowerCase() !== String(g.onBehalfOf).toLowerCase() ? ` for ${shortAddress(String(g.onBehalfOf))}` : ""}`;
    case "Withdraw":
      return `Withdrew ${amt(a.amount, a.asset)}${toSpoke(a.dstEid)}`;
    case "Borrow":
      return `Borrowed ${amt(a.amount, a.asset)}${toSpoke(a.dstEid)}`;
    case "Repay":
      return `Repaid ${amt(a.amount, a.asset)}`;
    case "LendableSet":
      return g.lendable ? `Lending ${amt(a.amount, a.asset)} to short sellers` : `Stopped lending ${amt(a.amount, a.asset)}`;
    case "Liquidation":
      return `Liquidated: ${amt(String(g.debtRepaid), String(g.debtAsset))} repaid, ${amt(String(g.collateralSeized), String(g.collateralAsset))} seized`;
    case "RewardsClaimed":
      return `Claimed ${amt(a.amount, a.asset)} in rewards${toSpoke(a.dstEid)}`;
    case "ShortOpened":
      return `Opened short ${amt(String(g.stockAmount), a.asset)}, sold for ${usdc(g.proceeds)}`;
    case "ShortClosed": {
      const pnl = BigInt(String(g.realizedPnl ?? 0));
      const sign = pnl >= 0n ? "+" : "−";
      return `Closed short ${amt(String(g.stockRepaid), a.asset)}, P&L ${sign}${usdc(String(pnl < 0n ? -pnl : pnl))}`;
    }
    case "RewardsPaidInUsdc":
      return `Rewards paid out: ${usdc(g.usdcPaid)}${toSpoke(a.dstEid)}`;
    default:
      return a.name;
  }
}

/**
 * Headline actions for a transaction. One-click module flows (open short, claim in USDC)
 * emit several pool events; show the module's summary instead of the plumbing.
 */
export function headlineActions(entry: HistoryEntry): HistoryAction[] {
  const visible = entry.actions.filter((a) => a.name !== "CrossChainDelivery");
  const fromModules = visible.filter((a) => a.source !== "pool");
  return fromModules.length ? fromModules : visible;
}

export function isLiquidation(entry: HistoryEntry) {
  return entry.actions.some((a) => a.name === "Liquidation");
}
