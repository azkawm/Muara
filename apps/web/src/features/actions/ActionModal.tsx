import { useEffect, useMemo, useState } from "react";
import { formatEther, formatUnits, parseUnits } from "viem";
import { useAccount } from "wagmi";
import { AmountInput } from "../../components/AmountInput";
import { chainName, ChainSelector } from "../../components/Chains";
import { HealthBar, healthTextClass } from "../../components/HealthGauge";
import { Modal } from "../../components/Modal";
import { Button, Row } from "../../components/ui";
import { contracts, HUB_EID, MAX_UINT } from "../../lib/contracts";
import { formatPct, formatToken, parseAmount } from "../../lib/format";
import { useDeliveryQuote, useWalletBalance } from "../../lib/hooks";
import { useTx } from "../../lib/useTx";
import { accountTotals } from "../account/math";
import { usePositions, type Market } from "../markets/useMarkets";

export type ActionKind = "supply" | "withdraw" | "borrow" | "repay";

const TITLE: Record<ActionKind, string> = { supply: "Supply", withdraw: "Withdraw", borrow: "Borrow", repay: "Repay" };

function intro(kind: ActionKind, market: Market): string {
  const stock = market.meta.kind === "stock";
  switch (kind) {
    case "supply":
      return stock
        ? `Supplied ${market.meta.symbol} backs your borrows and, unless you opt out, is lent to short sellers whose borrow fee you earn.`
        : "Supplied USDC backs your borrows and earns interest from borrowers.";
    case "withdraw":
      return "Withdraw to Base, or have it delivered to Arbitrum through LayerZero. The health check runs on Base before anything leaves.";
    case "borrow":
      return `Borrow against your collateral at up to ${formatPct(market.ltv, 0)} of its value. Deliver to Base or Arbitrum.`;
    case "repay":
      return "Repay debt from your Base wallet.";
  }
}

/** Token units from a float, truncated to what the asset can represent. */
function toUnits(value: number, decimals: number): bigint {
  if (!Number.isFinite(value) || value <= 0) return 0n;
  return parseUnits(value.toFixed(Math.min(decimals, 6)), decimals);
}

