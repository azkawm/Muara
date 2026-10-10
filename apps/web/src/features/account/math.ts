import type { Market, Position } from "../markets/useMarkets";

/** Account totals in USD with optional hypothetical changes, mirroring HealthLogic. */
export interface AccountTotals {
  collateralUsd: number;
  debtUsd: number;
  borrowCapacityUsd: number;
  liquidationCapacityUsd: number;
  healthFactor: number;
}

export interface Delta {
  market: Market;
  /** Change in supplied tokens (whole units). */
  collateral?: number;
  /** Change in debt (whole units). */
  debt?: number;
}

export function accountTotals(positions: Position[], deltas: Delta[] = [], priceOverride?: { market: Market; price: number }): AccountTotals {
  const rows = new Map<string, { market: Market; collateral: number; debt: number }>();
  for (const p of positions) {
    const d = p.market.meta.decimals;
    rows.set(p.market.meta.address, {
      market: p.market,
      collateral: Number(p.collateral) / 10 ** d,
      debt: Number(p.debt) / 10 ** d,
    });
  }
  for (const delta of deltas) {
    const row = rows.get(delta.market.meta.address) ?? { market: delta.market, collateral: 0, debt: 0 };
    row.collateral = Math.max(0, row.collateral + (delta.collateral ?? 0));
    row.debt = Math.max(0, row.debt + (delta.debt ?? 0));
    rows.set(delta.market.meta.address, row);
  }

  const t: AccountTotals = { collateralUsd: 0, debtUsd: 0, borrowCapacityUsd: 0, liquidationCapacityUsd: 0, healthFactor: Infinity };
  for (const { market, collateral, debt } of rows.values()) {
    const price = priceOverride && priceOverride.market.meta.address === market.meta.address ? priceOverride.price : market.price;
    const cv = collateral * price;
    t.collateralUsd += cv;
    t.debtUsd += debt * price;
    t.borrowCapacityUsd += cv * market.ltv;
    t.liquidationCapacityUsd += cv * market.liquidationThreshold;
  }
  t.healthFactor = t.debtUsd > 0 ? t.liquidationCapacityUsd / t.debtUsd : Infinity;
  return t;
}

/**
 * Price of `market` at which the account's health factor reaches 1, holding everything else
 * constant. Works for shorts (debt in the asset) and longs (collateral in the asset).
 */
export function liquidationPrice(positions: Position[], market: Market, deltas: Delta[] = []): number | undefined {
  const at = (price: number) => accountTotals(positions, deltas, { market, price });
  // Health factor is monotonic in the price of one asset, so bisect over a wide range.
  let lo = market.price / 100;
  let hi = market.price * 100;
  const hfLo = at(lo).healthFactor;
  const hfHi = at(hi).healthFactor;
  if ((hfLo - 1) * (hfHi - 1) > 0) return undefined;
  const rising = hfHi > hfLo;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const hf = at(mid).healthFactor;
    if ((hf > 1) === rising) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}
