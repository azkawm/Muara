// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IShortModule
/// @notice One-call short selling on top of the pool.
interface IShortModule {
    struct Position {
        /// @dev Stock borrowed through the module, token units.
        uint256 size;
        /// @dev USDC received from the sale of `size`.
        uint256 proceeds;
    }

    event ShortOpened(
        address indexed user, address indexed asset, uint256 usdcIn, uint256 stockAmount, uint256 proceeds
    );
    event ShortClosed(
        address indexed user, address indexed asset, uint256 stockRepaid, uint256 usdcSpent, int256 realizedPnl
    );

    function usdc() external view returns (address);

    /// @notice Supply `usdcIn` as collateral, borrow `stockAmount`, sell it and supply the proceeds.
    function openShort(address asset, uint256 usdcIn, uint256 stockAmount, uint256 minUsdcOut)
        external
        returns (uint256 proceeds);

    /// @notice Buy back `stockAmount` (`type(uint256).max` for the full debt) using supplied USDC and repay.
    function closeShort(address asset, uint256 stockAmount, uint256 maxUsdcIn)
        external
        returns (uint256 stockRepaid, uint256 usdcSpent);

    function getPosition(address user, address asset) external view returns (Position memory);
}
