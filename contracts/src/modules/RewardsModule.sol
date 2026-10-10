// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { IRewardsModule } from "../interfaces/IRewardsModule.sol";
import { IMuaraPool } from "../interfaces/IMuaraPool.sol";
import { IMuaraExchange } from "../interfaces/IMuaraExchange.sol";
import { Errors } from "../lib/Errors.sol";
import { DeliveryLogic } from "../lib/DeliveryLogic.sol";

/// @title RewardsModule
/// @notice Default payout path for lending rewards: claim, convert to USDC, deliver.
/// @dev Stock holders earn short sellers' borrow fees in the stock itself. This module sells
///      those rewards for USDC so yield arrives as cash. Holders who prefer to auto-compound
///      simply leave rewards unclaimed. Holds no funds between calls.
contract RewardsModule is IRewardsModule, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    IMuaraPool public immutable pool;
    IMuaraExchange public immutable exchange;
    address public immutable usdc;

    constructor(IMuaraPool pool_, IMuaraExchange exchange_) {
        if (address(pool_) == address(0) || address(exchange_) == address(0)) revert Errors.ZeroAddress();
        pool = pool_;
        exchange = exchange_;
        usdc = exchange_.usdc();
    }

    /// @inheritdoc IRewardsModule
    function claimInUsdc(address asset, uint256 minUsdcOut, address to, uint32 dstEid)
        external
        payable
        nonReentrant
        returns (uint256 usdcPaid)
    {
        if (to == address(0)) revert Errors.ZeroAddress();
        uint256 claimed = pool.claimRewardsFor(msg.sender, asset, address(this));

        if (asset == usdc) {
            usdcPaid = claimed;
            if (usdcPaid < minUsdcOut) revert Errors.SlippageExceeded(usdcPaid, minUsdcOut);
        } else {
            IERC20(asset).forceApprove(address(exchange), claimed);
            usdcPaid = exchange.sell(asset, claimed, minUsdcOut, address(this));
        }

        DeliveryLogic.deliver(usdc, to, usdcPaid, pool.localEid(), dstEid, msg.value, msg.sender);
        emit RewardsPaidInUsdc(msg.sender, asset, claimed, usdcPaid, to, dstEid);
    }

    /// @inheritdoc IRewardsModule
    function previewClaimInUsdc(address user, address asset)
        external
        view
        returns (uint256 claimable, uint256 usdcOut)
    {
        claimable = pool.claimableRewards(user, asset);
        if (claimable == 0) return (0, 0);
        usdcOut = asset == usdc ? claimable : exchange.quoteSell(asset, claimable);
    }
}
