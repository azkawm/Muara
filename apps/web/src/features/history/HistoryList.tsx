import { CHAINS } from "@muara/shared";
import { DeliveryFlow } from "../../components/Chains";
import { Badge, EmptyState, Skeleton } from "../../components/ui";
import type { HistoryEntry } from "../../lib/api";
import { shortAddress, shortHash, timeAgo } from "../../lib/format";
import { txUrl } from "../../lib/useTx";
import { describeAction, headlineActions, isLiquidation } from "./describe";

export function HistoryList({ entries, loading, showAccount }: { entries?: HistoryEntry[]; loading: boolean; showAccount?: boolean }) {
  if (loading) {
    return (
      <ul className="divide-y divide-line">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex items-center gap-4 px-5 py-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="ml-auto h-3 w-28" />
          </li>
        ))}
      </ul>
    );
  }
  if (!entries?.length) return <EmptyState title="No activity yet." />;

  return (
    <ul className="divide-y divide-line">
      {entries.map((e) => {
        const actions = headlineActions(e);
        return (
          <li key={e.txHash} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
            <div className="w-28 shrink-0 text-small text-ink-3">{timeAgo(e.timestamp)}</div>
            <div className="min-w-0 flex-1 space-y-2">
              {actions.map((a, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 text-body text-ink">
                  {a.name === "Liquidation" && <Badge tone="neg">Liquidation</Badge>}
                  <span>{describeAction(a)}</span>
                  {showAccount && a.account && <span className="text-small text-ink-3">· {shortAddress(a.account)}</span>}
                </div>
              ))}
              {e.deliveries.map((d) => (
                <div key={d.guid} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-input bg-bg px-3 py-2">
                  <DeliveryFlow status={d.status} dstEid={d.dstEid} />
                  <a href={d.lzScanUrl} target="_blank" rel="noreferrer" className="text-small text-brand hover:underline">
                    LayerZero Scan ↗
                  </a>
                  {d.dstTxHash && (
                    <a
                      href={`${CHAINS.arbitrumSepolia.explorer}/tx/${d.dstTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-small text-ink-2 hover:text-brand"
                    >
                      Arbiscan ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
            <a
              href={txUrl(e.txHash)}
              target="_blank"
              rel="noreferrer"
              className={`num shrink-0 text-small hover:text-brand ${isLiquidation(e) ? "text-neg" : "text-ink-3"}`}
            >
              {shortHash(e.txHash)} ↗
            </a>
          </li>
        );
      })}
    </ul>
  );
}
