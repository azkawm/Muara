// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title WadRayMath
/// @notice Fixed-point helpers with explicit rounding direction.
library WadRayMath {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant RAY = 1e27;

    function wadMul(uint256 a, uint256 b) internal pure returns (uint256) {
        return Math.mulDiv(a, b, WAD);
    }

    function wadDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return Math.mulDiv(a, WAD, b);
    }

    function rayMul(uint256 a, uint256 b) internal pure returns (uint256) {
        return Math.mulDiv(a, b, RAY);
    }

    function rayMulUp(uint256 a, uint256 b) internal pure returns (uint256) {
        return Math.mulDiv(a, b, RAY, Math.Rounding.Ceil);
    }

    function rayDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return Math.mulDiv(a, RAY, b);
    }

    function rayDivUp(uint256 a, uint256 b) internal pure returns (uint256) {
        return Math.mulDiv(a, RAY, b, Math.Rounding.Ceil);
    }

    /// @notice USD value (WAD) of `amount` token units at `price` (WAD per whole token).
    function toValue(uint256 amount, uint256 price, uint8 decimals) internal pure returns (uint256) {
        return Math.mulDiv(amount, price, 10 ** decimals);
    }

    /// @notice Token units worth `value` (WAD USD) at `price` (WAD per whole token), rounded down.
    function toAmount(uint256 value, uint256 price, uint8 decimals) internal pure returns (uint256) {
        return Math.mulDiv(value, 10 ** decimals, price);
    }
}
