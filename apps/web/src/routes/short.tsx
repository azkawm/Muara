import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { PageTitle } from "../app/layout";
import { DotGrid } from "../components/DotGrid";
import { MarketStatusBadge } from "../components/Market";
import { PriceChart } from "../components/PriceChart";
import { Card, CardHeader, cx, EmptyState, Skeleton } from "../components/ui";
import { useActionModal } from "../features/actions/useActionModal";
import { useMarkets } from "../features/markets/useMarkets";
import { OpenShortForm } from "../features/short/OpenShortForm";
import { useQuery } from "@tanstack/react-query";
import { HistoryList } from "../features/history/HistoryList";
import { ShareShortModal } from "../features/short/ShareShortModal";
import { api } from "../lib/api";
import { CloseShortForm, ShortPosition, UsdcInPoolCard, useShortSummary } from "../features/short/ShortPosition";
import { NVDA, USDC } from "../lib/contracts";
import { formatPct } from "../lib/format";
import { usePriceSeries, useSession } from "../lib/hooks";

export function ShortPage() {
  const { isConnected, address } = useAccount();
  const { byAddress } = useMarkets();
  const activity = useQuery({
    queryKey: ["history", address],
    queryFn: () => api.history(address!),
    enabled: !!address,
    refetchInterval: 5_000,
  });
  // Only what touches the short: opens, closes, liquidations and USDC collateral moving in or out.
  const SHORT_EVENTS = new Set(["ShortOpened", "ShortClosed", "Liquidation"]);
  const positionEntries = activity.data?.entries.filter((e) =>
    e.actions.some(
      (a) => SHORT_EVENTS.has(a.name) || ((a.name === "Withdraw" || a.name === "Supply") && a.asset?.toLowerCase() === USDC.address.toLowerCase()),
    ),
  );
  const { data: session } = useSession();
  const points = usePriceSeries();
  const summary = useShortSummary();
  const { launch, modal } = useActionModal();
  const [tab, setTab] = useState<"open" | "close">("open");
  const [share, setShare] = useState(false);
  const nvda = byAddress(NVDA.address);
  const usdc = byAddress(USDC.address);

  const lines = useMemo(() => {
    const l: { price: number; label: string; color: "tide" | "neg" }[] = [];
    if (summary?.entry) l.push({ price: summary.entry, label: "Entry", color: "tide" });
    if (summary?.liqPrice) l.push({ price: summary.liqPrice, label: "Liquidation", color: "neg" });
    return l;
  }, [summary?.entry, summary?.liqPrice]);

  return (
    <>
      {/* Short-only backdrop: a dot field that scatters as the pointer moves, behind the page content. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <DotGrid dotSize={3} gap={22} baseColor="#2b4650" activeColor="var(--tide)" proximity={140} speedTrigger={120} shockRadius={220} shockStrength={4} resistance={700} returnDuration={1.4} />
      </div>
      <PageTitle
        title="Short"
        sub="Borrow stock that holders lend out, sell it, and buy it back later. Your USDC and the sale proceeds secure the loan; holders earn your borrow fee."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="NVDA oracle price"
              sub={nvda ? `Borrow fee ${formatPct(nvda.borrowApy)} · ${formatPct(nvda.utilization, 1)} of lendable supply borrowed` : undefined}
              aside={nvda && <MarketStatusBadge isStock session={session} priceFresh={nvda.priceFresh} />}
            />
            <div className="px-3 py-3">
              {points.length > 1 ? (
                <PriceChart points={points} lines={lines} height={260} />
              ) : (
                <div className="flex h-[260px] flex-col justify-end gap-4 px-2 pb-2">
                  {[0.3, 0.55, 0.45, 0.7, 0.5].map((w, i) => (
                    <Skeleton key={i} className="h-3" style={{ width: `${w * 100}%` }} />
                  ))}
                </div>
              )}
            </div>
          </Card>
          {isConnected && summary && (
            <Card>
              <CardHeader title="Your short" />
              <div className="px-5 py-5">
                <ShortPosition onWithdraw={() => usdc && launch("withdraw", usdc)} onShare={() => setShare(true)} />
              </div>
            </Card>
          )}
          {isConnected && <UsdcInPoolCard onWithdraw={() => usdc && launch("withdraw", usdc)} />}
          {isConnected && (
            <Card>
              <CardHeader title="Position activity" sub="Opens, closes, liquidations and collateral moves, with cross-chain delivery tracked." />
              <HistoryList entries={positionEntries} loading={activity.isLoading} />
            </Card>
          )}
        </div>

        <Card className="self-start lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          <div className="grid grid-cols-2 border-b border-line p-1.5">
            {(["open", "close"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cx(
                  "rounded-input py-2 text-body font-medium transition",
                  tab === t ? "bg-tide/15 text-tide" : "text-ink-3 hover:text-ink",
                )}
              >
                {t === "open" ? "Open short" : "Close short"}
              </button>
            ))}
          </div>
          <div className="p-5">
            {!isConnected ? (
              <EmptyState title="Connect a wallet to short NVDA.">
                <div className="flex justify-center">
                  <ConnectButton />
                </div>
              </EmptyState>
            ) : tab === "open" ? (
              <OpenShortForm onOpened={() => setShare(true)} />
            ) : (
              <CloseShortForm />
            )}
          </div>
        </Card>
      </div>
      {modal}
      <ShareShortModal open={share} onOpenChange={setShare} />
    </>
  );
}
