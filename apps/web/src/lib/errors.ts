import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

/** Plain-language messages for Muara's custom errors. */
const MESSAGES: Record<string, string> = {
  BorrowCapacityExceeded: "Not enough collateral for this amount at the initial margin.",
  HealthFactorTooLow: "This would put the position below the liquidation threshold.",
  InsufficientLiquidity: "The pool does not have enough idle liquidity for this right now.",
  InsufficientBalance: "Amount is larger than your balance in the pool.",
  UtilizationCapExceeded: "Stock lending is capped at 80% of supply; try a smaller amount.",
  StalePrice: "The price feed is stale, so borrowing is paused until it refreshes.",
  LiquidationPaused: "Liquidations are paused while prices are stale.",
  HealthyPosition: "This position is healthy and cannot be liquidated.",
  NotAllowlisted: "This wallet is not on the stock token allowlist.",
  SlippageExceeded: "Price moved past your slippage limit; try again.",
  NoRewards: "There are no rewards to claim yet.",
  NoDebt: "There is no debt to repay.",
  ZeroAmount: "Enter an amount.",
  BorrowNotEnabled: "Borrowing is disabled for this asset.",
  ReserveNotActive: "This market is paused.",
  NotStockAsset: "Only stock positions can change lending preference.",
  UnexpectedNativeFee: "Local delivery does not take a LayerZero fee.",
};

export function describeError(err: unknown): string {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return "Transaction rejected in wallet.";
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name && MESSAGES[name]) return MESSAGES[name];
      if (name) return name;
    }
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}
