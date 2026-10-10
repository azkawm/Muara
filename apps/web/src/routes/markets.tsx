import { ASSETS } from "@muara/shared";
import { PageTitle } from "../app/layout";
import { AssetIcon, MarketStatusBadge, UtilizationBar } from "../components/Market";
import { Badge, Button, Card, Skeleton, SkeletonRows, Stat } from "../components/ui";
import { useActionModal } from "../features/actions/useActionModal";
import { useMarkets, type Market } from "../features/markets/useMarkets";
import { formatPct } from "../lib/format";
import { SESSION_LABEL, useSession } from "../lib/hooks";

const usd = (n: number, compact = false) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: compact ? "compact" : "standard", maximumFractionDigits: compact ? 1 : 2 }).format(n);

const tokens = (amount: bigint, decimals: number) => Number(amount) / 10 ** decimals;

function MarketRow({ m, session, onAction }: { m: Market; session?: number; onAction: (k: "supply" | "borrow", m: Market) => void }) {
  const supplied = tokens(m.totalSupplied, m.meta.decimals);
  const borrowed = tokens(m.totalBorrowed, m.meta.decimals);
  return (
    <tr className="border-t border-line transition hover:bg-raised/40">
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <AssetIcon symbol={m.meta.symbol} kind={m.meta.kind} />
          <div>
            <div className="font-medium text-ink">{m.meta.symbol}</div>
            <div className="text-small text-ink-3">{m.meta.name}</div>
          </div>
        </div>
      </td>
      <td className="num px-4 py-4 text-ink">{usd(m.price)}</td>
      <td className="px-4 py-4">
        <div className="num text-ink">{usd(supplied * m.price, true)}</div>
        <div className="num text-small text-ink-3">
          {supplied.toLocaleString("en-US", { maximumFractionDigits: 2 })} {m.meta.symbol}
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="num text-ink">{usd(borrowed * m.price, true)}</div>
        <div className="num text-small text-ink-3">
          {borrowed.toLocaleString("en-US", { maximumFractionDigits: 2 })} {m.meta.symbol}
        </div>
      </td>
      <td className="px-4 py-4">
        <UtilizationBar value={m.utilization} cap={m.meta.kind === "stock" ? m.maxUtilization : undefined} />
      </td>
      <td className="num px-4 py-4 text-pos">{formatPct(m.supplyApy)}</td>
      <td className="num px-4 py-4 text-ink">{formatPct(m.borrowApy)}</td>
      <td className="px-4 py-4">
        <MarketStatusBadge isStock={m.meta.kind === "stock"} session={session} priceFresh={m.priceFresh} />
      </td>
      <td className="px-5 py-4">
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={() => onAction("supply", m)}>
            Supply
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onAction("borrow", m)} disabled={!m.borrowEnabled}>
            Borrow
          </Button>
        </div>
      </td>
    </tr>
  );
}

export function MarketsPage() {
  const { markets, isLoading } = useMarkets();
  const { data: session } = useSession();
  const { launch, modal } = useActionModal();

  const totalSupplied = markets.reduce((s, m) => s + tokens(m.totalSupplied, m.meta.decimals) * m.price, 0);
  const totalBorrowed = markets.reduce((s, m) => s + tokens(m.totalBorrowed, m.meta.decimals) * m.price, 0);
  const placeholders = ASSETS.filter((a) => a.status === "placeholder");

  return (
    <>
      <PageTitle
        title="Markets"
        sub="One loan book for tokenized stocks. Holders unlock cash without selling, short sellers get stock supply, and each side's collateral protects the other."
      />

      <Card className="mb-6 grid grid-cols-1 gap-6 px-6 py-5 sm:grid-cols-3">
        <Stat label="Total supplied" value={isLoading ? <Skeleton className="h-7 w-28" /> : usd(totalSupplied)} />
        <Stat label="Total borrowed" value={isLoading ? <Skeleton className="h-7 w-28" /> : usd(totalBorrowed)} />
        <Stat
          label="NYSE session"
          value={session === undefined ? "…" : SESSION_LABEL[session]}
          hint={session === 0 ? "Base margins" : "Margins raised while the market is closed"}
        />
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-body">
          <thead>
            <tr className="text-caption tracking-wide text-ink-3 uppercase">
              <th className="px-5 py-3 font-medium">Asset</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Total supplied</th>
              <th className="px-4 py-3 font-medium">Total borrowed</th>
              <th className="px-4 py-3 font-medium">Utilization</th>
              <th className="px-4 py-3 font-medium">Supply APY</th>
              <th className="px-4 py-3 font-medium">Borrow APY</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && <SkeletonRows rows={2} cols={9} />}
            {markets.map((m) => (
              <MarketRow key={m.meta.address} m={m} session={session} onAction={launch} />
            ))}
            {placeholders.map((a) => (
              <tr key={a.symbol} className="border-t border-line opacity-55">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <AssetIcon symbol={a.symbol} kind="placeholder" />
                    <div>
                      <div className="font-medium text-ink">{a.symbol}</div>
                      <div className="text-small text-ink-3">{a.name}</div>
                    </div>
                  </div>
                </td>
                <td colSpan={7} className="px-4 py-4 text-small text-ink-3">
                  Listed through config once its issuer token is allowlisted.
                </td>
                <td className="px-5 py-4 text-right">
                  <Badge>Coming soon</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {modal}
    </>
  );
}
