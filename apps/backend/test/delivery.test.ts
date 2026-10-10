import { deliveryStatusFromScan } from "@muara/shared";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/client.js";
import { deliveries } from "../src/db/schema.js";
import { LzTracker } from "../src/indexer/lzTracker.js";
import { createLogger } from "../src/lib/log.js";

describe("deliveryStatusFromScan", () => {
  it("maps LayerZero Scan states to Muara stages", () => {
    expect(deliveryStatusFromScan(undefined)).toBe("sent");
    expect(deliveryStatusFromScan({ status: { name: "INFLIGHT" } })).toBe("sent");
    expect(deliveryStatusFromScan({ status: { name: "INFLIGHT" }, verification: { dvn: { status: "SUCCEEDED" } } })).toBe(
      "verified",
    );
    expect(deliveryStatusFromScan({ status: { name: "DELIVERED" } })).toBe("delivered");
    expect(deliveryStatusFromScan({ status: { name: "BLOCKED" } })).toBe("failed");
  });
});

describe("LzTracker", () => {
  it("updates pending deliveries from Scan", async () => {
    const { db, close } = await openDb(":memory:");
    await db.insert(deliveries).values({
      guid: "0xabc",
      txHash: "0xtx",
      asset: "0xusdc",
      recipient: "0xrina",
      amount: "8000000000",
      dstEid: 40231,
      status: "sent",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          data: [{ guid: "0xABC", status: { name: "DELIVERED" }, destination: { tx: { txHash: "0xdst" } } }],
        }),
      )) as typeof fetch;
    await new LzTracker(db, "https://scan", createLogger("error", false), fakeFetch).tick();

    const row = await db.select().from(deliveries).get();
    expect(row?.status).toBe("delivered");
    expect(row?.dstTxHash).toBe("0xdst");
    close();
  });
});
