import { allowlistAbi, DEPLOYMENTS } from "@muara/shared";
import { eq } from "drizzle-orm";
import {
  createWalletClient,
  http,
  parseEther,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { arbitrumSepolia, baseSepolia } from "viem/chains";
import type { ChainClients } from "../chain/clients.js";
import type { Config } from "../config/env.js";
import type { Db } from "../db/client.js";
import { faucetClaims } from "../db/schema.js";
import type { Logger } from "../lib/log.js";

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface FaucetResult {
  address: Address;
  allowlisted: { base: Hex | "already"; arbitrum: Hex | "already" };
  gas: { base: Hex | "enough"; arbitrum: Hex | "enough" };
  nextClaimAt: number;
}

/**
 * Gets a fresh wallet ready for the demo flow: allowlists it for the stock token on both
 * chains and tops up gas, from the deployer (owner of the allowlists). Token minting itself
 * stays with the user through the on-chain faucets, so this never hands out assets directly.
 */
export class Faucet {
  private readonly base: WalletClient<Transport, Chain, Account>;
  private readonly arbitrum: WalletClient<Transport, Chain, Account>;

  constructor(
    private readonly config: Config,
    private readonly db: Db,
    private readonly clients: { base: ChainClients["base"]; arbitrum: ChainClients["arbitrum"] },
    private readonly log: Logger,
  ) {
    const account = privateKeyToAccount(config.PRIVATE_KEY, { nonceManager });
    this.base = createWalletClient({ account, chain: baseSepolia, transport: http(config.BASE_SEPOLIA_RPC_URL) });
    this.arbitrum = createWalletClient({ account, chain: arbitrumSepolia, transport: http(config.ARBITRUM_SEPOLIA_RPC_URL) });
  }

  get address() {
    return this.base.account.address;
  }

  /** Both public clients share the PublicClient surface used here. */
  private pick(chain: "base" | "arbitrum"): { client: PublicClient; wallet: WalletClient<Transport, Chain, Account> } {
    return chain === "base"
      ? { client: this.clients.base as unknown as PublicClient, wallet: this.base }
      : { client: this.clients.arbitrum as unknown as PublicClient, wallet: this.arbitrum };
  }

  async status(address: Address): Promise<{ nextClaimAt: number; allowlisted: boolean }> {
    const row = await this.db.select().from(faucetClaims).where(eq(faucetClaims.address, address.toLowerCase())).get();
    const allowlisted = await this.clients.base.readContract({
      address: DEPLOYMENTS.baseSepolia.tokens.allowlist,
      abi: allowlistAbi,
      functionName: "isAllowed",
      args: [address],
    });
    return { nextClaimAt: row ? row.claimedAt + COOLDOWN_MS : 0, allowlisted };
  }

  async prepare(address: Address): Promise<FaucetResult> {
    const { nextClaimAt } = await this.status(address);
    if (nextClaimAt > Date.now()) {
      const err = new Error(`Faucet already used; try again after ${new Date(nextClaimAt).toISOString()}`);
      (err as Error & { status?: number }).status = 429;
      throw err;
    }

    const [allowBase, allowArb, gasBase, gasArb] = await Promise.all([
      this.allowlist("base", address),
      this.allowlist("arbitrum", address),
      this.topUp("base", address),
      this.topUp("arbitrum", address),
    ]);

    const now = Date.now();
    await this.db
      .insert(faucetClaims)
      .values({ address: address.toLowerCase(), claimedAt: now })
      .onConflictDoUpdate({ target: faucetClaims.address, set: { claimedAt: now } });
    this.log.info({ address }, "faucet prepared wallet");
    return {
      address,
      allowlisted: { base: allowBase, arbitrum: allowArb },
      gas: { base: gasBase, arbitrum: gasArb },
      nextClaimAt: now + COOLDOWN_MS,
    };
  }

  private async allowlist(chain: "base" | "arbitrum", address: Address): Promise<Hex | "already"> {
    const { client, wallet } = this.pick(chain);
    const allowlist = chain === "base" ? DEPLOYMENTS.baseSepolia.tokens.allowlist : DEPLOYMENTS.arbitrumSepolia.tokens.allowlist;
    const already = await client.readContract({ address: allowlist, abi: allowlistAbi, functionName: "isAllowed", args: [address] });
    if (already) return "already";
    const hash = await wallet.writeContract({ address: allowlist, abi: allowlistAbi, functionName: "setAllowed", args: [[address], true] });
    await client.waitForTransactionReceipt({ hash });
    return hash;
  }

  private async topUp(chain: "base" | "arbitrum", address: Address): Promise<Hex | "enough"> {
    const { client, wallet } = this.pick(chain);
    const target = parseEther(this.config.FAUCET_GAS_ETH);
    const balance = await client.getBalance({ address });
    if (balance >= target / 2n) return "enough";
    const hash = await wallet.sendTransaction({ to: address, value: target - balance });
    await client.waitForTransactionReceipt({ hash });
    return hash;
  }
}
