import { formatUnits, parseUnits } from "viem";

const WAD_DECIMALS = 18;

/** USD from a WAD value. Compact above $1M. */
export function formatUsd(wad: bigint | undefined, { compact = false }: { compact?: boolean } = {}): string {
  if (wad === undefined) return "$0.00";
  const n = Number(formatUnits(wad, WAD_DECIMALS));
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact && Math.abs(n) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 2,
  }).format(n);
}

/** Token amount with a sensible number of fraction digits. */
export function formatToken(amount: bigint | undefined, decimals: number, maxFraction = 4): string {
  if (amount === undefined) return "0";
  const n = Number(formatUnits(amount, decimals));
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: n !== 0 && Math.abs(n) < 1 ? 6 : maxFraction }).format(n);
}

export function formatPct(fraction: number, digits = 2): string {
  if (!Number.isFinite(fraction)) return "0%";
  return `${(fraction * 100).toFixed(digits)}%`;
}

export const HF_INFINITE = 10n ** 30n;

/** Health factor from WAD; "∞" when there is no debt. */
export function formatHealth(hf: bigint | undefined): string {
  if (hf === undefined) return "-";
  if (hf >= HF_INFINITE) return "∞";
  return Number(formatUnits(hf, WAD_DECIMALS)).toFixed(2);
}

export function healthNumber(hf: bigint | undefined): number {
  if (hf === undefined || hf >= HF_INFINITE) return Number.POSITIVE_INFINITY;
  return Number(formatUnits(hf, WAD_DECIMALS));
}

export type HealthTone = "safe" | "watch" | "danger" | "critical";

export function healthTone(hf: number): HealthTone {
  if (hf >= 2) return "safe";
  if (hf >= 1.5) return "watch";
  if (hf >= 1.1) return "danger";
  return "critical";
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

/** Parse user input into token units; undefined when not a positive number. */
export function parseAmount(input: string, decimals: number): bigint | undefined {
  const clean = input.trim();
  if (!/^\d*\.?\d*$/.test(clean) || clean === "" || clean === ".") return undefined;
  const [whole, frac = ""] = clean.split(".");
  try {
    const value = parseUnits(`${whole || "0"}.${frac.slice(0, decimals) || "0"}`, decimals);
    return value > 0n ? value : undefined;
  } catch {
    return undefined;
  }
}

export function timeAgo(unixSeconds: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
