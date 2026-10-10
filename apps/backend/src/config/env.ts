import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { getAddress, type Address, type Hex } from "viem";
import { z } from "zod";

/**
 * Load env files for local runs. The repo root `.env` wins, then `contracts/.env` fills any
 * gaps so the deploy secrets do not have to be copied. Existing process env always wins,
 * which is how Docker passes config.
 */
export function loadEnvFiles(): void {
  const root = findRepoRoot(process.cwd());
  if (!root) return;
  for (const file of [join(root, ".env"), join(root, "contracts", ".env")]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

function findRepoRoot(from: string): string | undefined {
  let dir = resolve(from);
  while (true) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

const privateKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "expected a 0x-prefixed 32-byte hex private key")
  .transform((v) => v as Hex);

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "expected a 0x-prefixed address")
  .transform((v) => getAddress(v) as Address);

const modules = z
  .string()
  .default("prices,keeper,indexer,faucet")
  .transform((v) => new Set(v.split(",").map((m) => m.trim()).filter(Boolean)));

const schema = z.object({
  BASE_SEPOLIA_RPC_URL: z.url(),
  ARBITRUM_SEPOLIA_RPC_URL: z.url(),
  KEEPER_PRIVATE_KEY: privateKey,
  PRICE_UPDATER_PRIVATE_KEY: privateKey,
  /** Deployer key: owns the allowlists and funds faucet gas. Required for the faucet module. */
  PRIVATE_KEY: privateKey.optional(),
  /** ETH each faucet user is topped up to on each chain. */
  FAUCET_GAS_ETH: z.string().default("0.003"),
  /** Admin wallet for the scenario panel; defaults to the deployer (`ADDRESS`). */
  ADMIN_ADDRESS: address.optional(),
  ADDRESS: address.optional(),

  PORT: z.coerce.number().int().default(8787),
  DB_PATH: z.string().default("./data/muara.sqlite"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((v) => v.split(",").map((o) => o.trim())),
  MODULES: modules,
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  LOG_PRETTY: z.stringbool().default(false),

  /** Normal NVDA price in USD; scenarios move relative to it. */
  ANCHOR_PRICE: z.string().default("150"),
  SCENARIO_DURATION_MS: z.coerce.number().int().positive().default(15_000),
  SCENARIO_STEPS: z.coerce.number().int().positive().default(8),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  /** Re-push the current price once it is older than this, well inside the 6h staleness limit. */
  PRICE_REFRESH_AGE_S: z.coerce.number().int().positive().default(20 * 60),

  KEEPER_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  INDEXER_INTERVAL_MS: z.coerce.number().int().positive().default(4_000),
  /** eth_getLogs block range per call. The public Base Sepolia RPC allows 200. */
  LOG_CHUNK_BLOCKS: z.coerce.number().int().positive().default(200),
  LZ_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  LZ_SCAN_API: z.url().default("https://scan-testnet.layerzero-api.com/v1"),
  HERMES_URL: z.url().default("https://hermes.pyth.network"),
  /** Optional; only needed for `anchor pyth`. The public Hermes endpoint answers 401 without one. */
  HERMES_API_KEY: z.string().optional(),
});

export type Config = Omit<z.infer<typeof schema>, "ADMIN_ADDRESS" | "ADDRESS" | "PRIVATE_KEY"> & {
  ADMIN_ADDRESS: Address;
  PRIVATE_KEY: Hex;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid backend config:\n${issues}`);
  }
  const { ADMIN_ADDRESS, ADDRESS, PRIVATE_KEY, ...rest } = parsed.data;
  const admin = ADMIN_ADDRESS ?? ADDRESS;
  if (!admin) throw new Error("Invalid backend config:\n  ADMIN_ADDRESS (or ADDRESS) is required");
  if (rest.MODULES.has("faucet") && !PRIVATE_KEY) {
    throw new Error("Invalid backend config:\n  PRIVATE_KEY (deployer) is required for the faucet module");
  }
  return { ...rest, ADMIN_ADDRESS: admin, PRIVATE_KEY: PRIVATE_KEY ?? ("0x" as Hex) };
}
