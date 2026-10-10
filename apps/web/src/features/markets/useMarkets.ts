import { useMemo } from "react";
import { formatUnits } from "viem";
import { assetByAddress, type AssetMeta } from "../../lib/contracts";
import { useReserves, useUserView } from "../../lib/hooks";
import { rayToApy, rayToFraction } from "../../lib/rates";

export interface Market {
  meta: AssetMeta;
  /** USD per whole token. */
  price: number;
  priceWad: bigint;
  priceFresh: boolean;
  totalSupplied: bigint;
  totalLendable: bigint;
  totalBorrowed: bigint;
  availableLiquidity: bigint;
  utilization: number;
  supplyApy: number;
  borrowApy: number;
  ltv: number;
  liquidationThreshold: number;
  liquidationBonus: number;
  maxUtilization: number;
  borrowEnabled: boolean;
  active: boolean;
  /** Most that can be borrowed right now: idle cash and the utilization cap. */
  borrowable: bigint;
}

export function useMarkets() {
  const query = useReserves();
  const markets = useMemo<Market[]>(() => {
    if (!query.data) return [];
    return query.data.flatMap((r) => {
      const meta = assetByAddress(r.asset);
      if (!meta) return [];
      const capRoom = (r.totalLendable * BigInt(r.maxUtilizationBps)) / 10_000n;
      const capLeft = capRoom > r.totalBorrowed ? capRoom - r.totalBorrowed : 0n;
      return [
        {
          meta,
          price: Number(formatUnits(r.price, 18)),
          priceWad: r.price,
          priceFresh: r.priceFresh,
          totalSupplied: r.totalSupplied,
          totalLendable: r.totalLendable,
          totalBorrowed: r.totalBorrowed,
          availableLiquidity: r.availableLiquidity,
          utilization: rayToFraction(r.utilization),
          supplyApy: rayToApy(r.supplyRate),
          borrowApy: rayToApy(r.borrowRate),
          ltv: r.ltvBps / 10_000,
          liquidationThreshold: r.liquidationThresholdBps / 10_000,
          liquidationBonus: r.liquidationBonusBps / 10_000,
          maxUtilization: r.maxUtilizationBps / 10_000,
          borrowEnabled: r.borrowEnabled,
          active: r.active,
          borrowable: capLeft < r.availableLiquidity ? capLeft : r.availableLiquidity,
        },
      ];
    });
  }, [query.data]);
  return { ...query, markets, byAddress: (a: string) => markets.find((m) => m.meta.address.toLowerCase() === a.toLowerCase()) };
}

export interface Position {
  market: Market;
  collateral: bigint;
  debt: bigint;
  lendable: boolean;
  claimableRewards: bigint;
  collateralUsd: number;
  debtUsd: number;
}

export function usePositions() {
  const { markets } = useMarkets();
  const user = useUserView();
  const positions = useMemo<Position[]>(() => {
    if (!user.data) return [];
    return user.data.reserves.flatMap((r) => {
      const market = markets.find((m) => m.meta.address.toLowerCase() === r.asset.toLowerCase());
      if (!market) return [];
      return [
        {
          market,
          collateral: r.collateral,
          debt: r.debt,
          lendable: r.lendable,
          claimableRewards: r.claimableRewards,
          collateralUsd: Number(formatUnits(r.collateralValue, 18)),
          debtUsd: Number(formatUnits(r.debtValue, 18)),
        },
      ];
    });
  }, [user.data, markets]);
  return { positions, account: user.data?.account, isLoading: user.isLoading };
}
