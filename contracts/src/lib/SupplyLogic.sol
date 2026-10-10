// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { DataTypes } from "./DataTypes.sol";
import { Errors } from "./Errors.sol";
import { WadRayMath } from "./WadRayMath.sol";
import { ReserveLogic } from "./ReserveLogic.sol";
import { HealthLogic } from "./HealthLogic.sol";
import { DeliveryLogic } from "./DeliveryLogic.sol";
import { IMuaraPool } from "../interfaces/IMuaraPool.sol";

/// @title SupplyLogic
/// @notice Supply, withdraw and the sharia lendable toggle.
library SupplyLogic {
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;
    using ReserveLogic for DataTypes.ReserveData;
    using ReserveLogic for DataTypes.UserReserve;

    function executeSupply(DataTypes.PoolState storage s, DataTypes.SupplyParams memory p) external {
        if (p.amount == 0) revert Errors.ZeroAmount();
        if (p.onBehalfOf == address(0)) revert Errors.ZeroAddress();
        DataTypes.ReserveData storage r = s.reserves[p.asset];
        if (!r.active) revert Errors.ReserveNotActive(p.asset);
        r.accrue();

        DataTypes.UserReserve storage u = s.users[p.onBehalfOf][p.asset];
        bool lendable = !(r.isStock && u.nonLendable);
        if (lendable) {
            uint256 scaled = p.amount.rayDiv(r.liquidityIndex);
            if (scaled == 0) revert Errors.ZeroAmount();
            u.scaledLendable += scaled;
            u.principal += p.amount;
            r.totalScaledLendable += scaled;
        } else {
            u.locked += p.amount;
            r.totalLocked += p.amount;
        }

        IERC20(p.asset).safeTransferFrom(p.from, address(this), p.amount);
        r.updateRate(p.asset, s.rateModel);
        emit IMuaraPool.Supply(p.asset, p.from, p.onBehalfOf, p.amount, lendable);
    }

    /// @return amount Amount removed from the user's balance, ready for delivery.
    function executeWithdraw(DataTypes.PoolState storage s, DataTypes.WithdrawParams memory p)
        external
        returns (uint256 amount)
    {
        if (p.to == address(0)) revert Errors.ZeroAddress();
        DataTypes.ReserveData storage r = s.reserves[p.asset];
        if (!r.active) revert Errors.ReserveNotActive(p.asset);
        r.accrue();

        DataTypes.UserReserve storage u = s.users[p.user][p.asset];
        uint256 balance = u.userCollateral(r.liquidityIndex);
        amount = p.amount == type(uint256).max ? balance : p.amount;
        if (amount > balance) revert Errors.InsufficientBalance();
        if (DeliveryLogic.isRemote(s.localEid, p.dstEid)) amount = DeliveryLogic.removeDust(p.asset, amount);
        if (amount == 0) revert Errors.ZeroAmount();

        if (u.locked != 0) {
            u.locked -= amount;
            r.totalLocked -= amount;
        } else {
            if (amount > r.availableLiquidity(p.asset)) revert Errors.InsufficientLiquidity(p.asset);
            uint256 scaled = amount == balance ? u.scaledLendable : amount.rayDivUp(r.liquidityIndex);
            u.scaledLendable -= scaled;
            r.totalScaledLendable -= scaled;
            u.reducePrincipal(amount);
        }

        r.updateRate(p.asset, s.rateModel);
        if (p.checkHealth) HealthLogic.requireBorrowCapacity(s, p.user);
        emit IMuaraPool.Withdraw(p.asset, p.user, p.to, amount, p.dstEid);
    }

    /// @notice Move the caller's whole balance between the lendable and locked buckets.
    function executeSetLendable(DataTypes.PoolState storage s, address user, address asset, bool lendable) external {
        DataTypes.ReserveData storage r = s.reserves[asset];
        if (!r.isStock) revert Errors.NotStockAsset(asset);
        r.accrue();

        DataTypes.UserReserve storage u = s.users[user][asset];
        u.nonLendable = !lendable;
        uint256 moved;
        if (lendable && u.locked != 0) {
            moved = u.locked;
            uint256 scaled = moved.rayDiv(r.liquidityIndex);
            u.locked = 0;
            r.totalLocked -= moved;
            u.scaledLendable += scaled;
            u.principal = moved;
            r.totalScaledLendable += scaled;
        } else if (!lendable && u.scaledLendable != 0) {
            moved = u.scaledLendable.rayMul(r.liquidityIndex);
            // Locked stock must be backed by idle tokens, not by tokens currently lent out.
            if (moved > r.availableLiquidity(asset)) revert Errors.InsufficientLiquidity(asset);
            r.totalScaledLendable -= u.scaledLendable;
            u.scaledLendable = 0;
            u.principal = 0;
            u.locked += moved;
            r.totalLocked += moved;
        }

        r.updateRate(asset, s.rateModel);
        emit IMuaraPool.LendableSet(asset, user, lendable, moved);
    }

    /// @notice Take the interest earned on lendable supply out of the position, leaving principal in place.
    /// @return amount Rewards removed from the user's balance, ready for delivery.
    function executeClaimRewards(DataTypes.PoolState storage s, DataTypes.ClaimParams memory p)
        external
        returns (uint256 amount)
    {
        if (p.to == address(0)) revert Errors.ZeroAddress();
        DataTypes.ReserveData storage r = s.reserves[p.asset];
        if (!r.active) revert Errors.ReserveNotActive(p.asset);
        r.accrue();

        DataTypes.UserReserve storage u = s.users[p.user][p.asset];
        amount = u.earnedRewards(r.liquidityIndex);
        if (DeliveryLogic.isRemote(s.localEid, p.dstEid)) amount = DeliveryLogic.removeDust(p.asset, amount);
        if (amount == 0) revert Errors.NoRewards();
        if (amount > r.availableLiquidity(p.asset)) revert Errors.InsufficientLiquidity(p.asset);

        uint256 scaled = amount.rayDivUp(r.liquidityIndex);
        if (scaled > u.scaledLendable) scaled = u.scaledLendable;
        u.scaledLendable -= scaled;
        r.totalScaledLendable -= scaled;

        r.updateRate(p.asset, s.rateModel);
        if (p.checkHealth) HealthLogic.requireBorrowCapacity(s, p.user);
        emit IMuaraPool.RewardsClaimed(p.asset, p.user, p.to, amount, p.dstEid);
    }
}
