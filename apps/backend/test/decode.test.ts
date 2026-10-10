import { describe, expect, it } from "vitest";
import { summarize } from "../src/indexer/decode.js";

const RINA = "0x4cD50dDD16De78501ECb3405e3976590Dc3b1F51";
const NVDA = "0xcA9A9adD1CB3daF3C5965c4b0f9B9fD7C76cBf8A";

describe("summarize", () => {
  it("credits supply to the beneficiary, not the payer", () => {
    expect(summarize("Supply", { asset: NVDA, from: "0xdeployer", onBehalfOf: RINA, amount: 100n })).toEqual({
      account: RINA.toLowerCase(),
      asset: NVDA.toLowerCase(),
      amount: "100",
      dstEid: null,
    });
  });

  it("keeps the destination of cross-chain borrows", () => {
    expect(summarize("Borrow", { asset: NVDA, user: RINA, to: RINA, amount: 5n, dstEid: 40231 }).dstEid).toBe(40231);
  });

  it("attributes liquidations to the liquidated user with the seized collateral", () => {
    const s = summarize("Liquidation", {
      collateralAsset: NVDA,
      debtAsset: "0xusdc",
      user: RINA,
      liquidator: "0xkeeper",
      debtRepaid: 1n,
      collateralSeized: 7n,
      protocolFee: 0n,
    });
    expect(s.account).toBe(RINA.toLowerCase());
    expect(s.amount).toBe("7");
  });
});
