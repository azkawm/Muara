/**
 * Signed admin requests from the terminal, using the deployer key (PRIVATE_KEY).
 *
 *   pnpm admin scenario miss|beat|weekendGap|reset
 *   pnpm admin target 190        gradual move to an exact price
 *   pnpm admin price 150         set the price in one update
 *   pnpm admin anchor 150|pyth   change the price scenarios move from
 *   pnpm admin status            current price, scenario and keeper state
 *
 * BACKEND_URL defaults to http://localhost:8787.
 */
import { ADMIN_HEADERS, adminMessage } from "@muara/shared";
import { privateKeyToAccount } from "viem/accounts";
import { loadEnvFiles } from "../src/config/env.js";

loadEnvFiles();
const base = process.env.BACKEND_URL ?? "http://localhost:8787";
const [command, arg] = process.argv.slice(2);

async function get(path: string) {
  const res = await fetch(base + path);
  return res.json();
}

async function post(path: string, payload: unknown) {
  const key = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) throw new Error("PRIVATE_KEY (admin/deployer key) is not set");
  const account = privateKeyToAccount(key);
  const body = JSON.stringify(payload);
  const timestamp = Date.now();
  const signature = await account.signMessage({ message: adminMessage({ method: "POST", path, timestamp, body }) });
  const res = await fetch(base + path, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      [ADMIN_HEADERS.address]: account.address,
      [ADMIN_HEADERS.timestamp]: String(timestamp),
      [ADMIN_HEADERS.signature]: signature,
    },
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  switch (command) {
    case "scenario":
      return post("/api/admin/scenario", { scenario: arg });
    case "target":
      return post("/api/admin/scenario", { target: arg });
    case "price":
      return post("/api/admin/price", { price: arg });
    case "anchor":
      return post("/api/admin/anchor", arg === "pyth" ? { source: "pyth" } : { price: arg });
    case "status":
      return { price: await get("/api/price"), keeper: await get("/api/keeper") };
    default:
      throw new Error("usage: admin scenario <id> | target <usd> | price <usd> | anchor <usd|pyth> | status");
  }
}

main()
  .then((out) => console.log(JSON.stringify(out, null, 2)))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
