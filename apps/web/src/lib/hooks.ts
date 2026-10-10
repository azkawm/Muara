import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { erc20Abi, type Address } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { api, API_URL } from "./api";
import { contracts, HUB_CHAIN_ID, HUB_EID, NVDA, type AssetMeta } from "./contracts";

/** Matches IMuaraLens.Action. */
export const LensAction = { Supply: 0, Withdraw: 1, Borrow: 2, Repay: 3 } as const;
export type LensActionId = (typeof LensAction)[keyof typeof LensAction];

/** Matches DataTypes.Session. */
export const SESSION_LABEL = ["Open", "Pre-close", "Closed", "Weekend"] as const;

export function useReserves() {
  return useReadContract({ ...contracts.lens, functionName: "getReserves", query: { refetchInterval: 5_000 } });
}

export function useSession() {
  return useReadContract({ ...contracts.lens, functionName: "session", query: { refetchInterval: 30_000 } });
}

export function useUserView() {
  const { address } = useAccount();
  return useReadContract({
    ...contracts.lens,
    functionName: "getUser",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 4_000 },
  });
}

export function usePreview(action: LensActionId, asset: Address, amount: bigint | undefined) {
  const { address } = useAccount();
  return useReadContract({
    ...contracts.lens,
    functionName: "previewAction",
    args: address && amount ? [address, action, asset, amount] : undefined,
    query: { enabled: !!address && !!amount },
  });
}

export function useShortView(asset: AssetMeta = NVDA) {
  const { address } = useAccount();
  return useReadContract({
    ...contracts.lens,
    functionName: "getShort",
    args: address ? [address, asset.address] : undefined,
    query: { enabled: !!address, refetchInterval: 3_000 },
  });
}

export function useRewardsPreview(asset: AssetMeta) {
  const { address } = useAccount();
  return useReadContract({
    ...contracts.rewardsModule,
    functionName: "previewClaimInUsdc",
    args: address ? [address, asset.address] : undefined,
    query: { enabled: !!address, refetchInterval: 6_000 },
  });
}

export function useWalletBalance(asset: AssetMeta) {
  const { address } = useAccount();
  return useReadContract({
    address: asset.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    chainId: HUB_CHAIN_ID,
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 6_000 },
  });
}

/** LayerZero fee for delivering to `dstEid`; zero for local delivery. */
export function useDeliveryQuote(asset: AssetMeta, amount: bigint | undefined, dstEid: number) {
  const { address } = useAccount();
  const remote = dstEid !== HUB_EID;
  return useReadContract({
    ...contracts.pool,
    functionName: "quoteDelivery",
    args: address && amount && remote ? [asset.address, amount, dstEid, address] : undefined,
    query: { enabled: !!address && !!amount && remote },
  });
}

/** The pool owner is the deployer, which is also the backend's admin wallet. */
export function useIsAdmin(): boolean {
  const { address } = useAccount();
  const { data: owner } = useReadContract({ ...contracts.pool, functionName: "owner" });
  return !!address && !!owner && owner.toLowerCase() === address.toLowerCase();
}

export function usePrice() {
  return useQuery({ queryKey: ["price"], queryFn: api.price, refetchInterval: 2_000 });
}

// ------------------------------------------------------------------ price series

/**
 * Oracle price history from the backend (indexed PriceUpdated events) plus the live poll,
 * resampled onto a fixed grid with forward fill. A time-proportional line keeps a quiet hour
 * and a 15 second scenario in true proportion, and the chart survives reloads.
 */
export interface PricePoint {
  time: number;
  value: number;
}

const GRID_S = 5;
const WINDOW_MIN = 60;

function resample(raw: PricePoint[], now: number): PricePoint[] {
  if (!raw.length) return [];
  const sorted = [...raw].sort((a, b) => a.time - b.time);
  const from = Math.max(sorted[0]!.time, now - WINDOW_MIN * 60);
  const out: PricePoint[] = [];
  let i = 0;
  let value = sorted[0]!.value;
  for (let t = Math.floor(from / GRID_S) * GRID_S; t <= now; t += GRID_S) {
    while (i < sorted.length && sorted[i]!.time <= t) value = sorted[i++]!.value;
    out.push({ time: t, value });
  }
  return out;
}

export function usePriceSeries(): PricePoint[] {
  const { data: live } = usePrice();
  const history = useQuery({
    queryKey: ["price-history"],
    queryFn: () => fetch(`${API_URL}/price/history?minutes=${WINDOW_MIN}`).then((r) => r.json() as Promise<{ points: { time: number; value: string }[] }>),
    refetchInterval: 30_000,
  });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), GRID_S * 1000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    void tick;
    const raw: PricePoint[] = (history.data?.points ?? []).map((p) => ({ time: p.time, value: Number(p.value) }));
    if (live) raw.push({ time: live.updatedAt, value: Number(live.price) });
    return resample(raw, Math.floor(Date.now() / 1000));
  }, [history.data, live, tick]);
}
