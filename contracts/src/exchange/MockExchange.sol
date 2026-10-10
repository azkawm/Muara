// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IMuaraExchange } from "../interfaces/IMuaraExchange.sol";
import { IMuaraOracle } from "../interfaces/IMuaraOracle.sol";
import { Errors } from "../lib/Errors.sol";
import { PercentageMath } from "../lib/PercentageMath.sol";

/// @title MockExchange
/// @notice Prefunded venue that swaps stock tokens and USDC at the oracle price minus a fee.
/// @dev USDC is valued at exactly $1. Must be on the stock allowlist to hold stock tokens.
contract MockExchange is IMuaraExchange, Ownable {
    using SafeERC20 for IERC20;

    IMuaraOracle public immutable oracle;
    address public immutable usdc;
    uint16 public immutable feeBps;
    uint8 internal immutable _usdcDecimals;

    constructor(IMuaraOracle oracle_, address usdc_, uint16 feeBps_, address owner_) Ownable(owner_) {
        if (address(oracle_) == address(0) || usdc_ == address(0)) revert Errors.ZeroAddress();
        if (feeBps_ >= PercentageMath.BPS) revert Errors.InvalidParams();
        oracle = oracle_;
        usdc = usdc_;
        feeBps = feeBps_;
        _usdcDecimals = IERC20Metadata(usdc_).decimals();
    }

    /// @inheritdoc IMuaraExchange
    function quoteSell(address asset, uint256 stockIn) public view returns (uint256) {
        uint256 gross = _usdcValue(asset, stockIn, Math.Rounding.Floor);
        return Math.mulDiv(gross, PercentageMath.BPS - feeBps, PercentageMath.BPS);
    }

    /// @inheritdoc IMuaraExchange
    function quoteBuy(address asset, uint256 stockOut) public view returns (uint256) {
        uint256 gross = _usdcValue(asset, stockOut, Math.Rounding.Ceil);
        return Math.mulDiv(gross, PercentageMath.BPS, PercentageMath.BPS - feeBps, Math.Rounding.Ceil);
    }

    /// @inheritdoc IMuaraExchange
    function sell(address asset, uint256 stockIn, uint256 minUsdcOut, address to) external returns (uint256 usdcOut) {
        usdcOut = quoteSell(asset, stockIn);
        if (usdcOut < minUsdcOut) revert Errors.SlippageExceeded(usdcOut, minUsdcOut);
        IERC20(asset).safeTransferFrom(msg.sender, address(this), stockIn);
        IERC20(usdc).safeTransfer(to, usdcOut);
        emit Swap(asset, msg.sender, to, true, stockIn, usdcOut);
    }

    /// @inheritdoc IMuaraExchange
    function buy(address asset, uint256 stockOut, uint256 maxUsdcIn, address to) external returns (uint256 usdcIn) {
        usdcIn = quoteBuy(asset, stockOut);
        if (usdcIn > maxUsdcIn) revert Errors.SlippageExceeded(usdcIn, maxUsdcIn);
        IERC20(usdc).safeTransferFrom(msg.sender, address(this), usdcIn);
        IERC20(asset).safeTransfer(to, stockOut);
        emit Swap(asset, msg.sender, to, false, stockOut, usdcIn);
    }

    /// @notice Pull liquidity back out, e.g. during a demo reset.
    function withdrawLiquidity(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    function _usdcValue(address asset, uint256 stockAmount, Math.Rounding rounding) internal view returns (uint256) {
        (uint256 price,) = oracle.getPrice(asset);
        uint8 stockDecimals = IERC20Metadata(asset).decimals();
        // price is WAD USD per whole token; USDC is $1 with `_usdcDecimals`.
        return Math.mulDiv(stockAmount * price, 10 ** _usdcDecimals, 10 ** (uint256(stockDecimals) + 18), rounding);
    }
}
