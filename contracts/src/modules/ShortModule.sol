// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { IShortModule } from "../interfaces/IShortModule.sol";
import { IMuaraPool } from "../interfaces/IMuaraPool.sol";
import { IMuaraExchange } from "../interfaces/IMuaraExchange.sol";
import { Errors } from "../lib/Errors.sol";

/// @title ShortModule
/// @notice Opens and closes shorts in one transaction on behalf of the caller.
/// @dev A short is an ordinary pool position: USDC collateral plus a stock debt, with the
///      sale proceeds supplied back as collateral. The pool trusts this module (owner set) to
///      borrow and withdraw for the caller with a single health check at the end. Holds no
///      funds between calls.
contract ShortModule is IShortModule, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    IMuaraPool public immutable pool;
    IMuaraExchange public immutable exchange;
    address public immutable usdc;

    mapping(address user => mapping(address asset => Position)) internal _positions;

    constructor(IMuaraPool pool_, IMuaraExchange exchange_) {
        if (address(pool_) == address(0) || address(exchange_) == address(0)) revert Errors.ZeroAddress();
        pool = pool_;
        exchange = exchange_;
        usdc = exchange_.usdc();
    }

    /// @inheritdoc IShortModule
    function openShort(address asset, uint256 usdcIn, uint256 stockAmount, uint256 minUsdcOut)
        external
        nonReentrant
        returns (uint256 proceeds)
    {
        if (stockAmount == 0) revert Errors.ZeroAmount();

        if (usdcIn != 0) {
            IERC20(usdc).safeTransferFrom(msg.sender, address(this), usdcIn);
            _supply(usdc, usdcIn, msg.sender);
        }

        pool.borrowFor(msg.sender, asset, stockAmount, address(this));
        IERC20(asset).forceApprove(address(exchange), stockAmount);
        proceeds = exchange.sell(asset, stockAmount, minUsdcOut, address(this));
        _supply(usdc, proceeds, msg.sender);

        pool.requireBorrowHealth(msg.sender);

        Position storage position = _positions[msg.sender][asset];
        position.size += stockAmount;
        position.proceeds += proceeds;
        emit ShortOpened(msg.sender, asset, usdcIn, stockAmount, proceeds);
    }

    /// @inheritdoc IShortModule
    function closeShort(address asset, uint256 stockAmount, uint256 maxUsdcIn)
        external
        nonReentrant
        returns (uint256 stockRepaid, uint256 usdcSpent)
    {
        (, uint256 debt,) = pool.getUserReserve(msg.sender, asset);
        if (debt == 0) revert Errors.NoDebt();
        stockRepaid = stockAmount < debt ? stockAmount : debt;
        if (stockRepaid == 0) revert Errors.ZeroAmount();

        usdcSpent = exchange.quoteBuy(asset, stockRepaid);
        if (usdcSpent > maxUsdcIn) revert Errors.SlippageExceeded(usdcSpent, maxUsdcIn);

        pool.withdrawFor(msg.sender, usdc, usdcSpent, address(this));
        IERC20(usdc).forceApprove(address(exchange), usdcSpent);
        exchange.buy(asset, stockRepaid, usdcSpent, address(this));
        IERC20(asset).forceApprove(address(pool), stockRepaid);
        pool.repay(asset, stockRepaid, msg.sender);

        pool.requireBorrowHealth(msg.sender);

        Position storage position = _positions[msg.sender][asset];
        uint256 proceedsClosed = Math.mulDiv(position.proceeds, stockRepaid, debt);
        uint256 sizeClosed = Math.mulDiv(position.size, stockRepaid, debt);
        position.proceeds -= proceedsClosed;
        position.size -= sizeClosed;

        int256 realizedPnl = SafeCast.toInt256(proceedsClosed) - SafeCast.toInt256(usdcSpent);
        emit ShortClosed(msg.sender, asset, stockRepaid, usdcSpent, realizedPnl);
    }

    /// @inheritdoc IShortModule
    function getPosition(address user, address asset) external view returns (Position memory) {
        return _positions[user][asset];
    }

    function _supply(address asset, uint256 amount, address onBehalfOf) internal {
        IERC20(asset).forceApprove(address(pool), amount);
        pool.supply(asset, amount, onBehalfOf);
    }
}
