// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IMuaraOracle
/// @notice Price source for Muara. Implemented by MockPriceOracle on testnet and by a
///         Pyth adapter on mainnet.
interface IMuaraOracle {
    /// @return price USD price per whole token, WAD (1e18 = $1).
    /// @return updatedAt Timestamp of the last update.
    function getPrice(address asset) external view returns (uint256 price, uint256 updatedAt);
}
