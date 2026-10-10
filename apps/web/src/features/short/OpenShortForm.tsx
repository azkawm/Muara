import { useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { AmountInput } from "../../components/AmountInput";
import { HealthBar, healthTextClass } from "../../components/HealthGauge";
import { Button, Row, Tip } from "../../components/ui";
import { contracts, NVDA, USDC } from "../../lib/contracts";
import { formatPct, parseAmount } from "../../lib/format";
import { useWalletBalance } from "../../lib/hooks";
import { useTx } from "../../lib/useTx";
import { accountTotals, liquidationPrice } from "../account/math";
import { useMarkets, usePositions } from "../markets/useMarkets";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Supply USDC, borrow stock, sell it and post the proceeds as collateral, in one transaction. */
export function OpenShortForm({ onOpened }: { onOpened?: () => void }) {
  const { address } = useAccount();
  const { byAddress } = useMarkets();
  const { positions } = usePositions();
  const { data: wallet } = useWalletBalance(USDC);
  const { send, ensureAllowance, busy, pending } = useTx();
  const [collIn, setCollIn] = useState("");
  const [sizeIn, setSizeIn] = useState("");

  const nvda = byAddress(NVDA.address);
  const usdc = byAddress(USDC.address);
  const collateral = parseAmount(collIn, USDC.decimals) ?? 0n;
  const size = parseAmount(sizeIn, NVDA.decimals);

  const { data: proceeds } = useReadContract({
    ...contracts.exchange,
    functionName: "quoteSell",
    args: size ? [NVDA.address, size] : undefined,
    query: { enabled: !!size, refetchInterval: 4_000 },
  });

  const view = useMemo(() => {
    if (!nvda || !usdc) return undefined;
    const sizeUnits = size ? Number(formatUnits(size, NVDA.decimals)) : 0;
    const proceedsUnits = proceeds ? Number(formatUnits(proceeds, USDC.decimals)) : 0;
    const collUnits = Number(formatUnits(collateral, USDC.decimals));
    const deltas = [
      { market: usdc, collateral: collUnits + proceedsUnits },
      { market: nvda, debt: sizeUnits },
    ];
    const before = accountTotals(positions);
    const after = accountTotals(positions, deltas);
    // USDC needed so the new debt fits inside the initial margin, counting the sale proceeds.
    const required = Math.max(0, (before.debtUsd + sizeUnits * nvda.price - before.borrowCapacityUsd) / usdc.ltv - proceedsUnits);
    return {
      sizeUnits,
      proceedsUnits,
      before,
      after,
      required,
      liqPrice: sizeUnits > 0 ? liquidationPrice(positions, nvda, deltas) : undefined,
      notional: sizeUnits * nvda.price,
    };
  }, [nvda, usdc, size, proceeds, collateral, positions]);

  if (!nvda || !usdc || !view) return null;

  let error: string | undefined;
  if (size && size > nvda.borrowable) error = `Only ${Number(formatUnits(nvda.borrowable, 18)).toFixed(2)} NVDA can be borrowed right now.`;
  else if (wallet !== undefined && collateral > wallet) error = "More USDC than your wallet holds.";
  else if (size && view.after.debtUsd > view.after.borrowCapacityUsd) error = `Add at least ${usd(view.required)} USDC to meet the ${formatPct(1 / usdc.ltv, 0)} initial margin.`;
  else if (size && !nvda.priceFresh) error = "Price is stale; shorting is paused until it refreshes.";

  const submit = async () => {
    if (!address || !size || !proceeds) return;
    try {
      if (collateral > 0n) await ensureAllowance(USDC, contracts.shortModule.address, collateral);
      await send(`Open short ${view.sizeUnits} NVDA`, {
        ...contracts.shortModule,
        functionName: "openShort",
        args: [NVDA.address, collateral, size, (proceeds * 99n) / 100n],
      });
      setCollIn("");
      setSizeIn("");
      onOpened?.();
    } catch {
      // Surfaced by useTx.
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 text-small text-ink-2">Short size</div>
        <AmountInput asset={NVDA} value={sizeIn} onChange={setSizeIn} max={nvda.borrowable} maxLabel="Lendable" usdPrice={nvda.price} />
      </div>
      <div>
        <div className="mb-2 text-small text-ink-2">USDC collateral</div>
        <AmountInput asset={USDC} value={collIn} onChange={setCollIn} max={wallet} maxLabel="Wallet" usdPrice={1} error={error} />
        {size && view.required > 0 && (
          <button type="button" className="mt-1.5 text-small text-brand hover:underline" onClick={() => setCollIn((Math.ceil(view.required * 100) / 100).toString())}>
            Use minimum: {usd(Math.ceil(view.required * 100) / 100)}
          </button>
        )}
      </div>

      <div className="rounded-input border border-line bg-bg px-4 py-3">
        <Row label="Sell at oracle price">{view.proceedsUnits ? usd(view.proceedsUnits) : "-"}</Row>
        <Row label="Entry price">{view.sizeUnits ? usd(view.proceedsUnits / view.sizeUnits) : "-"}</Row>
        <Row label="Borrow fee (APY)">{formatPct(nvda.borrowApy)}</Row>
        <Row
          label={
            <Tip content="Collateral at the liquidation threshold divided by debt. Below 1.00 the keeper can liquidate. Shown as now → after this short.">
              <span className="cursor-help underline decoration-dotted underline-offset-4">Health factor</span>
            </Tip>
          }
        >
          {view.sizeUnits > 0 ? (
            <>
              <span className={healthTextClass(view.before.healthFactor)}>{fmtHf(view.before.healthFactor)}</span>
              <span className="mx-1.5 text-ink-3">→</span>
              <span className={healthTextClass(view.after.healthFactor)}>{fmtHf(view.after.healthFactor)}</span>
            </>
          ) : (
            <span className={healthTextClass(view.before.healthFactor)}>{fmtHf(view.before.healthFactor)}</span>
          )}
        </Row>
        <HealthBar hf={view.sizeUnits > 0 ? view.after.healthFactor : view.before.healthFactor} className="my-2" />
        <div className="mb-2 flex justify-between text-caption text-ink-3">
          <span>0</span>
          <span className="text-hf-critical">1.00 liquidation line</span>
          <span>3+</span>
        </div>
        <Row
          label={
            <Tip content="If NVDA rises to this price, your health factor hits 1.00 and the position can be liquidated.">
              <span className="cursor-help underline decoration-dotted underline-offset-4">Liquidation price</span>
            </Tip>
          }
        >
          {view.sizeUnits === 0 ? (
            <span className="text-ink-3">Enter a size</span>
          ) : view.liqPrice ? (
            <span className="text-neg">
              {usd(view.liqPrice)} <span className="text-ink-3">(+{(((view.liqPrice - nvda.price) / nvda.price) * 100).toFixed(1)}%)</span>
            </span>
          ) : (
            <span className="text-ink-3">Not reachable</span>
          )}
        </Row>
      </div>

      <Button variant="glass-tide" size="lg" className="w-full" disabled={!size || !proceeds || !!error || !address} loading={busy} onClick={submit}>
        {pending ?? (address ? "Open short" : "Connect a wallet")}
      </Button>
      <p className="text-caption text-ink-3">
        One transaction: post USDC, borrow NVDA from holders, sell it at the oracle price minus 0.3%, and keep the proceeds as collateral.
      </p>
    </div>
  );
}

const fmtHf = (hf: number) => (Number.isFinite(hf) ? hf.toFixed(2) : "∞");
