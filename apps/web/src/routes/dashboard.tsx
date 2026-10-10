import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { ReactNode } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { PageTitle } from "../app/layout";
import { HealthTank, healthTextClass } from "../components/HealthGauge";
import { AssetIcon } from "../components/Market";
import { Badge, Button, Card, CardHeader, EmptyState, Skeleton, SkeletonList, Stat, Tip } from "../components/ui";
import { accountTotals } from "../features/account/math";
import { LendableSwitch } from "../features/account/LendableSwitch";
import { useActionModal } from "../features/actions/useActionModal";
import { useMarkets, usePositions, type Market } from "../features/markets/useMarkets";
import { RewardsCard } from "../features/rewards/RewardsCard";
import { formatPct, formatToken } from "../lib/format";
import { useWalletBalance } from "../lib/hooks";

const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

function Panel({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} sub={sub} />
      <div className="divide-y divide-line">{children}</div>
    </Card>
  );
}

function Line({ market, amount, value, apy, apyTone, extra, actions }: {
  market: Market;
  amount: string;
  value: string;
  apy: number;
  apyTone?: string;
  extra?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 px-5 py-4">
      <AssetIcon symbol={market.meta.symbol} kind={market.meta.kind} />
      <div className="min-w-24">
        <div className="num text-ink">{amount}</div>
        <div className="num text-small text-ink-3">{value}</div>
      </div>
      <div className="min-w-20">
        <div className="text-caption text-ink-3">APY</div>
        <div className={`num text-small ${apyTone ?? "text-ink"}`}>{formatPct(apy)}</div>
      </div>
      {extra}
      <div className="ml-auto flex gap-2">{actions}</div>
    </div>
  );
}

function WalletLine({ market, launch }: { market: Market; launch: (k: "supply", m: Market) => void }) {
  const { data: balance } = useWalletBalance(market.meta);
  return (
    <Line
      market={market}
      amount={`${formatToken(balance ?? 0n, market.meta.decimals)} ${market.meta.symbol}`}
      value={`in wallet · ${usd((Number(balance ?? 0n) / 10 ** market.meta.decimals) * market.price)}`}
      apy={market.supplyApy}
      apyTone="text-pos"
      actions={
        <Button size="sm" onClick={() => launch("supply", market)} disabled={!balance}>
          Supply
        </Button>
      }
    />
  );
}

