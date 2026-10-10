import { defineConfig } from "@wagmi/cli";
import { foundry } from "@wagmi/cli/plugins";

/** Typed ABIs generated from the Foundry build. Run `pnpm --filter @muara/shared abis` after contract changes. */
export default defineConfig({
  out: "src/abis.ts",
  plugins: [
    foundry({
      project: "../../contracts",
      forge: { build: true },
      exclude: ["libs/**", "**.s.sol/**", "**.t.sol/**"],
      include: [
        "MuaraPool.sol/**",
        "MuaraLens.sol/**",
        "ShortModule.sol/**",
        "RewardsModule.sol/**",
        "RiskEngine.sol/**",
        "InterestRateModel.sol/**",
        "MockPriceOracle.sol/**",
        "MockExchange.sol/**",
        "MockUSDC.sol/**",
        "StockToken.sol/**",
        "Allowlist.sol/**",
        "Errors.sol/**",
      ],
    }),
  ],
});
