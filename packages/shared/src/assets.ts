export type AssetStatus = "live" | "placeholder";

export interface MuaraAsset {
  symbol: string;
  name: string;
  decimals: number;
  kind: "stable" | "stock";
  /** Placeholders render as "coming soon" rows and are not deployed. */
  status: AssetStatus;
}

export const ASSETS: readonly MuaraAsset[] = [
  { symbol: "USDC", name: "USD Coin", decimals: 6, kind: "stable", status: "live" },
  { symbol: "NVDA", name: "NVIDIA", decimals: 18, kind: "stock", status: "live" },
  { symbol: "AAPL", name: "Apple", decimals: 18, kind: "stock", status: "placeholder" },
  { symbol: "TSLA", name: "Tesla", decimals: 18, kind: "stock", status: "placeholder" },
  { symbol: "MSFT", name: "Microsoft", decimals: 18, kind: "stock", status: "placeholder" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", decimals: 18, kind: "stock", status: "placeholder" },
];

export const LIVE_ASSETS = ASSETS.filter((a) => a.status === "live");
