import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Link, Outlet } from "@tanstack/react-router";
import { useAccount, useSwitchChain } from "wagmi";
import { ContourBand, Wordmark } from "../components/Brand";
import { ClickSpark } from "../components/ClickSpark";
import { Badge, Button, Tip } from "../components/ui";
import { HUB_CHAIN_ID } from "../lib/contracts";
import { useIsAdmin, usePrice } from "../lib/hooks";
import { useTheme } from "./theme";

const NAV = [
  { to: "/markets", label: "Markets" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/short", label: "Short" },
  { to: "/history", label: "History" },
  { to: "/faucet", label: "Faucet" },
] as const;

function PriceTicker() {
  const { data } = usePrice();
  if (!data) return null;
  const moving = data.scenario?.status === "running";
  return (
    <Tip content={`Oracle price, updated ${data.ageSeconds}s ago${moving ? ". A scenario is moving the price." : ""}`}>
      <span className="num hidden items-center gap-2 rounded-full border border-line px-3 py-1 text-small text-ink-2 md:flex">
        <span className={`size-1.5 rounded-full ${moving ? "animate-pulse bg-silt" : "bg-brand"}`} />
        NVDA <span className="text-ink">${Number(data.price).toFixed(2)}</span>
      </span>
    </Tip>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className="grid size-9 place-items-center rounded-input text-ink-2 hover:bg-raised hover:text-ink"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}

function WrongNetwork() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  if (!isConnected || chainId === HUB_CHAIN_ID) return null;
  return (
    <div className="border-b border-silt/30 bg-silt/10">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-6 py-2 text-small text-silt">
        <span>Muara's loan book lives on Base Sepolia. Arbitrum is a delivery destination only.</span>
        <Button size="sm" variant="secondary" loading={isPending} onClick={() => switchChain({ chainId: HUB_CHAIN_ID })}>
          Switch to Base Sepolia
        </Button>
      </div>
    </div>
  );
}

export function Layout() {
  const isAdmin = useIsAdmin();
  return (
    <div className="relative min-h-screen">
      <ClickSpark sparkColor="var(--brand)" sparkSize={10} sparkRadius={18} sparkCount={8} duration={420} />
      <ContourBand />
      <WrongNetwork />
      <header className="relative">
        <div className="mx-auto flex max-w-[1240px] items-center gap-8 px-6 py-5">
          <Link to="/" aria-label="Muara home">
            <Wordmark />
          </Link>
          <nav className="flex items-center gap-1">
            {[...NAV, ...(isAdmin ? [{ to: "/admin", label: "Admin" } as const] : [])].map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: false }}
                className="rounded-input px-3 py-2 text-body text-ink-2 hover:text-ink data-[status=active]:bg-raised data-[status=active]:text-ink"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Tip content="Testnet demo. Prices are driven by a scenario script, not a live market.">
              <span>
                <Badge tone="silt" dot>
                  Simulation mode
                </Badge>
              </span>
            </Tip>
            <PriceTicker />
            <ThemeToggle />
            <ConnectButton chainStatus="icon" showBalance={false} accountStatus="address" />
          </div>
        </div>
      </header>
      <main className="relative mx-auto max-w-[1240px] px-6 pt-4 pb-24">
        <Outlet />
      </main>
      <footer className="relative border-t border-line">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-6 text-small text-ink-3">
          <span className="font-display text-lead text-ink-2">Every chain flows to one registry.</span>
          <span>Base Sepolia hub · Arbitrum Sepolia delivery · LayerZero</span>
        </div>
      </footer>
    </div>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-h1 leading-tight font-semibold tracking-tight text-ink">{title}</h1>
      {sub && <p className="mt-2 max-w-2xl text-lead text-ink-2">{sub}</p>}
    </div>
  );
}
