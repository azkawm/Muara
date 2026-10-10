import { useState } from "react";
import { formatEther, formatUnits } from "viem";
import { useAccount } from "wagmi";
import { ChainSelector } from "../../components/Chains";
import { Badge, Button, Card, CardHeader, Row } from "../../components/ui";
import { contracts, HUB_EID, NVDA, USDC, type AssetMeta } from "../../lib/contracts";
import { formatToken } from "../../lib/format";
import { useDeliveryQuote, useRewardsPreview } from "../../lib/hooks";
import { useTx } from "../../lib/useTx";
import { usePositions } from "../markets/useMarkets";

/** Gold particles drifting from the short side into the holder's collateral. */
function FeeStream() {
  return (
    <svg viewBox="0 0 240 40" className="h-10 w-full" aria-hidden>
      <path d="M0 20 C 60 4, 120 36, 240 20" fill="none" stroke="var(--border)" strokeWidth="1.5" />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} r="2.5" fill="var(--silt)">
          <animateMotion dur="4s" begin={`${i * 0.8}s`} repeatCount="indefinite" path="M0 20 C 60 4, 120 36, 240 20" />
        </circle>
      ))}
      <text x="0" y="38" fontSize="9" fill="var(--text-3)">
        short sellers
      </text>
      <text x="240" y="38" fontSize="9" fill="var(--text-3)" textAnchor="end">
        your collateral
      </text>
    </svg>
  );
}

function RewardLine({ asset }: { asset: AssetMeta }) {
  const { address } = useAccount();
  const { data } = useRewardsPreview(asset);
  const { send, busy, pending } = useTx();
  const [dstEid, setDstEid] = useState<number>(HUB_EID);
  const [claimable, usdcOut] = data ?? [0n, 0n];
  const remote = dstEid !== HUB_EID;
  const { data: fee } = useDeliveryQuote(USDC, usdcOut > 0n ? usdcOut : undefined, dstEid);
  if (claimable === 0n) return null;

  const claimUsdc = () =>
    send(`Claim ${asset.symbol} rewards as USDC`, {
      ...contracts.rewardsModule,
      functionName: "claimInUsdc",
      args: [asset.address, (usdcOut * 99n) / 100n, address!, dstEid],
      value: remote && fee ? (fee * 105n) / 100n : 0n,
    }).catch(() => {});

  const claimInKind = () =>
    send(`Claim ${asset.symbol} rewards`, {
      ...contracts.pool,
      functionName: "claimRewards",
      args: [asset.address, address!, HUB_EID],
    }).catch(() => {});

  return (
    <div className="grid items-center gap-6 md:grid-cols-[1fr_1fr]">
      <div>
        <div className="flex items-center gap-3">
          <div className="text-caption tracking-wide text-ink-3 uppercase">Claimable from {asset.symbol} lending</div>
          <Badge tone="silt">Paid in USDC</Badge>
        </div>
        <div className="num mt-1 text-h1 leading-none text-silt">${Number(formatUnits(usdcOut, 6)).toFixed(2)}</div>
        <div className="num mt-2 text-small text-ink-3">
          {formatToken(claimable, asset.decimals, 6)} {asset.symbol} earned
        </div>
        <p className="mt-3 text-caption text-ink-3">Leave rewards unclaimed to keep compounding them in {asset.symbol}.</p>
      </div>
      <div className="space-y-3">
        <ChainSelector value={dstEid} onChange={setDstEid} />
        {remote && <Row label="LayerZero fee">{fee !== undefined ? `${Number(formatEther(fee)).toFixed(6)} ETH` : "…"}</Row>}
        <div className="flex gap-2">
          <Button variant="glass" className="flex-1" onClick={claimUsdc} loading={busy && pending?.includes("USDC")} disabled={busy}>
            Claim as USDC
          </Button>
          {asset.kind === "stock" && (
            <Button variant="secondary" onClick={claimInKind} disabled={busy || remote}>
              Claim as {asset.symbol}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function RewardsCard() {
  const { positions } = usePositions();
  const earning = positions.filter((p) => p.claimableRewards > 0n);
  const lending = positions.some((p) => p.market.meta.kind === "stock" && p.collateral > 0n && p.lendable);
  if (!earning.length && !lending) return null;

  return (
    <Card>
      <CardHeader title="Collateral that works" sub="Short sellers pay a borrow fee on the stock you lend. It is yours to claim." />
      <div className="grid items-center gap-8 px-6 py-6 lg:grid-cols-[260px_1fr]">
        <FeeStream />
        {earning.length ? (
          <div className="space-y-8">
            {[NVDA, USDC]
              .filter((a) => earning.some((p) => p.market.meta.address === a.address))
              .map((a) => (
                <RewardLine key={a.address} asset={a} />
              ))}
          </div>
        ) : (
          <p className="text-body text-ink-2">Your stock is lent out. Rewards appear here as short sellers pay fees.</p>
        )}
      </div>
    </Card>
  );
}
