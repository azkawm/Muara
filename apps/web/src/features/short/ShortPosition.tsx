import { useState } from "react";
import { formatUnits } from "viem";
import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { AmountInput } from "../../components/AmountInput";
import { healthTextClass } from "../../components/HealthGauge";
import { useToast } from "../../components/Toast";
import { Button, Card, CardHeader, cx, Row } from "../../components/ui";
import { contracts, HUB_CHAIN_ID, HUB_EID, MAX_UINT, NVDA, SPOKE_EID, USDC } from "../../lib/contracts";
import { formatToken, parseAmount } from "../../lib/format";
import { useShortView } from "../../lib/hooks";
import { useTx } from "../../lib/useTx";
import { accountTotals, liquidationPrice } from "../account/math";
import { useMarkets, usePositions } from "../markets/useMarkets";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function useShortSummary() {
  const { data } = useShortView(NVDA);
  const { byAddress } = useMarkets();
  const { positions } = usePositions();
  const nvda = byAddress(NVDA.address);
  if (!data || !nvda || data.debt === 0n) return undefined;
  const size = Number(formatUnits(data.size, 18));
  const debt = Number(formatUnits(data.debt, 18));
  const entry = size > 0 ? Number(formatUnits(data.proceeds, 6)) / size : 0;
  // The module records the original sale; a liquidation repays debt without touching that
  // record. Only the proceeds matching the debt still open count toward P&L.
  const proceeds = entry * Math.min(debt, size);
  const buyback = Number(formatUnits(data.buybackCost, 6));
  const account = accountTotals(positions);
  const usdcCollateral = positions.find((p) => p.market.meta.address === USDC.address)?.collateral ?? 0n;
  return {
    raw: data,
    size,
    debt,
    proceeds,
    entry,
    buyback,
    pnl: proceeds - buyback,
    price: nvda.price,
    healthFactor: account.healthFactor,
    liqPrice: liquidationPrice(positions, nvda),
    liquidated: debt < size * 0.999 && usdcCollateral === 0n,
  };
}

export function ShortPosition({ onWithdraw, onShare }: { onWithdraw: () => void; onShare?: () => void }) {
  const s = useShortSummary();
  if (!s) return null;
  const up = s.pnl >= 0;
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-1 sm:grid-cols-3">
      {s.liquidated && (
        <div className="col-span-2 mb-4 rounded-input border border-neg/40 bg-neg/10 px-4 py-3 text-small text-neg sm:col-span-3">
          This short was liquidated: the keeper bought back {(s.size - s.debt).toFixed(4)} NVDA and your USDC collateral was
          seized. {s.debt.toFixed(4)} NVDA of debt remains. See History for the liquidation transaction.
        </div>
      )}
      <div className="col-span-2 mb-3 sm:col-span-3">
        <div className="text-caption tracking-wide text-ink-3 uppercase">Unrealized P&L</div>
        <div className={`num mt-1 text-h2 ${up ? "text-pos" : "text-neg"}`}>
          {up ? "+" : "−"}
          {usd(Math.abs(s.pnl))}
        </div>
        <div className="text-small text-ink-3">Sale proceeds minus the cost to buy back today, borrow fees included.</div>
      </div>
      <Row label="Short">{s.debt.toFixed(4)} NVDA</Row>
      <Row label="Entry">{usd(s.entry)}</Row>
      <Row label="Mark">{usd(s.price)}</Row>
      <Row label="Buy back">{usd(s.buyback)}</Row>
      <Row label="Health">
        <span className={healthTextClass(s.healthFactor)}>{Number.isFinite(s.healthFactor) ? s.healthFactor.toFixed(2) : "∞"}</span>
      </Row>
      <Row label="Liquidation">
        <span className="text-neg">{s.liqPrice ? usd(s.liqPrice) : "-"}</span>
      </Row>
      <div className="col-span-2 mt-3 flex flex-wrap gap-2 sm:col-span-3">
        {onShare && (
          <Button variant="glass-tide" size="sm" onClick={onShare}>
            ✦ {s.liquidated ? "Share the lesson" : "Share position"}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onWithdraw}>
          Withdraw USDC collateral →
        </Button>
      </div>
    </div>
  );
}

type Payout = "base" | "arbitrum" | "keep";

const PAYOUTS: { id: Payout; label: string }[] = [
  { id: "base", label: "Base wallet" },
  { id: "arbitrum", label: "Arbitrum" },
  { id: "keep", label: "Keep in pool" },
];

/**
 * Close (or reduce) the short, then pay the freed USDC (deposit plus profit) out to the
 * wallet. Closing alone only repays; the USDC would otherwise stay supplied as collateral.
 */
