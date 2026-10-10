import {
  CHAINS,
  HUB_CONTRACTS,
  HUB_TOKENS,
  errorsAbi,
  mockExchangeAbi,
  mockPriceOracleAbi,
  mockUsdcAbi,
  muaraLensAbi,
  muaraPoolAbi,
  rewardsModuleAbi,
  riskEngineAbi,
  shortModuleAbi,
  stockTokenAbi,
} from "@muara/shared";
import type { Address } from "viem";
import { arbitrumSepolia, baseSepolia } from "viem/chains";

/** Literal chain ids so wagmi can type-check them against the configured chains. */
export const HUB_CHAIN_ID = baseSepolia.id;
export const SPOKE_CHAIN_ID = arbitrumSepolia.id;
export const HUB_EID = CHAINS.baseSepolia.eid;
export const SPOKE_EID = CHAINS.arbitrumSepolia.eid;

export const contracts = {
  pool: { address: HUB_CONTRACTS.pool, abi: muaraPoolAbi, chainId: HUB_CHAIN_ID },
  lens: { address: HUB_CONTRACTS.lens, abi: muaraLensAbi, chainId: HUB_CHAIN_ID },
  shortModule: { address: HUB_CONTRACTS.shortModule, abi: shortModuleAbi, chainId: HUB_CHAIN_ID },
  rewardsModule: { address: HUB_CONTRACTS.rewardsModule, abi: rewardsModuleAbi, chainId: HUB_CHAIN_ID },
  riskEngine: { address: HUB_CONTRACTS.riskEngine, abi: riskEngineAbi, chainId: HUB_CHAIN_ID },
  exchange: { address: HUB_CONTRACTS.exchange, abi: mockExchangeAbi, chainId: HUB_CHAIN_ID },
  oracle: { address: HUB_CONTRACTS.oracle, abi: mockPriceOracleAbi, chainId: HUB_CHAIN_ID },
  usdc: { address: HUB_TOKENS.usdc, abi: mockUsdcAbi, chainId: HUB_CHAIN_ID },
  nvda: { address: HUB_TOKENS.nvda, abi: stockTokenAbi, chainId: HUB_CHAIN_ID },
} as const;

/** Errors raised inside the pool's linked libraries; merge into ABIs so reverts decode. */
export { errorsAbi };

export interface AssetMeta {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  kind: "stable" | "stock";
}

export const USDC: AssetMeta = {
  address: HUB_TOKENS.usdc,
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
  kind: "stable",
};

export const NVDA: AssetMeta = {
  address: HUB_TOKENS.nvda,
  symbol: "NVDA",
  name: "NVIDIA",
  decimals: 18,
  kind: "stock",
};

export const LIVE_ASSETS = [NVDA, USDC];

export function assetByAddress(address: string | undefined | null): AssetMeta | undefined {
  if (!address) return undefined;
  const a = address.toLowerCase();
  return LIVE_ASSETS.find((x) => x.address.toLowerCase() === a);
}

export const MAX_UINT = 2n ** 256n - 1n;
export const WAD = 10n ** 18n;
