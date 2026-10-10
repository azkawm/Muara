// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { DataTypes } from "../lib/DataTypes.sol";
import { IRiskEngine } from "./IRiskEngine.sol";
import { IInterestRateModel } from "./IInterestRateModel.sol";

/// @title IMuaraPool
/// @notice Single loan book for Muara. Every supplied asset is collateral and, unless the
///         owner opts out (sharia flag), lendable liquidity.
interface IMuaraPool {
    event ReserveInitialized(address indexed asset, bool isStock, uint8 decimals);
    event ReserveConfigured(address indexed asset, bool active, bool borrowEnabled, uint16 reserveFactorBps);
    event ReserveUpdated(address indexed asset, uint256 liquidityIndex, uint256 borrowIndex, uint256 borrowRate);
    event ModuleSet(address indexed module, bool enabled);
    event TreasuryWithdrawn(address indexed asset, address indexed to, uint256 amount);

    event Supply(
        address indexed asset, address indexed from, address indexed onBehalfOf, uint256 amount, bool lendable
    );
    event Withdraw(address indexed asset, address indexed user, address to, uint256 amount, uint32 dstEid);
    event Borrow(address indexed asset, address indexed user, address to, uint256 amount, uint32 dstEid);
    event Repay(address indexed asset, address indexed user, address indexed repayer, uint256 amount);
    event LendableSet(address indexed asset, address indexed user, bool lendable, uint256 amount);
    event Liquidation(
        address indexed collateralAsset,
        address indexed debtAsset,
        address indexed user,
        address liquidator,
        uint256 debtRepaid,
        uint256 collateralSeized,
        uint256 protocolFee
    );
    /// @notice Emitted when funds leave the hub through LayerZero. `guid` tracks delivery on LayerZero Scan.
    event RewardsClaimed(address indexed asset, address indexed user, address to, uint256 amount, uint32 dstEid);
    event CrossChainDelivery(address indexed asset, address indexed to, uint256 amount, uint32 dstEid, bytes32 guid);

    // ---------------------------------------------------------------- user actions

    /// @notice Supply `amount` of `asset` from the caller, credited to `onBehalfOf`.
    function supply(address asset, uint256 amount, address onBehalfOf) external;

    /// @notice Withdraw collateral to `to` on `dstEid` (0 or the hub eid means local).
    /// @dev Pass the LayerZero fee from `quoteDelivery` as msg.value for remote delivery.
    function withdraw(address asset, uint256 amount, address to, uint32 dstEid) external payable returns (uint256);

    /// @notice Borrow `asset` to `to` on `dstEid` (0 or the hub eid means local).
    function borrow(address asset, uint256 amount, address to, uint32 dstEid) external payable;

    /// @notice Repay debt of `onBehalfOf`. `type(uint256).max` repays everything.
    function repay(address asset, uint256 amount, address onBehalfOf) external returns (uint256);

    /// @notice Choose whether the caller's supplied stock can be lent to short sellers.
    function setLendable(address asset, bool lendable) external;

    /// @notice Claim interest earned on lendable supply, paid in the supplied asset. Principal
    ///         stays supplied. Leaving rewards unclaimed compounds them in place.
    function claimRewards(address asset, address to, uint32 dstEid) external payable returns (uint256);

    /// @notice Repay part of an unhealthy position's debt and seize collateral plus bonus.
    function liquidate(address collateralAsset, address debtAsset, address user, uint256 debtToCover)
        external
        returns (uint256 debtRepaid, uint256 collateralSeized);

    // ---------------------------------------------------------------- module actions

    /// @notice Borrow for `user` without a health check; the module must call `requireBorrowHealth`.
    function borrowFor(address user, address asset, uint256 amount, address to) external;

    /// @notice Withdraw for `user` without a health check; the module must call `requireBorrowHealth`.
    function withdrawFor(address user, address asset, uint256 amount, address to) external returns (uint256);

    /// @notice Claim `user`'s rewards to `to` on the hub, with the usual health check.
    function claimRewardsFor(address user, address asset, address to) external returns (uint256);

    /// @notice Revert unless `user`'s debt is within the LTV-based borrow capacity.
    function requireBorrowHealth(address user) external view;

    // ---------------------------------------------------------------- views

    function riskEngine() external view returns (IRiskEngine);

    function rateModel() external view returns (IInterestRateModel);

    function localEid() external view returns (uint32);

    function isModule(address module) external view returns (bool);

    function getReservesList() external view returns (address[] memory);

    function getReserveData(address asset) external view returns (DataTypes.ReserveData memory);

    /// @return liquidityIndex Current lendable supply index, RAY.
    /// @return borrowIndex Current borrow index, RAY.
    function getNormalizedIndexes(address asset) external view returns (uint256 liquidityIndex, uint256 borrowIndex);

    /// @return supplied Total lendable plus locked supply, in token units.
    /// @return lendable Lendable supply, in token units.
    /// @return borrowed Total debt, in token units.
    function getReserveTotals(address asset)
        external
        view
        returns (uint256 supplied, uint256 lendable, uint256 borrowed);

    /// @notice Cash that can leave the lendable bucket right now.
    function availableLiquidity(address asset) external view returns (uint256);

    /// @return collateral Supplied balance including accrued interest.
    /// @return debt Debt including accrued interest.
    /// @return lendable Whether the balance is lent to borrowers.
    function getUserReserve(address user, address asset)
        external
        view
        returns (uint256 collateral, uint256 debt, bool lendable);

    function getAccountData(address user) external view returns (DataTypes.AccountData memory);

    /// @notice Interest earned on lendable supply that can be claimed now.
    function claimableRewards(address user, address asset) external view returns (uint256);

    /// @notice Native fee to deliver `amount` of `asset` to `to` on `dstEid`. Zero for local delivery.
    function quoteDelivery(address asset, uint256 amount, uint32 dstEid, address to) external view returns (uint256);

    // ---------------------------------------------------------------- admin

    function initReserve(address asset, bool isStock, bool borrowEnabled, uint16 reserveFactorBps) external;

    function configureReserve(address asset, bool active, bool borrowEnabled, uint16 reserveFactorBps) external;

    function setModule(address module, bool enabled) external;

    function withdrawTreasury(address asset, address to, uint256 amount) external;
}
