import { darkTheme, lightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import * as Tooltip from "@radix-ui/react-tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { ToastProvider } from "../components/Toast";
import { ThemeProvider, useTheme } from "./theme";
import { wagmiConfig } from "./wagmi";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

const rkShared = { accentColorForeground: "#04211d", borderRadius: "medium", fontStack: "system", overlayBlur: "small" } as const;

/** Glass treatment for the wallet dialog, which RainbowKit renders from its own theme. */
function glass<T extends { colors: { modalBackground: string; modalBorder: string } }>(t: T): T {
  t.colors.modalBackground = "rgb(17 30 36 / 0.55)";
  t.colors.modalBorder = "rgb(255 255 255 / 0.15)";
  return t;
}

function WalletKit({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const rkTheme =
    theme === "dark"
      ? glass(darkTheme({ ...rkShared, accentColor: "#2fb8a6" }))
      : lightTheme({ ...rkShared, accentColor: "#128c7e", accentColorForeground: "#ffffff" });
  return (
    <RainbowKitProvider theme={rkTheme} initialChain={baseSepolia} modalSize="compact">
      {children}
    </RainbowKitProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <WalletKit>
            <Tooltip.Provider delayDuration={150}>
              <ToastProvider>{children}</ToastProvider>
            </Tooltip.Provider>
          </WalletKit>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