export function ActionModal({
  kind,
  market,
  open,
  onOpenChange,
}: {
  kind: ActionKind;
  market: Market;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { address } = useAccount();
  const { positions } = usePositions();
  const { data: wallet } = useWalletBalance(market.meta);
  const { send, ensureAllowance, busy, pending } = useTx();
  const [input, setInput] = useState("");
  // MAX means "all of it when the transaction executes", so interest accrued while the user
  // clicks does not leave dust behind.
  const [maxMode, setMaxMode] = useState(false);
  const [dstEid, setDstEid] = useState<number>(HUB_EID);

  useEffect(() => {
    if (open) {
      setInput("");
      setMaxMode(false);
      setDstEid(HUB_EID);
    }
  }, [open, kind, market.meta.address]);

  const { decimals, symbol } = market.meta;
  const position = positions.find((p) => p.market.meta.address === market.meta.address);
  const amount = parseAmount(input, decimals);
  const units = amount ? Number(formatUnits(amount, decimals)) : 0;
  const delivers = kind === "withdraw" || kind === "borrow";
  const remote = delivers && dstEid !== HUB_EID;

  const before = useMemo(() => accountTotals(positions), [positions]);
  const after = useMemo(
    () =>
      accountTotals(positions, [
        {
          market,
          collateral: kind === "supply" ? units : kind === "withdraw" ? -units : 0,
          debt: kind === "borrow" ? units : kind === "repay" ? -units : 0,
        },
      ]),
    [positions, market, kind, units],
  );

  const max = useMemo<bigint | undefined>(() => {
    switch (kind) {
      case "supply":
        return wallet;
      case "withdraw":
        return position?.collateral;
      case "repay": {
        if (!position?.debt) return 0n;
        return wallet !== undefined && wallet < position.debt ? wallet : position.debt;
      }
      case "borrow": {
        const room = ((before.borrowCapacityUsd - before.debtUsd) / market.price) * 0.995;
        const byCapacity = toUnits(room, decimals);
        return byCapacity < market.borrowable ? byCapacity : market.borrowable;
      }
    }
  }, [kind, wallet, position, before, market, decimals]);

  const { data: fee } = useDeliveryQuote(market.meta, amount, remote ? dstEid : HUB_EID);
  const feeWithHeadroom = remote && fee ? (fee * 105n) / 100n : 0n;

  let error: string | undefined;
  if (amount && max !== undefined && amount > max && !maxMode) {
    error = kind === "borrow" ? "More than you can borrow right now." : kind === "supply" ? "More than your wallet balance." : "More than your position.";
  } else if (amount && (kind === "borrow" || kind === "withdraw") && after.debtUsd > after.borrowCapacityUsd + 1e-9) {
    error = `Exceeds your borrow capacity at the ${formatPct(1 / market.ltv, 0)} initial margin.`;
  } else if (amount && kind === "borrow" && !market.priceFresh) {
    error = "Price is stale; borrowing is paused until it refreshes.";
  }

  const submit = async () => {
    if (!address || !amount) return;
    const pool = contracts.pool;
    try {
      if (kind === "supply") {
        await ensureAllowance(market.meta, pool.address, amount);
        await send(`Supply ${symbol}`, { ...pool, functionName: "supply", args: [market.meta.address, amount, address] });
      } else if (kind === "withdraw") {
        const all = maxMode || (position && amount >= position.collateral);
        await send(`Withdraw ${symbol}${remote ? " to Arbitrum" : ""}`, {
          ...pool,
          functionName: "withdraw",
          args: [market.meta.address, all ? MAX_UINT : amount, address, dstEid],
          value: feeWithHeadroom,
        });
      } else if (kind === "borrow") {
        await send(`Borrow ${symbol}${remote ? " to Arbitrum" : ""}`, {
          ...pool,
          functionName: "borrow",
          args: [market.meta.address, amount, address, dstEid],
          value: feeWithHeadroom,
        });
      } else {
        const all = maxMode || (position && amount >= position.debt);
        await ensureAllowance(market.meta, pool.address, all ? MAX_UINT / 2n : amount);
        await send(`Repay ${symbol}`, {
          ...pool,
          functionName: "repay",
          args: [market.meta.address, all ? MAX_UINT : amount, address],
        });
      }
      onOpenChange(false);
    } catch {
      // useTx already surfaced the error as a toast.
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={`${TITLE[kind]} ${symbol}`} description={intro(kind, market)}>
      <div className="space-y-5">
        <AmountInput
          asset={market.meta}
          value={input}
          onChange={(v) => {
            setInput(v);
            setMaxMode(false);
          }}
          onMax={() => setMaxMode(kind === "withdraw" || kind === "repay")}
          max={max}
          maxLabel={kind === "supply" ? "Wallet" : kind === "borrow" ? "Available" : kind === "repay" ? "Owed" : "Supplied"}
          usdPrice={market.price}
          error={error}
        />

        {delivers && (
          <div>
            <div className="mb-2 text-small text-ink-2">Deliver to</div>
            <ChainSelector value={dstEid} onChange={setDstEid} />
            {remote && market.meta.decimals > 6 && (
              <p className="mt-2 text-caption text-ink-3">
                Cross-chain amounts carry 6 decimals; any smaller remainder stays in your position.
              </p>
            )}
          </div>
        )}

        <div className="rounded-input border border-line bg-bg/25 px-4 py-3">
          <Row label="Health factor">
            <span className={healthTextClass(before.healthFactor)}>{fmtHf(before.healthFactor)}</span>
            <span className="mx-1.5 text-ink-3">→</span>
            <span className={healthTextClass(after.healthFactor)}>{fmtHf(after.healthFactor)}</span>
          </Row>
          <HealthBar hf={after.healthFactor} className="my-2" />
          <Row label="Borrow capacity used">
            {formatPct(after.borrowCapacityUsd > 0 ? after.debtUsd / after.borrowCapacityUsd : 0, 1)}
          </Row>
          <Row label={kind === "borrow" || kind === "repay" ? "Borrow APY" : "Supply APY"}>
            {formatPct(kind === "borrow" || kind === "repay" ? market.borrowApy : market.supplyApy)}
          </Row>
          {delivers && (
            <Row label="LayerZero fee">
              {remote ? (fee !== undefined ? `${Number(formatEther(fee)).toFixed(6)} ETH` : "…") : "None"}
            </Row>
          )}
          {delivers && <Row label="Arrives on">{chainName(dstEid)}</Row>}
        </div>

        <Button variant="glass" className="w-full" size="lg" disabled={!amount || !!error || !address} loading={busy} onClick={submit}>
          {pending ?? (address ? `${TITLE[kind]} ${amount ? formatToken(amount, decimals) : ""} ${symbol}` : "Connect a wallet")}
        </Button>
      </div>
    </Modal>
  );
}

function fmtHf(hf: number) {
  return Number.isFinite(hf) ? hf.toFixed(2) : "∞";
}
