// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IOFT } from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";

/// @title IMuaraOFT
/// @notice LayerZero OFT surface the pool relies on for cross-chain delivery.
interface IMuaraOFT is IOFT {
    /// @notice 10 ** (local decimals - shared decimals). Amounts must be multiples of this to bridge without dust.
    function decimalConversionRate() external view returns (uint256);
}