export function DashboardPage() {
  const { isConnected } = useAccount();
  const { markets } = useMarkets();
  const { positions, account, isLoading: positionsLoading } = usePositions();
  const { launch, modal } = useActionModal();

  if (!isConnected) {
    return (
      <>
        <PageTitle title="Dashboard" sub="Your collateral, borrows and health factor on Muara's single loan book." />
        <Card>
          <EmptyState title="Connect a wallet to see your positions.">
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </EmptyState>
        </Card>
      </>
    );
  }

  const totals = accountTotals(positions);
  const supplied = positions.filter((p) => p.collateral > 0n);
  const borrowed = positions.filter((p) => p.debt > 0n);
  const netWorth = totals.collateralUsd - totals.debtUsd;
  const earn = supplied.reduce((s, p) => s + p.collateralUsd * (p.lendable ? p.market.supplyApy : 0), 0);
  const pay = borrowed.reduce((s, p) => s + p.debtUsd * p.market.borrowApy, 0);
  const netApy = netWorth > 0 ? (earn - pay) / netWorth : 0;
  const hf = totals.healthFactor;
  const used = totals.borrowCapacityUsd > 0 ? totals.debtUsd / totals.borrowCapacityUsd : 0;

  return (
    <>
      <PageTitle title="Dashboard" />

      <Card className="mb-6 grid grid-cols-2 items-center gap-y-8 px-6 py-6 md:grid-cols-4">
        <Stat label="Net worth" value={positionsLoading ? <Skeleton className="h-7 w-32" /> : usd(netWorth)} />
        <Stat label="Net APY" value={formatPct(netApy)} tone={netApy >= 0 ? "text-pos" : "text-neg"} />
        <Stat label="Borrow power used" value={formatPct(used, 1)} hint={`${usd(totals.borrowCapacityUsd - totals.debtUsd)} left`} />
        <div className="flex items-center justify-end gap-5">
          <div className="text-right">
            <Tip content="Collateral at the liquidation threshold divided by debt. Below 1.0 the position can be liquidated.">
              <div className="text-caption tracking-wide text-ink-3 uppercase">Health factor</div>
            </Tip>
            <div className={`num mt-1 text-h1 leading-none ${healthTextClass(hf)}`}>
              {Number.isFinite(hf) ? hf.toFixed(2) : "∞"}
            </div>
            <div className="mt-1 text-small text-ink-3">Liquidation at 1.00</div>
            {account && !account.pricesFresh && <Badge tone="neg">Prices stale, liquidations paused</Badge>}
          </div>
          <HealthTank hf={hf} />
        </div>
      </Card>

      <div className="mb-6">
        <RewardsCard />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Panel title="Your collateral" sub={supplied.length ? `${usd(totals.collateralUsd)} supplied` : undefined}>
            {positionsLoading ? (
              <SkeletonList rows={2} />
            ) : supplied.length ? (
              supplied.map((p) => (
                <Line
                  key={p.market.meta.address}
                  market={p.market}
                  amount={`${formatToken(p.collateral, p.market.meta.decimals)} ${p.market.meta.symbol}`}
                  value={usd(p.collateralUsd)}
                  apy={p.lendable ? p.market.supplyApy : 0}
                  apyTone="text-pos"
                  extra={p.market.meta.kind === "stock" ? <LendableSwitch position={p} /> : undefined}
                  actions={
                    <>
                      <Button size="sm" variant="secondary" onClick={() => launch("withdraw", p.market)}>
                        Withdraw
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => launch("supply", p.market)}>
                        Supply
                      </Button>
                    </>
                  }
                />
              ))
            ) : (
              <EmptyState title="Nothing supplied yet." />
            )}
          </Panel>

          <Panel title="Assets to supply">
            {!markets.length && <SkeletonList rows={2} />}
            {markets.map((m) => (
              <WalletLine key={m.meta.address} market={m} launch={launch} />
            ))}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Your borrows" sub={borrowed.length ? `${usd(totals.debtUsd)} borrowed` : undefined}>
            {positionsLoading ? (
              <SkeletonList rows={1} />
            ) : borrowed.length ? (
              borrowed.map((p) => (
                <Line
                  key={p.market.meta.address}
                  market={p.market}
                  amount={`${formatToken(p.debt, p.market.meta.decimals)} ${p.market.meta.symbol}`}
                  value={usd(p.debtUsd)}
                  apy={p.market.borrowApy}
                  actions={
                    <>
                      <Button size="sm" variant="secondary" onClick={() => launch("repay", p.market)}>
                        Repay
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => launch("borrow", p.market)}>
                        Borrow
                      </Button>
                    </>
                  }
                />
              ))
            ) : (
              <EmptyState title="No borrows." />
            )}
          </Panel>

          <Panel title="Assets to borrow">
            {markets
              .filter((m) => m.borrowEnabled)
              .map((m) => (
                <Line
                  key={m.meta.address}
                  market={m}
                  amount={`${formatToken(m.borrowable, m.meta.decimals, 2)} ${m.meta.symbol}`}
                  value={`available · ${usd(Number(formatUnits(m.borrowable, m.meta.decimals)) * m.price)}`}
                  apy={m.borrowApy}
                  actions={
                    <Button size="sm" variant="secondary" onClick={() => launch("borrow", m)}>
                      Borrow
                    </Button>
                  }
                />
              ))}
          </Panel>
        </div>
      </div>
      {modal}
    </>
  );
}
