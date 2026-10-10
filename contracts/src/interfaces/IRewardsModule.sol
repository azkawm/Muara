// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IRewardsModule
/// @notice Claims lending rewards and pays them out in USDC.
interface IRewardsModule {
    event RewardsPaidInUsdc(
        address indexed user, address indexed asset, uint256 claimed, uint256 usdcPaid, address to, uint32 dstEid
    );

    function usdc() external view returns (address);

    /// @notice Claim the caller's rewards on `asset`, sell them for USDC if needed and deliver
    ///         to `to` on `dstEid` (0 or the hub eid means local).
    /// @dev Pass the LayerZero fee as msg.value for remote delivery.
    function claimInUsdc(address asset, uint256 minUsdcOut, address to, uint32 dstEid)
        external
        payable
        returns (uint256 usdcPaid);

    /// @return claimable Rewards in `asset` units.
    /// @return usdcOut USDC the claim would pay at the current price.
    function previewClaimInUsdc(address user, address asset) external view returns (uint256 claimable, uint256 usdcOut);
}
