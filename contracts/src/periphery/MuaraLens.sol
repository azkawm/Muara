// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { IMuaraLens } from "../interfaces/IMuaraLens.sol";
import { IMuaraPool } from "../interfaces/IMuaraPool.sol";
import { IRiskEngine } from "../interfaces/IRiskEngine.sol";
import { IShortModule } from "../interfaces/IShortModule.sol";
import { IMuaraExchange } from "../interfaces/IMuaraExchange.sol";
import { DataTypes } from "../lib/DataTypes.sol";
import { WadRayMath } from "../lib/WadRayMath.sol";
import { PercentageMath } from "../lib/PercentageMath.sol";

/// @title MuaraLens
/// @notice Batches the reads the dashboard and keeper need into single calls.
contract MuaraLens is IMuaraLens {
    using WadRayMath for uint256;
    using PercentageMath for uint256;

    IMuaraPool public immutable pool;
    IShortModule public immutable shortModule;
    IMuaraExchange public immutable exchange;

    constructor(IMuaraPool pool_, IShortModule shortModule_, IMuaraExchange exchange_) {
        pool = pool_;
        shortModule = shortModule_;
        exchange = exchange_;
    }

    /// @inheritdoc IMuaraLens
    function getReserves() external view returns (ReserveView[] memory views) {
        address[] memory assets = pool.getReservesList();
        IRiskEngine risk = pool.riskEngine();
        views = new ReserveView[](assets.length);
        for (uint256 i; i < assets.length; ++i) {
            views[i] = _reserveView(assets[i], risk);
        }
    }

    /// @inheritdoc IMuaraLens
    function getUser(address user) external view returns (UserView memory view_) {
        address[] memory assets = pool.getReservesList();
        IRiskEngine risk = pool.riskEngine();
        view_.account = pool.getAccountData(user);
        view_.reserves = new UserReserveView[](assets.length);
        for (uint256 i; i < assets.length; ++i) {
            UserReserveView memory r = view_.reserves[i];
            r.asset = assets[i];
            (r.collateral, r.debt, r.lendable) = pool.getUserReserve(user, assets[i]);
            if (r.collateral == 0 && r.debt == 0) continue;
            r.claimableRewards = pool.claimableRewards(user, assets[i]);
            DataTypes.RiskData memory data = risk.getRiskData(assets[i]);
            uint8 decimals = pool.getReserveData(assets[i]).decimals;
            r.collateralValue = r.collateral.toValue(data.price, decimals);
            r.debtValue = r.debt.toValue(data.price, decimals);
        }
    }

    /// @inheritdoc IMuaraLens
    function previewAction(address user, Action action, address asset, uint256 amount)
        external
        view
        returns (DataTypes.AccountData memory data)
    {
        address[] memory assets = pool.getReservesList();
        IRiskEngine risk = pool.riskEngine();
        data.pricesFresh = true;
        for (uint256 i; i < assets.length; ++i) {
            (uint256 collateral, uint256 debt,) = pool.getUserReserve(user, assets[i]);
            if (assets[i] == asset) (collateral, debt) = _applyAction(action, amount, collateral, debt);
            if (collateral == 0 && debt == 0) continue;

            DataTypes.RiskData memory r = risk.getRiskData(assets[i]);
            if (!r.priceFresh) data.pricesFresh = false;
            uint8 decimals = pool.getReserveData(assets[i]).decimals;
            uint256 collateralValue = collateral.toValue(r.price, decimals);
            data.collateralValue += collateralValue;
            data.borrowCapacity += collateralValue.bpsMul(r.ltvBps);
            data.liquidationCapacity += collateralValue.bpsMul(r.liquidationThresholdBps);
            data.debtValue += debt.toValue(r.price, decimals);
        }
        data.healthFactor = data.debtValue == 0 ? type(uint256).max : data.liquidationCapacity.wadDiv(data.debtValue);
    }

    /// @inheritdoc IMuaraLens
    function getShort(address user, address asset) external view returns (ShortView memory s) {
        IShortModule.Position memory position = shortModule.getPosition(user, asset);
        s.size = position.size;
        s.proceeds = position.proceeds;
        (, s.debt,) = pool.getUserReserve(user, asset);
        if (s.debt == 0) return s;
        s.buybackCost = exchange.quoteBuy(asset, s.debt);
        s.pnl = SafeCast.toInt256(s.proceeds) - SafeCast.toInt256(s.buybackCost);
    }

    /// @inheritdoc IMuaraLens
    function session() external view returns (DataTypes.Session) {
        return pool.riskEngine().currentSession();
    }

    function _reserveView(address asset, IRiskEngine risk) internal view returns (ReserveView memory v) {
        DataTypes.ReserveData memory r = pool.getReserveData(asset);
        DataTypes.RiskData memory data = risk.getRiskData(asset);
        v.asset = asset;
        v.symbol = IERC20Metadata(asset).symbol();
        v.decimals = r.decimals;
        v.isStock = r.isStock;
        v.active = r.active;
        v.borrowEnabled = r.borrowEnabled;
        (v.totalSupplied, v.totalLendable, v.totalBorrowed) = pool.getReserveTotals(asset);
        v.availableLiquidity = pool.availableLiquidity(asset);
        if (v.totalLendable != 0) {
            v.utilization = v.totalBorrowed.rayDiv(v.totalLendable);
            if (v.utilization > WadRayMath.RAY) v.utilization = WadRayMath.RAY;
        }
        v.borrowRate = r.currentBorrowRate;
        v.supplyRate = r.currentBorrowRate.rayMul(v.utilization).bpsMul(PercentageMath.BPS - r.reserveFactorBps);
        v.price = data.price;
        v.priceFresh = data.priceFresh;
        v.ltvBps = data.ltvBps;
        v.liquidationThresholdBps = data.liquidationThresholdBps;
        v.liquidationBonusBps = data.liquidationBonusBps;
        v.maxUtilizationBps = data.maxUtilizationBps;
    }

    function _applyAction(Action action, uint256 amount, uint256 collateral, uint256 debt)
        internal
        pure
        returns (uint256, uint256)
    {
        if (action == Action.Supply) return (collateral + amount, debt);
        if (action == Action.Withdraw) return (amount > collateral ? 0 : collateral - amount, debt);
        if (action == Action.Borrow) return (collateral, debt + amount);
        return (collateral, amount > debt ? 0 : debt - amount);
    }
}
