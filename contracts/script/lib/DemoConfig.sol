// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IRiskEngine } from "../../src/interfaces/IRiskEngine.sol";
import { IInterestRateModel } from "../../src/interfaces/IInterestRateModel.sol";

/// @title DemoConfig
/// @notice Testnet parameters and seed amounts for the hackathon demo.
/// @dev Weekends are treated like an ordinary closed session (same cuts) since the demo
///      runs on weekdays. NVDA borrow rates are tuned high so lending rewards are visible
///      within a day or two of seeding.
library DemoConfig {
    uint256 internal constant BASE_SEPOLIA = 84_532;
    uint256 internal constant ARBITRUM_SEPOLIA = 421_614;
    uint32 internal constant BASE_EID = 40_245;
    uint32 internal constant ARBITRUM_EID = 40_231;
    address internal constant LZ_ENDPOINT = 0x6EDCE65403992e310A62460808c4b910D972f10f;

    uint128 internal constant USDC_RECEIVE_GAS = 80_000;
    uint128 internal constant STOCK_RECEIVE_GAS = 150_000;

    int32 internal constant NEW_YORK_EDT = -4 hours;
    uint16 internal constant EXCHANGE_FEE_BPS = 30;
    uint16 internal constant RESERVE_FACTOR_BPS = 1_000;

    uint256 internal constant USDC_PRICE = 1e18;
    uint256 internal constant NVDA_PRICE = 150e18;

    // Seed amounts.
    uint256 internal constant EXCHANGE_USDC = 1_000_000e6;
    uint256 internal constant EXCHANGE_NVDA = 10_000e18;
    uint256 internal constant LP_USDC = 50_000e6;
    uint256 internal constant RINA_EARLY_NVDA = 100e18;
    uint256 internal constant RINA_WALLET_NVDA = 100e18;
    /// @dev Two rounds of 3,800: Scenario A, then reopening the short for Scenario B.
    uint256 internal constant BUDI_WALLET_USDC = 7_600e6;
    uint256 internal constant KEEPER_USDC = 100_000e6;
    uint256 internal constant KEEPER_NVDA = 100e18;
    uint256 internal constant BACKGROUND_SHORT_USDC = 20_000e6;
    uint256 internal constant BACKGROUND_SHORT_NVDA = 75e18;

    function usdcRisk() internal pure returns (IRiskEngine.RiskConfig memory c) {
        c.ltvBps = 6_667;
        c.liquidationThresholdBps = 8_333;
        c.liquidationBonusBps = 500;
        c.closeFactorBps = 5_000;
        c.maxUtilizationBps = 9_500;
    }

    function stockRisk() internal pure returns (IRiskEngine.RiskConfig memory c) {
        c.marketHours = true;
        c.ltvBps = 6_667;
        c.liquidationThresholdBps = 8_333;
        c.liquidationBonusBps = 500;
        c.closeFactorBps = 5_000;
        c.maxUtilizationBps = 8_000;
        c.maxPriceAge = 6 hours;
        c.preCloseLtvCutBps = 500;
        c.closedLtvCutBps = 500;
        c.weekendLtvCutBps = 500;
    }

    function usdcRates() internal pure returns (IInterestRateModel.RateParams memory) {
        return
            IInterestRateModel.RateParams({ baseRate: 0, slope1: 0.06e27, slope2: 0.8e27, optimalUtilization: 0.85e27 });
    }

    function stockRates() internal pure returns (IInterestRateModel.RateParams memory) {
        return
            IInterestRateModel.RateParams({
                baseRate: 0.05e27, slope1: 0.25e27, slope2: 1e27, optimalUtilization: 0.7e27
            });
    }
}
