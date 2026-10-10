// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IInterestRateModel
/// @notice Kinked utilization curve per asset. All values are RAY per year.
interface IInterestRateModel {
    struct RateParams {
        uint256 baseRate;
        uint256 slope1;
        uint256 slope2;
        uint256 optimalUtilization;
    }

    event RateParamsSet(address indexed asset, RateParams params);

    /// @param utilization Borrowed over lendable supply, RAY.
    /// @return Annual borrow rate, RAY.
    function getBorrowRate(address asset, uint256 utilization) external view returns (uint256);

    function getRateParams(address asset) external view returns (RateParams memory);

    function setRateParams(address asset, RateParams calldata params) external;
}
