// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { DataTypes } from "../lib/DataTypes.sol";

/// @title IMuaraLens
/// @notice Read-only aggregation for the dashboard and the keeper.
interface IMuaraLens {
    enum Action {
        Supply,
        Withdraw,
        Borrow,
        Repay
    }

    struct ReserveView {
        address asset;
        string symbol;
        uint8 decimals;
        bool isStock;
        bool active;
        bool borrowEnabled;
        uint256 totalSupplied;
        uint256 totalLendable;
        uint256 totalBorrowed;
        uint256 availableLiquidity;
        /// @dev RAY.
        uint256 utilization;
        /// @dev Annual, RAY.
        uint256 borrowRate;
        /// @dev Annual rate earned by lendable suppliers, RAY.
        uint256 supplyRate;
        uint256 price;
        bool priceFresh;
        uint16 ltvBps;
        uint16 liquidationThresholdBps;
        uint16 liquidationBonusBps;
        uint16 maxUtilizationBps;
    }

    struct UserReserveView {
        address asset;
        uint256 collateral;
        uint256 debt;
        bool lendable;
        /// @dev Earned interest claimable now, in asset units.
        uint256 claimableRewards;
        uint256 collateralValue;
        uint256 debtValue;
    }

    struct UserView {
        DataTypes.AccountData account;
        UserReserveView[] reserves;
    }

    struct ShortView {
        uint256 size;
        uint256 proceeds;
        uint256 debt;
        uint256 buybackCost;
        int256 pnl;
    }

    function getReserves() external view returns (ReserveView[] memory);

    function getUser(address user) external view returns (UserView memory);

    /// @notice Account values after a hypothetical action, for the modal health factor preview.
    function previewAction(address user, Action action, address asset, uint256 amount)
        external
        view
        returns (DataTypes.AccountData memory);

    function getShort(address user, address asset) external view returns (ShortView memory);

    function session() external view returns (DataTypes.Session);
}
