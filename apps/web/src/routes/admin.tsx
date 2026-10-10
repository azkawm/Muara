import { SCENARIOS, SCENARIO_IDS } from "@muara/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { PageTitle } from "../app/layout";
import { PriceChart } from "../components/PriceChart";
import { useToast } from "../components/Toast";
import { Badge, Button, Card, CardHeader, cx, EmptyState, Row } from "../components/ui";
import { HistoryList } from "../features/history/HistoryList";
import { adminPost, api } from "../lib/api";
import { contracts } from "../lib/contracts";
import { formatHealth, shortAddress, timeAgo } from "../lib/format";
import { SESSION_LABEL, useIsAdmin, usePrice, usePriceSeries, useSession } from "../lib/hooks";
import { useTx } from "../lib/useTx";

function useAdmin() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const post = async (label: string, route: string, body: unknown) => {
    if (!address) return;
    setBusy(label);
    try {
      await adminPost(route, body, address, (args) => signMessageAsync(args));
      toast.push({ title: label, description: "Signed and sent to the backend.", tone: "success" });
      await queryClient.invalidateQueries({ queryKey: ["price"] });
    } catch (err) {
      toast.push({ title: `${label} failed`, description: err instanceof Error ? err.message : String(err), tone: "error" });
    } finally {
      setBusy(null);
    }
  };
  return { post, busy };
}

