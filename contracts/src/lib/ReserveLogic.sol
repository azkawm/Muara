// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { DataTypes } from "./DataTypes.sol";
import { WadRayMath } from "./WadRayMath.sol";
import { PercentageMath } from "./PercentageMath.sol";
import { IInterestRateModel } from "../interfaces/IInterestRateModel.sol";
import { IMuaraPool } from "../interfaces/IMuaraPool.sol";

/// @title ReserveLogic
/// @notice Index accrual, rate updates and reserve totals.
/// @dev Interest accrues linearly per update. Borrower interest is split into the supplier
///      share (raises the lendable liquidity index) and the treasury share (reserve factor).
library ReserveLogic {
    using WadRayMath for uint256;
    using PercentageMath for uint256;

    uint256 internal constant YEAR = 365 days;

    /// @notice Indexes as of the current block without writing state.
    /// @return liquidityIndex Lendable supply index, RAY.
    /// @return borrowIndex Borrow index, RAY.
    /// @return toTreasury Treasury share of interest accrued since the last update.
    function previewIndexes(DataTypes.ReserveData storage r)
        internal
        view
        returns (uint256 liquidityIndex, uint256 borrowIndex, uint256 toTreasury)
    {
        liquidityIndex = r.liquidityIndex;
        borrowIndex = r.borrowIndex;
        uint256 elapsed = block.timestamp - r.lastUpdate;
        if (elapsed == 0 || r.totalScaledDebt == 0 || r.currentBorrowRate == 0) {
            return (liquidityIndex, borrowIndex, 0);
        }

        uint256 newBorrowIndex = borrowIndex.rayMul(WadRayMath.RAY + r.currentBorrowRate * elapsed / YEAR);
        uint256 interest = r.totalScaledDebt.rayMul(newBorrowIndex) - r.totalScaledDebt.rayMul(borrowIndex);
        borrowIndex = newBorrowIndex;

        if (r.totalScaledLendable == 0) return (liquidityIndex, borrowIndex, interest);

        toTreasury = interest.bpsMul(r.reserveFactorBps);
        liquidityIndex += (interest - toTreasury).rayDiv(r.totalScaledLendable);
    }

    /// @notice Write accrued indexes and treasury share to storage.
    function accrue(DataTypes.ReserveData storage r) internal {
        if (r.lastUpdate == block.timestamp) return;
        (uint256 liquidityIndex, uint256 borrowIndex, uint256 toTreasury) = previewIndexes(r);
        r.liquidityIndex = liquidityIndex;
        r.borrowIndex = borrowIndex;
        r.accruedToTreasury += toTreasury;
        r.lastUpdate = uint40(block.timestamp);
    }

    /// @notice Recompute the borrow rate from current utilization. Call after every balance change.
    function updateRate(DataTypes.ReserveData storage r, address asset, IInterestRateModel rateModel) internal {
        uint256 rate = rateModel.getBorrowRate(asset, utilization(r));
        r.currentBorrowRate = rate;
        emit IMuaraPool.ReserveUpdated(asset, r.liquidityIndex, r.borrowIndex, rate);
    }

    /// @notice Borrowed over lendable supply, RAY, capped at 100%. Uses stored indexes.
    function utilization(DataTypes.ReserveData storage r) internal view returns (uint256) {
        uint256 lendable = totalLendable(r, r.liquidityIndex);
        if (lendable == 0) return 0;
        uint256 u = totalDebt(r, r.borrowIndex).rayDiv(lendable);
        return u > WadRayMath.RAY ? WadRayMath.RAY : u;
    }

    function totalLendable(DataTypes.ReserveData storage r, uint256 liquidityIndex) internal view returns (uint256) {
        return r.totalScaledLendable.rayMul(liquidityIndex);
    }

    function totalDebt(DataTypes.ReserveData storage r, uint256 borrowIndex) internal view returns (uint256) {
        return r.totalScaledDebt.rayMulUp(borrowIndex);
    }

    /// @notice Tokens held by the pool that are neither locked (sharia) nor owed to the treasury.
    function availableLiquidity(DataTypes.ReserveData storage r, address asset) internal view returns (uint256) {
        uint256 balance = IERC20(asset).balanceOf(address(this));
        uint256 reserved = r.totalLocked + r.accruedToTreasury;
        return balance > reserved ? balance - reserved : 0;
    }

    /// @notice A user's supplied balance across both buckets.
    function userCollateral(DataTypes.UserReserve storage u, uint256 liquidityIndex) internal view returns (uint256) {
        return u.scaledLendable.rayMul(liquidityIndex) + u.locked;
    }

    /// @notice Interest earned above principal in the lendable bucket. Locked stock earns nothing.
    function earnedRewards(DataTypes.UserReserve storage u, uint256 liquidityIndex) internal view returns (uint256) {
        uint256 balance = u.scaledLendable.rayMul(liquidityIndex);
        return balance > u.principal ? balance - u.principal : 0;
    }

    /// @notice Balance reductions come out of principal first so earned rewards stay claimable.
    function reducePrincipal(DataTypes.UserReserve storage u, uint256 amount) internal {
        u.principal = amount < u.principal ? u.principal - amount : 0;
    }

    function userDebt(DataTypes.UserReserve storage u, uint256 borrowIndex) internal view returns (uint256) {
        return u.scaledDebt.rayMulUp(borrowIndex);
    }
}
