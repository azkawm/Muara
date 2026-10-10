import { getAddress, maxUint256, type Address } from "viem";
import { inArray } from "drizzle-orm";
import type { BaseClient, HubWallet } from "../chain/clients.js";
import { hub, STOCK_ASSET } from "../chain/contracts.js";
import { withGasBuffer } from "../chain/gas.js";
import type { Db } from "../db/client.js";
import { events } from "../db/schema.js";
import type { Logger } from "../lib/log.js";
import { WAD } from "../lib/units.js";

export interface Position {
  user: Address;
  healthFactor: bigint;
  debtValue: bigint;
  collateralValue: bigint;
  pricesFresh: boolean;
}

export interface KeeperAction {
  at: number;
  user: Address;
  status: "liquidated" | "failed";
  collateralAsset?: Address;
  debtAsset?: Address;
  debtRepaid?: bigint;
  collateralSeized?: bigint;
  txHash?: string;
  reason?: string;
}

/** Positions below this health factor are listed as at risk for the admin panel. */
const WATCH_HEALTH = (WAD * 12n) / 10n;
const MAX_ACTIONS = 50;

/**
 * Watches every account that has ever borrowed and liquidates any whose health factor drops
 * below 1 while prices are fresh. Repays the largest debt against the largest collateral,
 * buying stock on the exchange first when it needs to cover a short.
 */
export class Keeper {
  private positions: Position[] = [];
  private ready = false;
  private actions: KeeperAction[] = [];

  constructor(
    private readonly client: BaseClient,
    private readonly wallet: HubWallet,
    private readonly db: Db,
    private readonly log: Logger,
  ) {}

  get address() {
    return this.wallet.account.address;
  }

  get atRisk(): Position[] {
    return this.positions.filter((p) => p.debtValue > 0n && p.healthFactor < WATCH_HEALTH);
  }

  get trackedCount(): number {
    return this.positions.length;
  }

  get recentActions(): KeeperAction[] {
    return this.actions;
  }

  /** One-time approvals so liquidations and stock purchases never wait on an extra tx. */
  async init(): Promise<void> {
    const approvals = [
      { token: hub.usdc, spender: hub.pool.address },
      { token: hub.nvda, spender: hub.pool.address },
      { token: hub.usdc, spender: hub.exchange.address },
    ] as const;
    for (const { token, spender } of approvals) {
      const allowance = await this.client.readContract({
        address: token.address,
        abi: token.abi,
        functionName: "allowance",
        args: [this.address, spender],
      });
      if (allowance > maxUint256 / 2n) continue;
      const { request } = await this.client.simulateContract({
        address: token.address,
        abi: token.abi,
        functionName: "approve",
        args: [spender, maxUint256],
        account: this.wallet.account,
      });
      const gas = withGasBuffer(await this.client.estimateContractGas(request));
      const hash = await this.wallet.writeContract({ ...request, gas });
      await this.client.waitForTransactionReceipt({ hash });
      this.log.info({ token: token.address, spender }, "keeper approval set");
    }
  }

  async tick(): Promise<void> {
    if (!this.ready) {
      await this.init();
      this.ready = true;
    }
    const borrowers = await this.borrowers();
    if (!borrowers.length) return;

    const results = await this.client.multicall({
      contracts: borrowers.map((user) => ({ ...hub.pool, functionName: "getAccountData", args: [user] }) as const),
      allowFailure: true,
    });

    this.positions = borrowers.flatMap((user, i) => {
      const r = results[i];
      if (r?.status !== "success") return [];
      const a = r.result;
      return [
        {
          user,
          healthFactor: a.healthFactor,
          debtValue: a.debtValue,
          collateralValue: a.collateralValue,
          pricesFresh: a.pricesFresh,
        },
      ];
    });

    for (const p of this.positions) {
      if (p.debtValue === 0n || p.healthFactor >= WAD) continue;
      if (!p.pricesFresh) {
        this.log.warn({ user: p.user }, "liquidatable but prices are stale, liquidation paused");
        continue;
      }
      await this.liquidate(p.user);
    }
  }

  private async borrowers(): Promise<Address[]> {
    const rows = await this.db
      .selectDistinct({ account: events.account })
      .from(events)
      .where(inArray(events.name, ["Borrow"]))
      .all();
    return rows.flatMap((r) => (r.account ? [getAddress(r.account)] : []));
  }

  private async liquidate(user: Address): Promise<void> {
    const view = await this.client.readContract({ ...hub.lens, functionName: "getUser", args: [user] });
    const debt = maxBy(view.reserves, (r) => r.debtValue);
    const collateral = maxBy(view.reserves, (r) => r.collateralValue);
    if (!debt || debt.debt === 0n || !collateral || collateral.collateral === 0n) return;

    try {
      await this.ensureBalance(debt.asset, debt.debt);
      const { request, result } = await this.client.simulateContract({
        ...hub.pool,
        functionName: "liquidate",
        args: [collateral.asset, debt.asset, user, maxUint256],
        account: this.wallet.account,
      });
      const gas = withGasBuffer(await this.client.estimateContractGas(request));
      const hash = await this.wallet.writeContract({ ...request, gas });
      const receipt = await this.client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`liquidate reverted in ${hash}`);

      const [debtRepaid, collateralSeized] = result;
      this.record({
        at: Date.now(),
        user,
        status: "liquidated",
        collateralAsset: collateral.asset,
        debtAsset: debt.asset,
        debtRepaid,
        collateralSeized,
        txHash: hash,
      });
      this.log.info({ user, hash, debtRepaid: debtRepaid.toString() }, "position liquidated");
    } catch (err) {
      const reason = err instanceof Error ? err.message.split("\n")[0] : String(err);
      this.record({ at: Date.now(), user, status: "failed", debtAsset: debt.asset, reason });
      this.log.error({ err, user }, "liquidation failed");
    }
  }

  /** Top up the debt asset. Stock is bought from the exchange with USDC. */
  private async ensureBalance(asset: Address, needed: bigint): Promise<void> {
    const token = asset.toLowerCase() === STOCK_ASSET.toLowerCase() ? hub.nvda : hub.usdc;
    const balance = await this.client.readContract({
      address: token.address,
      abi: token.abi,
      functionName: "balanceOf",
      args: [this.address],
    });
    if (balance >= needed) return;
    if (token === hub.usdc) throw new Error("keeper needs more USDC to repay this debt");

    const shortfall = needed - balance;
    const cost = await this.client.readContract({
      ...hub.exchange,
      functionName: "quoteBuy",
      args: [asset, shortfall],
    });
    const { request } = await this.client.simulateContract({
      ...hub.exchange,
      functionName: "buy",
      args: [asset, shortfall, (cost * 102n) / 100n, this.address],
      account: this.wallet.account,
    });
    const gas = withGasBuffer(await this.client.estimateContractGas(request));
    const hash = await this.wallet.writeContract({ ...request, gas });
    const receipt = await this.client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`stock purchase reverted in ${hash}`);
    this.log.info({ shortfall: shortfall.toString(), hash }, "keeper bought stock to repay");
  }

  private record(action: KeeperAction) {
    this.actions = [action, ...this.actions].slice(0, MAX_ACTIONS);
  }
}

function maxBy<T>(items: readonly T[], key: (t: T) => bigint): T | undefined {
  let best: T | undefined;
  for (const item of items) if (!best || key(item) > key(best)) best = item;
  return best;
}
