import { formatUnits, parseUnits } from "viem";

/** Prices on-chain are WAD USD per whole token. */
export const WAD = 10n ** 18n;

export const parseUsd = (value: string): bigint => parseUnits(value, 18);
export const formatUsd = (wad: bigint): string => formatUnits(wad, 18);

/** JSON.stringify that turns bigints into decimal strings. */
export function toJson(value: unknown): string {
  return JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
}

/** Deep copy with bigints as strings, for API responses. */
export function serialize<T>(value: T): unknown {
  return JSON.parse(toJson(value));
}
