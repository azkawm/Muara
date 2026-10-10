import { SCENARIOS, type ScenarioId } from "@muara/shared";
import type { BaseClient, HubWallet } from "../chain/clients.js";
import { hub, STOCK_ASSET } from "../chain/contracts.js";
import { withGasBuffer } from "../chain/gas.js";
import type { Logger } from "../lib/log.js";
import { sleep } from "../lib/loop.js";
import { pricePath, scenarioTarget } from "./path.js";

export interface RunnerOptions {
  anchor: bigint;
  durationMs: number;
  steps: number;
  refreshAgeS: number;
}

export interface ScenarioRun {
  id: ScenarioId | "custom";
  from: bigint;
  to: bigint;
  path: bigint[];
  step: number;
  startedAt: number;
  finishedAt?: number;
  status: "running" | "done" | "failed";
  error?: string;
  txHashes: string[];
}

export class ScenarioBusyError extends Error {
  constructor() {
    super("A price scenario is already running");
  }
}

/**
 * Drives the mock oracle. Keeps the NVDA price fresh with a heartbeat and plays scenarios as
 * a series of gradual price steps so health factors visibly drain or recover on screen.
 */
export class PriceRunner {
  private anchor: bigint;
  private current: ScenarioRun | undefined;

  constructor(
    private readonly client: BaseClient,
    private readonly wallet: HubWallet,
    private readonly opts: RunnerOptions,
    private readonly log: Logger,
  ) {
    this.anchor = opts.anchor;
  }

  get updaterAddress() {
    return this.wallet.account.address;
  }

  get anchorPrice() {
    return this.anchor;
  }

  setAnchor(price: bigint) {
    if (price <= 0n) throw new Error("anchor must be positive");
    this.anchor = price;
    this.log.info({ anchor: price.toString() }, "anchor price set");
  }

  get scenario(): ScenarioRun | undefined {
    return this.current;
  }

  get busy(): boolean {
    return this.current?.status === "running";
  }

  async readPrice(): Promise<{ price: bigint; updatedAt: bigint }> {
    const [price, updatedAt] = await this.client.readContract({
      ...hub.oracle,
      functionName: "getPrice",
      args: [STOCK_ASSET],
    });
    return { price, updatedAt };
  }

  /** Re-push the current price when it is getting old, unless a scenario is moving it. */
  async heartbeat(): Promise<void> {
    if (this.busy) return;
    const { price, updatedAt } = await this.readPrice();
    const age = Math.floor(Date.now() / 1000) - Number(updatedAt);
    if (age < this.opts.refreshAgeS) return;
    this.log.info({ age, price: price.toString() }, "refreshing stale price");
    await this.push(price);
  }

  /** Start a named scenario. Returns immediately; progress is visible through `scenario`. */
  async startScenario(id: ScenarioId): Promise<ScenarioRun> {
    const def = SCENARIOS[id];
    const to = scenarioTarget(id, this.anchor);
    return this.start(id, to, def.mode === "gap" ? 1 : this.opts.steps);
  }

  /** Move gradually to an explicit price, e.g. $190 for the demo short squeeze. */
  async startCustom(to: bigint): Promise<ScenarioRun> {
    if (to <= 0n) throw new Error("target price must be positive");
    return this.start("custom", to, this.opts.steps);
  }

  /** Set the price in one update, no stepping. */
  async setNow(price: bigint): Promise<ScenarioRun> {
    if (price <= 0n) throw new Error("price must be positive");
    return this.start("custom", price, 1);
  }

  private async start(id: ScenarioRun["id"], to: bigint, steps: number): Promise<ScenarioRun> {
    if (this.busy) throw new ScenarioBusyError();
    const { price: from } = await this.readPrice();
    const run: ScenarioRun = {
      id,
      from,
      to,
      path: pricePath(from, to, steps),
      step: 0,
      startedAt: Date.now(),
      status: "running",
      txHashes: [],
    };
    this.current = run;
    this.log.info({ id, from: from.toString(), to: to.toString(), steps }, "scenario started");
    void this.play(run);
    return run;
  }

  private async play(run: ScenarioRun): Promise<void> {
    const interval = run.path.length > 1 ? this.opts.durationMs / run.path.length : 0;
    try {
      for (const price of run.path) {
        const stepStart = Date.now();
        run.txHashes.push(await this.push(price));
        run.step += 1;
        const wait = interval - (Date.now() - stepStart);
        if (wait > 0 && run.step < run.path.length) await sleep(wait);
      }
      run.status = "done";
      this.log.info({ id: run.id, to: run.to.toString() }, "scenario finished");
    } catch (err) {
      run.status = "failed";
      run.error = err instanceof Error ? err.message : String(err);
      this.log.error({ err, id: run.id }, "scenario failed");
    } finally {
      run.finishedAt = Date.now();
    }
  }

  private async push(price: bigint): Promise<string> {
    const { request } = await this.client.simulateContract({
      ...hub.oracle,
      functionName: "setPrice",
      args: [STOCK_ASSET, price],
      account: this.wallet.account,
    });
    const gas = withGasBuffer(await this.client.estimateContractGas(request));
    const hash = await this.wallet.writeContract({ ...request, gas });
    const receipt = await this.client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`setPrice reverted in ${hash}`);
    this.log.debug({ price: price.toString(), hash }, "price pushed");
    return hash;
  }
}
