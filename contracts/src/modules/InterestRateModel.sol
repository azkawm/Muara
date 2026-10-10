// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IInterestRateModel } from "../interfaces/IInterestRateModel.sol";
import { Errors } from "../lib/Errors.sol";
import { WadRayMath } from "../lib/WadRayMath.sol";

/// @title InterestRateModel
/// @notice Kinked utilization curve. Below the kink the rate climbs gently along `slope1`;
///         above it, steeply along `slope2` to pull utilization back down. On stock reserves
///         the result is the borrow fee paid by short sellers.
contract InterestRateModel is IInterestRateModel, Ownable {
    using WadRayMath for uint256;

    mapping(address asset => RateParams) internal _params;

    constructor(address owner_) Ownable(owner_) { }

    /// @inheritdoc IInterestRateModel
    function getBorrowRate(address asset, uint256 utilization) external view returns (uint256) {
        RateParams memory p = _params[asset];
        if (p.optimalUtilization == 0) return p.baseRate;
        if (utilization > WadRayMath.RAY) utilization = WadRayMath.RAY;

        if (utilization <= p.optimalUtilization) {
            return p.baseRate + p.slope1.rayMul(utilization.rayDiv(p.optimalUtilization));
        }
        uint256 excess = (utilization - p.optimalUtilization).rayDiv(WadRayMath.RAY - p.optimalUtilization);
        return p.baseRate + p.slope1 + p.slope2.rayMul(excess);
    }

    function getRateParams(address asset) external view returns (RateParams memory) {
        return _params[asset];
    }

    function setRateParams(address asset, RateParams calldata params) external onlyOwner {
        if (params.optimalUtilization == 0 || params.optimalUtilization >= WadRayMath.RAY) {
            revert Errors.InvalidParams();
        }
        _params[asset] = params;
        emit RateParamsSet(asset, params);
    }
}
