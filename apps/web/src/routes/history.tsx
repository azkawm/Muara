import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAccount } from "wagmi";
import { PageTitle } from "../app/layout";
import { Card, cx } from "../components/ui";
import { HistoryList } from "../features/history/HistoryList";
import { api } from "../lib/api";

export function HistoryPage() {
  const { address } = useAccount();
  const [scope, setScope] = useState<"mine" | "all">(address ? "mine" : "all");
  const mine = useQuery({
    queryKey: ["history", address],
    queryFn: () => api.history(address!),
    enabled: !!address && scope === "mine",
    refetchInterval: 5_000,
  });
  const all = useQuery({ queryKey: ["activity"], queryFn: api.activity, enabled: scope === "all", refetchInterval: 5_000 });
  const active = scope === "mine" ? mine : all;

  return (
    <>
      <PageTitle
        title="History"
        sub="Every action on the hub, with LayerZero delivery tracked from Base to Arbitrum: sent, verified by the DVNs, delivered."
      />
      <Card>
        <div className="flex gap-1 border-b border-line p-1.5">
          {(
            [
              ["mine", "Your activity"],
              ["all", "All activity"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              disabled={key === "mine" && !address}
              onClick={() => setScope(key)}
              className={cx(
                "rounded-input px-4 py-2 text-body transition disabled:opacity-40",
                scope === key ? "bg-raised text-ink" : "text-ink-3 hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <HistoryList entries={active.data?.entries} loading={active.isLoading} showAccount={scope === "all"} />
        {active.isError && <p className="px-5 pb-5 text-small text-neg">Backend unreachable: {String(active.error)}</p>}
      </Card>
    </>
  );
}
