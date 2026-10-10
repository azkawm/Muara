// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IRiskEngine } from "../interfaces/IRiskEngine.sol";
import { IInterestRateModel } from "../interfaces/IInterestRateModel.sol";

/// @title DataTypes
/// @notice Structs shared across the pool, its logic libraries and modules.
/// @dev Units: prices and USD values are WAD (1e18 = $1). Indexes and rates are RAY (1e27).
///      Ratios are basis points (1e4 = 100%).
library DataTypes {
    /// @notice Per-asset reserve state held by the pool.
    struct ReserveData {
        bool active;
        bool isStock;
        bool borrowEnabled;
        uint8 decimals;
        uint16 reserveFactorBps;
        uint40 lastUpdate;
        uint256 liquidityIndex;
        uint256 borrowIndex;
        uint256 currentBorrowRate;
        uint256 totalScaledLendable;
        uint256 totalLocked;
        uint256 totalScaledDebt;
        uint256 accruedToTreasury;
    }

    /// @notice Per-user, per-asset position.
    /// @dev A user's supply sits entirely in one bucket: lendable (scaled, earns interest)
    ///      or locked (raw amount, sharia opt-out, never lent). `nonLendable` is the preference.
    ///      `principal` is what the user put into the lendable bucket; anything above it is
    ///      earned interest that can be claimed separately.
    struct UserReserve {
        uint256 scaledLendable;
        uint256 principal;
        uint256 locked;
        uint256 scaledDebt;
        bool nonLendable;
    }

    /// @notice All pool storage, passed by reference into external logic libraries.
    struct PoolState {
        mapping(address asset => ReserveData) reserves;
        mapping(address user => mapping(address asset => UserReserve)) users;
        mapping(address module => bool) modules;
        address[] reservesList;
        IRiskEngine riskEngine;
        IInterestRateModel rateModel;
        uint32 localEid;
    }

    /// @notice Effective risk data for an asset at the current block (market-hours adjusted).
    struct RiskData {
        uint256 price;
        uint16 ltvBps;
        uint16 liquidationThresholdBps;
        uint16 liquidationBonusBps;
        uint16 closeFactorBps;
        uint16 maxUtilizationBps;
        bool priceFresh;
    }

    /// @notice Aggregated account values in WAD USD.
    struct AccountData {
        uint256 collateralValue;
        uint256 debtValue;
        uint256 borrowCapacity;
        uint256 liquidationCapacity;
        uint256 healthFactor;
        bool pricesFresh;
    }

    /// @notice NYSE session state used by the risk engine.
    enum Session {
        Open,
        PreClose,
        Closed,
        Weekend
    }

    struct SupplyParams {
        address asset;
        uint256 amount;
        address from;
        address onBehalfOf;
    }

    struct WithdrawParams {
        address asset;
        uint256 amount;
        address user;
        address to;
        uint32 dstEid;
        bool checkHealth;
    }

    struct ClaimParams {
        address asset;
        address user;
        address to;
        uint32 dstEid;
        bool checkHealth;
    }

    struct BorrowParams {
        address asset;
        uint256 amount;
        address user;
        address to;
        uint32 dstEid;
        bool checkHealth;
    }

    struct RepayParams {
        address asset;
        uint256 amount;
        address from;
        address onBehalfOf;
    }

    struct LiquidationParams {
        address collateralAsset;
        address debtAsset;
        address user;
        uint256 debtToCover;
        address liquidator;
    }
}
