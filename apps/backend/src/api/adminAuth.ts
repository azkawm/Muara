import { ADMIN_HEADERS, ADMIN_SIGNATURE_TTL_MS, adminMessage } from "@muara/shared";
import type { MiddlewareHandler } from "hono";
import { isAddress, isHex, verifyMessage, type Address } from "viem";

export interface AdminAuthOptions {
  admin: Address;
  now?: () => number;
}

/**
 * Accepts a request only when it carries a fresh EIP-191 signature by the admin wallet over
 * method, path, timestamp and raw body. Each signature works once.
 */
export function adminAuth({ admin, now = Date.now }: AdminAuthOptions): MiddlewareHandler {
  const used = new Map<string, number>();

  return async (c, next) => {
    const address = c.req.header(ADMIN_HEADERS.address);
    const signature = c.req.header(ADMIN_HEADERS.signature);
    const timestamp = Number(c.req.header(ADMIN_HEADERS.timestamp));

    if (!address || !isAddress(address) || !signature || !isHex(signature) || !Number.isFinite(timestamp)) {
      return c.json({ error: "missing or malformed admin signature headers" }, 401);
    }
    const t = now();
    if (Math.abs(t - timestamp) > ADMIN_SIGNATURE_TTL_MS) return c.json({ error: "admin signature expired" }, 401);
    if (address.toLowerCase() !== admin.toLowerCase()) return c.json({ error: "not the admin wallet" }, 403);
    if (used.has(signature)) return c.json({ error: "admin signature already used" }, 401);

    const body = await c.req.text();
    const message = adminMessage({ method: c.req.method, path: c.req.path, timestamp, body });
    const valid = await verifyMessage({ address, message, signature }).catch(() => false);
    if (!valid) return c.json({ error: "invalid admin signature" }, 401);

    used.set(signature, timestamp);
    for (const [sig, ts] of used) if (t - ts > ADMIN_SIGNATURE_TTL_MS) used.delete(sig);
    await next();
  };
}
