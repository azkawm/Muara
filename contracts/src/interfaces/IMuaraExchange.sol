// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IMuaraExchange
/// @notice Swaps stock tokens against USDC at the oracle price minus a fee.
interface IMuaraExchange {
    event Swap(
        address indexed asset,
        address indexed trader,
        address indexed to,
        bool sell,
        uint256 stockAmount,
        uint256 usdcAmount
    );

    function usdc() external view returns (address);

    function feeBps() external view returns (uint16);

    /// @return usdcOut USDC received for selling `stockIn`.
    function quoteSell(address asset, uint256 stockIn) external view returns (uint256 usdcOut);

    /// @return usdcIn USDC required to buy exactly `stockOut`.
    function quoteBuy(address asset, uint256 stockOut) external view returns (uint256 usdcIn);

    function sell(address asset, uint256 stockIn, uint256 minUsdcOut, address to) external returns (uint256 usdcOut);

    function buy(address asset, uint256 stockOut, uint256 maxUsdcIn, address to) external returns (uint256 usdcIn);
}
