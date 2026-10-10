import { describe, expect, it } from "vitest";
import { rangeLimit } from "../src/indexer/indexer.js";

describe("rangeLimit", () => {
  it("reads the public Base Sepolia RPC limit", () => {
    expect(rangeLimit(new Error("eth_getLogs is limited to a 200 range"))).toBe(200);
  });

  it("reads the Alchemy free tier limit from error details", () => {
    const err = Object.assign(new Error("JSON is not a valid request object."), {
      details: "Under the Free tier plan, you can make eth_getLogs requests with up to a 10 block range.",
    });
    expect(rangeLimit(err)).toBe(10);
  });

  it("ignores unrelated errors", () => {
    expect(rangeLimit(new Error("connection reset"))).toBeUndefined();
  });
});
