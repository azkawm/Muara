import type { AssetMeta } from "../lib/contracts";
import { formatPct } from "../lib/format";
import { SESSION_LABEL } from "../lib/hooks";
import { Badge, cx, Tip } from "./ui";

/** Asset logos bundled in public/logos; stock wordmarks sit on a white disc. */
const LOGOS: Record<string, { src: string; pad?: boolean }> = {
  USDC: { src: "/logos/usdc.png" },
  NVDA: { src: "/logos/nvda.svg", pad: true },
  AAPL: { src: "/logos/aapl.svg", pad: true },
  TSLA: { src: "/logos/tsla.svg", pad: true },
  MSFT: { src: "/logos/msft.svg", pad: true },
  SPY: { src: "/logos/spy.svg", pad: true },
};

export function AssetIcon({ symbol, kind, size = 32 }: { symbol: string; kind: AssetMeta["kind"] | "placeholder"; size?: number }) {
  const logo = LOGOS[symbol];
  if (logo) {
    return (
      <span
        className={cx("grid shrink-0 place-items-center overflow-hidden rounded-full", logo.pad && "bg-white", kind === "placeholder" && "grayscale")}
        style={{ width: size, height: size, padding: logo.pad ? size * 0.18 : 0 }}
        aria-hidden
      >
        <img src={logo.src} alt="" className="h-full w-full object-contain" draggable={false} />
      </span>
    );
  }
  const ring = kind === "stock" ? "border-brand/50 text-brand" : kind === "stable" ? "border-silt/50 text-silt" : "border-line text-ink-3";
  return (
    <span
      className={cx("grid shrink-0 place-items-center rounded-full border bg-raised font-semibold", ring)}
      style={{ width: size, height: size, fontSize: size * 0.32 }}
      aria-hidden
    >
      {symbol.slice(0, 4)}
    </span>
  );
}

/** Utilization as a slow current: fill moves gently, cap marked when there is one. */
export function UtilizationBar({ value, cap }: { value: number; cap?: number }) {
  const pct = Math.min(Math.max(value, 0), 1) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-raised" aria-hidden>
        <div
          className="animate-current h-full rounded-full"
          style={{
            width: `${pct}%`,
            backgroundImage: "linear-gradient(90deg, var(--brand), color-mix(in srgb, var(--brand) 50%, var(--tide)), var(--brand))",
            backgroundSize: "200px 100%",
          }}
        />
        {cap !== undefined && cap < 1 && <div className="absolute inset-y-0 w-px bg-ink-3" style={{ left: `${cap * 100}%` }} />}
      </div>
      <span className="num text-small text-ink-2">{formatPct(value, 1)}</span>
    </div>
  );
}

/**
 * NYSE session for stock markets, or "Paused" when the price is stale (liquidations and
 * new borrows stop until it refreshes).
 */
export function MarketStatusBadge({ isStock, session, priceFresh }: { isStock: boolean; session?: number; priceFresh: boolean }) {
  if (!priceFresh) {
    return (
      <Tip content="Price feed is stale. Borrowing and liquidations pause until it refreshes.">
        <span>
          <Badge tone="neg" dot>
            Paused
          </Badge>
        </span>
      </Tip>
    );
  }
  if (!isStock) return <Badge tone="neutral">24/7</Badge>;
  const label = session === undefined ? "…" : SESSION_LABEL[session] ?? "…";
  const tone = session === 0 ? "pos" : session === 1 ? "warn" : "silt";
  const tip =
    session === 0
      ? "NYSE is open. Base margin applies."
      : session === 1
        ? "Last 30 minutes before the close. Margin is raised and the liquidation threshold ramps down."
        : "NYSE is closed. Margin is raised until the next open.";
  return (
    <Tip content={tip}>
      <span>
        <Badge tone={tone} dot>
          {label}
        </Badge>
      </span>
    </Tip>
  );
}
