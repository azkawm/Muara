import { createPublicClient, createWalletClient, fallback, http, nonceManager, type Hex, type Transport } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia, baseSepolia } from "viem/chains";
import type { Config } from "../config/env.js";

const PUBLIC_RPC = {
  base: "https://sepolia.base.org",
  arbitrum: "https://sepolia-rollup.arbitrum.io/rpc",
} as const;

/**
 * Configured RPC first, public RPC as a fallback. Alchemy's free tier returns 429 in bursts,
 * which used to fail whole requests (faucet, keeper ticks); the fallback rides those out.
 */
export function chainTransport(chain: keyof typeof PUBLIC_RPC, url: string): Transport {
  const primary = http(url, { retryCount: 2, batch: true });
  if (url === PUBLIC_RPC[chain]) return primary;
  return fallback([primary, http(PUBLIC_RPC[chain], { retryCount: 2 })], { rank: false });
}

export function createChainClients(config: Config) {
  const baseTransport = chainTransport("base", config.BASE_SEPOLIA_RPC_URL);
  const arbTransport = chainTransport("arbitrum", config.ARBITRUM_SEPOLIA_RPC_URL);

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
