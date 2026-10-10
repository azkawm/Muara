import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { DeploymentsFooter } from "../components/Deployments";
import { LogoBalls, type LogoBall } from "../components/LogoBalls";
import { Badge, Card, cx } from "../components/ui";
import { useMarkets } from "../features/markets/useMarkets";
import { formatPct } from "../lib/format";

const LOGOS: LogoBall[] = [
  { src: "/logos/nvda.svg", pad: true },
  { src: "/logos/usdc.png" },
  { src: "/logos/aapl.svg", pad: true },
  { src: "/logos/tsla.svg", pad: true },
  { src: "/logos/msft.svg", pad: true },
  { src: "/logos/spy.svg", pad: true },
];

const FEATURES = [
  {
    title: "Collateral that works",
    body: "Lock tokenized stock, borrow USDC without selling. Your stock is lent to short sellers and their borrow fee is yours to claim.",
    tone: "brand",
  },
  {
    title: "Short with real supply",
    body: "Post USDC, borrow stock from holders, sell at the oracle price and buy back later. One transaction each way.",
    tone: "tide",
  },
  {
    title: "Every chain flows to one registry",
    body: "One loan book on Base. Borrow or withdraw and have it delivered to Arbitrum through LayerZero, health-checked before it leaves.",
    tone: "silt",
  },
] as const;

const TONE = { brand: "text-brand", tide: "text-tide", silt: "text-silt" } as const;

export function LandingPage() {
  const { markets } = useMarkets();
  const nvda = markets.find((m) => m.meta.symbol === "NVDA");
  const logos = useMemo(() => LOGOS, []);

  return (
    <div className="-mt-4">
      <section className="relative grid min-h-[560px] items-center gap-10 py-10 lg:grid-cols-[1.05fr_1fr]">
        <div className="relative z-10">
          <Badge tone="silt" dot>
            Ethereum Jakarta 2026 · RWA track · Base Sepolia
          </Badge>
          <h1 className="mt-6 font-display text-[56px] leading-[1.02] font-semibold tracking-tight text-ink md:text-[72px]">
            Lend your stocks.
            <br />
            Short the market.
            <br />
            <span className="text-brand">Keep the dividends.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lead text-ink-2">
            Muara is a two-sided lending market for tokenized stocks. Long holders unlock cash without selling, short sellers get
            real stock supply, and each side's collateral protects the other.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/markets"
              className="inline-flex h-12 items-center rounded-input bg-brand px-6 text-lead font-medium text-brand-ink transition hover:brightness-110"
            >
              Open app
            </Link>
            <Link
              to="/short"
              className="inline-flex h-12 items-center rounded-input border border-tide/60 px-6 text-lead font-medium text-tide backdrop-blur-md transition hover:bg-tide/10"
            >
              Open a short
            </Link>
            <Link to="/faucet" className="inline-flex h-12 items-center rounded-input border border-line px-6 text-lead font-medium text-ink-2 transition hover:bg-raised hover:text-ink">
              Get test assets
            </Link>
            {nvda && (
              <span className="num ml-2 text-small text-ink-3">
                NVDA ${nvda.price.toFixed(2)} · supply {formatPct(nvda.supplyApy)} · borrow {formatPct(nvda.borrowApy)}
              </span>
            )}
          </div>
        </div>
        <div className="relative h-[420px] lg:h-[560px]">
          <LogoBalls logos={logos} color="#2fb8a6" cursorColor="#7c83f2" animationSize={30} speed={0.3} clumpFactor={1} cursorBallSize={2} extraBalls={7} />
        </div>
      </section>

      <section className="grid gap-6 py-10 md:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.title} className="p-6">
            <h2 className={cx("text-h4 font-semibold tracking-tight", TONE[f.tone])}>{f.title}</h2>
            <p className="mt-3 text-body text-ink-2">{f.body}</p>
          </Card>
        ))}
      </section>

      <section className="py-10">
        <Card className="grid gap-8 px-8 py-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="text-h3 font-semibold tracking-tight text-ink">Built for where tokenized stocks already trade</h2>
            <p className="mt-3 max-w-2xl text-body text-ink-2">
              US stock tokens are sold to Indonesian users today and OJK is drafting the rules. Muara uses the issuers' actual
              allowlisted tokens, prices through an oracle, and raises margin around NYSE closes because the token trades 24/7
              while the market does not. IDX stock tokens plug in through config when they go live.
            </p>
          </div>
          <Link to="/markets" className="inline-flex h-11 items-center justify-center rounded-input border border-line px-5 text-body font-medium text-ink hover:bg-raised">
            See the markets →
          </Link>
        </Card>
      </section>

      <DeploymentsFooter />
    </div>
  );
}