export function CloseShortForm() {
  const { address } = useAccount();
  const client = usePublicClient({ chainId: HUB_CHAIN_ID });
  const s = useShortSummary();
  const { byAddress } = useMarkets();
  const usdcMarket = byAddress(USDC.address);
  const { send, busy, pending } = useTx();
  const toast = useToast();
  const [input, setInput] = useState("");
  // Full close by default. MAX keeps meaning "the whole debt at execution", so borrow fees
  // accrued while the user clicks never leave dust behind.
  const [maxMode, setMaxMode] = useState(true);
  const [payout, setPayout] = useState<Payout>("base");

  const amount = parseAmount(input, NVDA.decimals);
  const full = maxMode || (!!s && !!amount && amount >= s.raw.debt);
  const repay = s ? (full ? s.raw.debt : amount) : undefined;

  const { data: cost } = useReadContract({
    ...contracts.exchange,
    functionName: "quoteBuy",
    args: repay ? [NVDA.address, repay] : undefined,
    query: { enabled: !!repay, refetchInterval: 4_000 },
  });

  if (!s) return <p className="text-body text-ink-2">No open short. Open one in the other tab.</p>;

  const share = repay ? Number(formatUnits(repay, 18)) / s.debt : 0;
  const realized = cost !== undefined ? s.proceeds * share - Number(formatUnits(cost, 6)) : undefined;

  /** Withdraw whatever USDC is no longer needed as margin. */
  const withdrawFreed = async (dstEid: number) => {
    if (!address || !client) return;
    const [[collateral], account] = await Promise.all([
      client.readContract({ ...contracts.pool, functionName: "getUserReserve", args: [address, USDC.address] }),
      client.readContract({ ...contracts.pool, functionName: "getAccountData", args: [address] }),
    ]);
    if (collateral === 0n) return;

    let amountOut = collateral;
    const all = account.debtValue === 0n;
    if (!all) {
      // Other debt remains: keep enough USDC to stay inside the initial margin.
      const ltvBps = BigInt(Math.round((usdcMarket?.ltv ?? 0.6667) * 10_000));
      const spareUsd = account.borrowCapacity > account.debtValue ? account.borrowCapacity - account.debtValue : 0n;
      const free = ((spareUsd * 10_000n) / ltvBps / 10n ** 12n) * 99n / 100n;
      amountOut = free < collateral ? free : collateral;
    }
    if (amountOut === 0n) {
      toast.push({ title: "USDC kept in the pool", description: "It is still backing your other borrows.", tone: "info" });
      return;
    }

    const remote = dstEid !== HUB_EID;
    const fee = remote
      ? ((await client.readContract({
          ...contracts.pool,
          functionName: "quoteDelivery",
          args: [USDC.address, amountOut, dstEid, address],
        })) *
          105n) /
        100n
      : 0n;
    await send(`Withdraw ${formatToken(amountOut, USDC.decimals, 2)} USDC${remote ? " to Arbitrum" : ""}`, {
      ...contracts.pool,
      functionName: "withdraw",
      args: [USDC.address, all ? MAX_UINT : amountOut, address, dstEid],
      value: fee,
    });
  };

  const submit = async () => {
    if (!address || !repay || cost === undefined) return;
    try {
      await send(full ? "Close short" : "Reduce short", {
        ...contracts.shortModule,
        functionName: "closeShort",
        args: [NVDA.address, full ? MAX_UINT : repay, (cost * 101n) / 100n],
      });
      setInput("");
      setMaxMode(true);
      if (payout !== "keep") await withdrawFreed(payout === "arbitrum" ? SPOKE_EID : HUB_EID);
    } catch {
      // Surfaced by useTx. If only the withdrawal failed, the USDC card still offers it.
    }
  };

  const action = full ? "Close short" : "Reduce short";
  const label = payout === "keep" ? action : `${action} & withdraw to ${payout === "arbitrum" ? "Arbitrum" : "Base"}`;

  return (
    <div className="space-y-5">
      <AmountInput
        asset={NVDA}
        value={full && !input ? formatUnits(s.raw.debt, 18) : input}
        onChange={(v) => {
          setInput(v);
          setMaxMode(false);
        }}
        onMax={() => setMaxMode(true)}
        max={s.raw.debt}
        maxLabel="Owed"
        usdPrice={s.price}
      />
      <div>
        <div className="mb-2 text-small text-ink-2">Then send my USDC to</div>
        <div className="grid grid-cols-3 gap-2">
          {PAYOUTS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPayout(p.id)}
              className={cx(
                "rounded-input border px-2 py-2 text-small transition",
                payout === p.id ? "border-brand bg-brand/10 text-ink" : "border-line text-ink-2 hover:bg-raised",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-input border border-line bg-bg px-4 py-3">
        <Row label="Buy back cost">{cost !== undefined ? usd(Number(formatUnits(cost, 6))) : "-"}</Row>
        <Row label="Realized P&L">
          {realized === undefined ? (
            "-"
          ) : (
            <span className={realized >= 0 ? "text-pos" : "text-neg"}>{`${realized >= 0 ? "+" : "−"}${usd(Math.abs(realized))}`}</span>
          )}
        </Row>
        <Row label="Paid from">Your USDC collateral</Row>
      </div>
      <Button variant="glass-tide" size="lg" className="w-full" disabled={!repay || cost === undefined} loading={busy} onClick={submit}>
        {pending ?? label}
      </Button>
      <p className="text-caption text-ink-3">
        {payout === "keep"
          ? "Buys NVDA back at the oracle price plus 0.3% using your posted USDC and repays. The rest of your USDC stays supplied."
          : "Two wallet confirmations: the buy back and repay, then the withdrawal of your freed USDC (deposit plus profit)."}
      </p>
    </div>
  );
}

/** USDC left in the pool after shorts close: deposit plus realized profit, still earning. */
export function UsdcInPoolCard({ onWithdraw }: { onWithdraw: () => void }) {
  const { positions } = usePositions();
  const usdc = positions.find((p) => p.market.meta.address === USDC.address);
  if (!usdc || usdc.collateral === 0n) return null;
  return (
    <Card>
      <CardHeader
        title="Your USDC in the pool"
        sub="Short collateral and realized profit stay supplied (and earn interest) until you withdraw."
        aside={
          <Button size="sm" onClick={onWithdraw}>
            Withdraw
          </Button>
        }
      />
      <div className="px-5 py-4">
        <div className="num text-h3 text-ink">{usd(usdc.collateralUsd)}</div>
        <div className="num text-small text-ink-3">{formatToken(usdc.collateral, USDC.decimals, 2)} USDC</div>
      </div>
    </Card>
  );
}
