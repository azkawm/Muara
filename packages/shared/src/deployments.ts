import type { Address } from "viem";
import baseSepolia from "../deployments/base-sepolia.json" with { type: "json" };
import arbitrumSepolia from "../deployments/arbitrum-sepolia.json" with { type: "json" };

export interface TokenAddresses {
  allowlist: Address;
  usdc: Address;
  nvda: Address;
}

export interface HubAddresses {
  oracle: Address;
  riskEngine: Address;
  rateModel: Address;
  pool: Address;
  exchange: Address;
  shortModule: Address;
  rewardsModule: Address;
  lens: Address;
  /** First block worth indexing. */
  deployedAtBlock: number;
}

/** Written by the Foundry deploy scripts into packages/shared/deployments. */
export const DEPLOYMENTS = {
  baseSepolia: {
    chainId: baseSepolia.chainId,
    eid: baseSepolia.eid,
    tokens: baseSepolia.tokens as TokenAddresses,
    hub: baseSepolia.hub as HubAddresses,
  },
  arbitrumSepolia: {
    chainId: arbitrumSepolia.chainId,
    eid: arbitrumSepolia.eid,
    tokens: arbitrumSepolia.tokens as TokenAddresses,
  },
} as const;

export const HUB_TOKENS = DEPLOYMENTS.baseSepolia.tokens;
export const HUB_CONTRACTS = DEPLOYMENTS.baseSepolia.hub;
