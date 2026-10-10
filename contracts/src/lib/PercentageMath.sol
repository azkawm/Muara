// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title PercentageMath
/// @notice Basis point helpers (1e4 = 100%).
library PercentageMath {
    uint256 internal constant BPS = 1e4;

    function bpsMul(uint256 value, uint256 bps) internal pure returns (uint256) {
        return Math.mulDiv(value, bps, BPS);
    }

    function bpsDiv(uint256 value, uint256 bps) internal pure returns (uint256) {
        return Math.mulDiv(value, BPS, bps);
    }
}
