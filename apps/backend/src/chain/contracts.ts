import {
  HUB_CONTRACTS,
  HUB_TOKENS,
  mockExchangeAbi,
  mockPriceOracleAbi,
  mockUsdcAbi,
  muaraLensAbi,
  muaraPoolAbi,
  rewardsModuleAbi,
  shortModuleAbi,
  stockTokenAbi,
} from "@muara/shared";

/** Hub contracts on Base Sepolia, addresses from packages/shared/deployments. */
export const hub = {
  pool: { address: HUB_CONTRACTS.pool, abi: muaraPoolAbi },
  lens: { address: HUB_CONTRACTS.lens, abi: muaraLensAbi },
  oracle: { address: HUB_CONTRACTS.oracle, abi: mockPriceOracleAbi },
  exchange: { address: HUB_CONTRACTS.exchange, abi: mockExchangeAbi },
  shortModule: { address: HUB_CONTRACTS.shortModule, abi: shortModuleAbi },
  rewardsModule: { address: HUB_CONTRACTS.rewardsModule, abi: rewardsModuleAbi },
  usdc: { address: HUB_TOKENS.usdc, abi: mockUsdcAbi },
  nvda: { address: HUB_TOKENS.nvda, abi: stockTokenAbi },
} as const;

export const STOCK_ASSET = HUB_TOKENS.nvda;
export const USDC_ASSET = HUB_TOKENS.usdc;
