import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { arbitrumSepolia, baseSepolia } from "wagmi/chains";

const projectId = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ?? "";

// Without a WalletConnect project id, offer browser extension wallets only.
const wallets = projectId
  ? [metaMaskWallet, rabbyWallet, coinbaseWallet, rainbowWallet, walletConnectWallet]
  : [injectedWallet, rabbyWallet, coinbaseWallet];

const connectors = connectorsForWallets([{ groupName: "Wallets", wallets }], {
  appName: "Muara",
  projectId: projectId || "muara-extension-wallets-only",
});

export const wagmiConfig = createConfig({
  chains: [baseSepolia, arbitrumSepolia],
  connectors,
  transports: {
    [baseSepolia.id]: http(import.meta.env.VITE_BASE_SEPOLIA_RPC_URL as string | undefined),
    [arbitrumSepolia.id]: http(import.meta.env.VITE_ARBITRUM_SEPOLIA_RPC_URL as string | undefined),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
