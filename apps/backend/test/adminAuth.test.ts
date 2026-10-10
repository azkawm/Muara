import { ADMIN_HEADERS, adminMessage } from "@muara/shared";
import { Hono } from "hono";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { adminAuth } from "../src/api/adminAuth.js";

const admin = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());
const NOW = 1_800_000_000_000;

function app() {
  const a = new Hono();
  a.use(adminAuth({ admin: admin.address, now: () => NOW }));
  a.post("/api/admin/scenario", (c) => c.json({ ok: true }));
  return a;
}

async function signed(account = admin, opts: { timestamp?: number; body?: string; signBody?: string } = {}) {
  const timestamp = opts.timestamp ?? NOW;
  const body = opts.body ?? '{"scenario":"miss"}';
  const signature = await account.signMessage({
    message: adminMessage({ method: "POST", path: "/api/admin/scenario", timestamp, body: opts.signBody ?? body }),
  });
  return new Request("http://x/api/admin/scenario", {
    method: "POST",
    body,
    headers: {
      [ADMIN_HEADERS.address]: account.address,
      [ADMIN_HEADERS.timestamp]: String(timestamp),
      [ADMIN_HEADERS.signature]: signature,
    },
  });
}

describe("adminAuth", () => {
  it("accepts a fresh signature from the admin", async () => {
    expect((await app().request(await signed())).status).toBe(200);
  });

  it("rejects other wallets", async () => {
    expect((await app().request(await signed(stranger))).status).toBe(403);
  });

  it("rejects missing headers", async () => {
    expect((await app().request("http://x/api/admin/scenario", { method: "POST" })).status).toBe(401);
  });

  it("rejects expired signatures", async () => {
    expect((await app().request(await signed(admin, { timestamp: NOW - 10 * 60 * 1000 }))).status).toBe(401);
  });

  it("rejects a body that differs from what was signed", async () => {
    const req = await signed(admin, { body: '{"scenario":"beat"}', signBody: '{"scenario":"miss"}' });
    expect((await app().request(req)).status).toBe(401);
  });

  it("rejects replays", async () => {
    const a = app();
    const req = await signed();
    expect((await a.request(req.clone())).status).toBe(200);
    expect((await a.request(req)).status).toBe(401);
  });
});
