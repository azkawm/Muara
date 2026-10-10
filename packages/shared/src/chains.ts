/** LayerZero V2 endpoint, identical on both testnets. */
export const LZ_ENDPOINT_V2 = "0x6EDCE65403992e310A62460808c4b910D972f10f" as const;

export type ChainKey = "baseSepolia" | "arbitrumSepolia";

export interface MuaraChain {
  key: ChainKey;
  name: string;
  chainId: number;
  /** LayerZero endpoint id. */
  eid: number;
  /** Hub holds the loan book; the spoke only receives deliveries. */
  role: "hub" | "spoke";
  explorer: string;
}

export const CHAINS: Record<ChainKey, MuaraChain> = {
  baseSepolia: {
    key: "baseSepolia",
    name: "Base Sepolia",
    chainId: 84532,
    eid: 40245,
    role: "hub",
    explorer: "https://sepolia.basescan.org",
  },
  arbitrumSepolia: {
    key: "arbitrumSepolia",
    name: "Arbitrum Sepolia",
    chainId: 421614,
    eid: 40231,
    role: "spoke",
    explorer: "https://sepolia.arbiscan.io",
  },
};

export const HUB = CHAINS.baseSepolia;

export const LZ_SCAN_TESTNET = "https://testnet.layerzeroscan.com";
