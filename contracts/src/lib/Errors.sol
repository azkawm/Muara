// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Errors
/// @notice Custom errors shared across Muara contracts.
library Errors {
    error ZeroAddress();
    error ZeroAmount();
    error ReserveNotActive(address asset);
    error ReserveAlreadyInitialized(address asset);
    error TooManyReserves();
    error BorrowNotEnabled(address asset);
    error NotStockAsset(address asset);
    error OnlyModule();

    error InsufficientBalance();
    error InsufficientLiquidity(address asset);
    error UtilizationCapExceeded(address asset);
    error HealthFactorTooLow(uint256 healthFactor);
    error BorrowCapacityExceeded(uint256 debtValue, uint256 borrowCapacity);
    error StalePrice();
    error NoDebt();
    error NoRewards();

    error HealthyPosition(uint256 healthFactor);
    error LiquidationPaused();
    error NothingToSeize();

    error UnexpectedNativeFee();
    error NotAllowlisted(address account);

    error PriceNotSet(address asset);
    error NotPriceUpdater();
    error InvalidParams();
    error SlippageExceeded(uint256 actual, uint256 limit);
    error NoShortPosition();
    error AssetNotConfigured(address asset);
}
