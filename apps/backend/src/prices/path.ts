import { SCENARIOS, type ScenarioId } from "@muara/shared";

/** Target price for a scenario, relative to the anchor. Prices are WAD. */
export function scenarioTarget(id: ScenarioId, anchor: bigint): bigint {
  const pct = SCENARIOS[id].changePct;
  // Basis points keep fractional percents exact.
  return (anchor * BigInt(10_000 + Math.round(pct * 100))) / 10_000n;
}

/**
 * Evenly spaced prices from `from` (exclusive) to `to` (inclusive). The last step lands
 * exactly on `to` so the demo hits round numbers like $120.
 */
export function pricePath(from: bigint, to: bigint, steps: number): bigint[] {
  if (steps < 1) throw new Error("steps must be at least 1");
  const path: bigint[] = [];
  for (let i = 1; i <= steps; i++) path.push(from + ((to - from) * BigInt(i)) / BigInt(steps));
  return path;
}
