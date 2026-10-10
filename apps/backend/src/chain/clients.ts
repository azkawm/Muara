import { createPublicClient, createWalletClient, http, nonceManager, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia, baseSepolia } from "viem/chains";
import type { Config } from "../config/env.js";

export function createChainClients(config: Config) {
  const baseTransport = http(config.BASE_SEPOLIA_RPC_URL, { retryCount: 3, batch: true });
  const arbTransport = http(config.ARBITRUM_SEPOLIA_RPC_URL, { retryCount: 3, batch: true });

  // Track nonces locally: load-balanced RPCs (Alchemy) can briefly report a stale nonce right
  // after a confirmation, which made back-to-back sends fail as "replacement underpriced".
  const wallet = (key: Hex) =>
    createWalletClient({
      account: privateKeyToAccount(key, { nonceManager }),
      chain: baseSepolia,
      transport: baseTransport,
    });

  return {
    base: createPublicClient({ chain: baseSepolia, transport: baseTransport, batch: { multicall: true } }),
    arbitrum: createPublicClient({ chain: arbitrumSepolia, transport: arbTransport }),
    /** Pushes oracle prices. Must be an oracle updater. */
    updater: wallet(config.PRICE_UPDATER_PRIVATE_KEY),
    /** Liquidates. Must be allowlisted to hold stock tokens. */
    keeper: wallet(config.KEEPER_PRIVATE_KEY),
  };
}

export type ChainClients = ReturnType<typeof createChainClients>;
export type BaseClient = ChainClients["base"];
export type HubWallet = ChainClients["keeper"];