function ScenarioPanel() {
  const { data: price } = usePrice();
  const points = usePriceSeries();
  const { post, busy } = useAdmin();
  const [target, setTarget] = useState("");
  const anchor = price ? Number(price.anchor) : 150;
  const run = price?.scenario;
  const running = run?.status === "running";
  const validTarget = /^\d+(\.\d+)?$/.test(target) && Number(target) > 0;

  return (
    <Card>
      <CardHeader
        title="Price scenarios"
        sub={`Moves are relative to the $${anchor.toFixed(2)} anchor and step over about 15 seconds.`}
        aside={
          price && (
            <div className="text-right">
              <div className="num text-h3 text-ink">${Number(price.price).toFixed(2)}</div>
              <div className="text-caption text-ink-3">updated {price.ageSeconds}s ago</div>
            </div>
          )
        }
      />
      <div className="space-y-5 px-5 py-5">
        {run && (
          <div className="rounded-input border border-line bg-bg px-4 py-3">
            <div className="flex items-center justify-between text-small">
              <span className="text-ink-2">
                {run.id === "custom" ? "Custom move" : SCENARIOS[run.id as keyof typeof SCENARIOS]?.label} · ${Number(run.from).toFixed(2)} → $
                {Number(run.to).toFixed(2)}
              </span>
              <Badge tone={run.status === "running" ? "silt" : run.status === "done" ? "pos" : "neg"}>{run.status}</Badge>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised">
              <div className="h-full bg-silt transition-[width] duration-500" style={{ width: `${(run.step / run.steps) * 100}%` }} />
            </div>
            {run.error && <p className="mt-2 text-small text-neg">{run.error}</p>}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {SCENARIO_IDS.map((id) => {
            const s = SCENARIOS[id];
            const to = anchor * (1 + s.changePct / 100);
            return (
              <button
                key={id}
                type="button"
                disabled={running || !!busy}
                onClick={() => post(s.label, "/scenario", { scenario: id })}
                className="rounded-card border border-line bg-bg p-4 text-left transition hover:border-silt disabled:opacity-50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">{s.label}</span>
                  <span className={cx("num text-small", s.changePct < 0 ? "text-neg" : s.changePct > 0 ? "text-pos" : "text-ink-2")}>
                    {s.changePct > 0 ? "+" : ""}
                    {s.changePct}% · ${to.toFixed(2)}
                  </span>
                </div>
                <p className="mt-1 text-small text-ink-3">{s.description}</p>
              </button>
            );
          })}
        </div>

        <div>
          <div className="mb-2 text-small text-ink-2">Exact price (the demo squeeze uses $190, just past Budi's ~$188 liquidation)</div>
          <div className="flex gap-2">
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="190"
              inputMode="decimal"
              className="num h-10 w-32 rounded-input border border-line bg-bg px-3 text-ink outline-none focus:border-brand"
            />
            <Button variant="secondary" disabled={!validTarget || running || !!busy} onClick={() => post(`Move to $${target}`, "/scenario", { target })}>
              Move gradually
            </Button>
            <Button variant="ghost" disabled={!validTarget || running || !!busy} onClick={() => post(`Set $${target}`, "/price", { price: target })}>
              Set now
            </Button>
          </div>
        </div>

        {points.length > 1 && <PriceChart points={points} height={180} />}
      </div>
    </Card>
  );
}

function SessionPanel() {
  const { data: session } = useSession();
  const { send, busy } = useTx();
  const set = (s: number) =>
    send(`Session: ${SESSION_LABEL[s]}`, { ...contracts.riskEngine, functionName: "setSessionOverride", args: [s] }).catch(() => {});
  const clear = () => send("Session: automatic", { ...contracts.riskEngine, functionName: "clearSessionOverride" }).catch(() => {});

  return (
    <Card>
      <CardHeader title="Market hours" sub="Override the NYSE session for the demo. Sent from this wallet as the risk engine owner." />
      <div className="space-y-4 px-5 py-5">
        <Row label="Current session">{session === undefined ? "…" : SESSION_LABEL[session]}</Row>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={clear}>
            Automatic
          </Button>
          {SESSION_LABEL.map((label, i) => (
            <Button key={label} size="sm" variant={session === i ? "primary" : "ghost"} disabled={busy} onClick={() => set(i)}>
              {label}
            </Button>
          ))}
        </div>
      </div>
    </Card>
  );
}

function KeeperPanel() {
  const { data, isError } = useQuery({ queryKey: ["keeper"], queryFn: api.keeper, refetchInterval: 3_000 });
  return (
    <Card>
      <CardHeader title="Keeper" sub={data ? `Watching ${data.tracked} borrower${data.tracked === 1 ? "" : "s"} from ${shortAddress(data.address)}` : undefined} />
      <div className="space-y-4 px-5 py-5">
        {isError && <p className="text-small text-neg">Keeper unreachable.</p>}
        <div>
          <div className="mb-1 text-caption tracking-wide text-ink-3 uppercase">At risk (HF under 1.2)</div>
          {data?.atRisk.length ? (
            data.atRisk.map((p) => (
              <Row key={p.user} label={shortAddress(p.user)}>
                <span className={BigInt(p.healthFactor) < 10n ** 18n ? "text-neg" : "text-hf-danger"}>{formatHealth(BigInt(p.healthFactor))}</span>
              </Row>
            ))
          ) : (
            <p className="text-small text-ink-3">Nobody close to liquidation.</p>
          )}
        </div>
        <div>
          <div className="mb-1 text-caption tracking-wide text-ink-3 uppercase">Recent actions</div>
          {data?.recent.length ? (
            data.recent.slice(0, 6).map((a, i) => (
              <Row key={i} label={`${shortAddress(a.user)} · ${timeAgo(Math.floor(a.at / 1000))}`}>
                {a.status === "liquidated" ? <Badge tone="neg">Liquidated</Badge> : <Badge tone="warn">{a.reason ?? "Failed"}</Badge>}
              </Row>
            ))
          ) : (
            <p className="text-small text-ink-3">No liquidations yet.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

export function AdminPage() {
  const isAdmin = useIsAdmin();
  const activity = useQuery({ queryKey: ["activity"], queryFn: api.activity, refetchInterval: 4_000, enabled: isAdmin });

  if (!isAdmin) {
    return (
      <>
        <PageTitle title="Admin" />
        <Card>
          <EmptyState title="Admin only. Connect the deployer wallet to drive scenarios." />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageTitle title="Scenario control" sub="Testnet only. Prices here are driven on purpose so the demo can show margin calls and liquidations." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <ScenarioPanel />
          <Card>
            <CardHeader title="Live activity" />
            <HistoryList entries={activity.data?.entries} loading={activity.isLoading} showAccount />
          </Card>
        </div>
        <div className="space-y-6">
          <KeeperPanel />
          <SessionPanel />
        </div>
      </div>
    </>
  );
}
