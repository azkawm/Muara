// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { DataTypes } from "./DataTypes.sol";
import { Errors } from "./Errors.sol";
import { WadRayMath } from "./WadRayMath.sol";
import { PercentageMath } from "./PercentageMath.sol";
import { ReserveLogic } from "./ReserveLogic.sol";
import { HealthLogic } from "./HealthLogic.sol";
import { IMuaraPool } from "../interfaces/IMuaraPool.sol";

/// @title LiquidationLogic
/// @notice Permissionless liquidation of positions with health factor below 1.
/// @dev The liquidator repays up to the close factor of one debt (all of it once health
///      factor drops below 0.95) and receives the matching collateral plus the bonus. The
///      protocol keeps 10% of the bonus. Liquidations pause while any price is stale.
library LiquidationLogic {
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;
    using PercentageMath for uint256;
    using ReserveLogic for DataTypes.ReserveData;
    using ReserveLogic for DataTypes.UserReserve;

    uint256 internal constant PROTOCOL_FEE_BPS = 1_000;
    uint256 internal constant FULL_CLOSE_HEALTH = 0.95e18;

    struct Vars {
        uint256 userDebt;
        uint256 userCollateral;
        uint256 debtRepaid;
        uint256 seized;
        uint256 protocolFee;
        uint256 bonusFactor;
        DataTypes.RiskData collateralRisk;
        DataTypes.RiskData debtRisk;
    }

    function executeLiquidation(DataTypes.PoolState storage s, DataTypes.LiquidationParams memory p)
        external
        returns (uint256, uint256)
    {
        DataTypes.ReserveData storage collateralReserve = s.reserves[p.collateralAsset];
        DataTypes.ReserveData storage debtReserve = s.reserves[p.debtAsset];
        if (!collateralReserve.active) revert Errors.ReserveNotActive(p.collateralAsset);
        if (!debtReserve.active) revert Errors.ReserveNotActive(p.debtAsset);
        collateralReserve.accrue();
        debtReserve.accrue();

        DataTypes.AccountData memory account = HealthLogic.getAccountData(s, p.user);
        if (!account.pricesFresh) revert Errors.LiquidationPaused();
        if (account.healthFactor >= WadRayMath.WAD) revert Errors.HealthyPosition(account.healthFactor);

        Vars memory v;
        DataTypes.UserReserve storage debtPosition = s.users[p.user][p.debtAsset];
        DataTypes.UserReserve storage collateralPosition = s.users[p.user][p.collateralAsset];
        v.userDebt = debtPosition.userDebt(debtReserve.borrowIndex);
        if (v.userDebt == 0) revert Errors.NoDebt();
        v.userCollateral = collateralPosition.userCollateral(collateralReserve.liquidityIndex);
        if (v.userCollateral == 0) revert Errors.NothingToSeize();

        v.collateralRisk = s.riskEngine.getRiskData(p.collateralAsset);
        v.debtRisk = s.riskEngine.getRiskData(p.debtAsset);
        v.bonusFactor = PercentageMath.BPS + v.collateralRisk.liquidationBonusBps;

        uint256 maxRepay =
            account.healthFactor < FULL_CLOSE_HEALTH ? v.userDebt : v.userDebt.bpsMul(v.debtRisk.closeFactorBps);
        v.debtRepaid = p.debtToCover < maxRepay ? p.debtToCover : maxRepay;
        if (v.debtRepaid == 0) revert Errors.ZeroAmount();

        uint256 seizeValue = v.debtRepaid.toValue(v.debtRisk.price, debtReserve.decimals).bpsMul(v.bonusFactor);
        v.seized = seizeValue.toAmount(v.collateralRisk.price, collateralReserve.decimals);
        if (v.seized > v.userCollateral) {
            v.seized = v.userCollateral;
            uint256 repayValue =
                v.seized.toValue(v.collateralRisk.price, collateralReserve.decimals).bpsDiv(v.bonusFactor);
            v.debtRepaid = repayValue.toAmount(v.debtRisk.price, debtReserve.decimals);
        }
        v.protocolFee = (v.seized - v.seized.bpsDiv(v.bonusFactor)).bpsMul(PROTOCOL_FEE_BPS);

        _burnDebt(debtReserve, debtPosition, v.debtRepaid, v.userDebt);
        _seizeCollateral(collateralReserve, collateralPosition, v.seized, v.userCollateral);
        collateralReserve.accruedToTreasury += v.protocolFee;

        IERC20(p.debtAsset).safeTransferFrom(p.liquidator, address(this), v.debtRepaid);
        uint256 toLiquidator = v.seized - v.protocolFee;
        if (toLiquidator > collateralReserve.availableLiquidity(p.collateralAsset)) {
            revert Errors.InsufficientLiquidity(p.collateralAsset);
        }
        IERC20(p.collateralAsset).safeTransfer(p.liquidator, toLiquidator);

        debtReserve.updateRate(p.debtAsset, s.rateModel);
        if (p.collateralAsset != p.debtAsset) collateralReserve.updateRate(p.collateralAsset, s.rateModel);

        emit IMuaraPool.Liquidation(
            p.collateralAsset, p.debtAsset, p.user, p.liquidator, v.debtRepaid, v.seized, v.protocolFee
        );
        return (v.debtRepaid, v.seized);
    }

    function _burnDebt(
        DataTypes.ReserveData storage r,
        DataTypes.UserReserve storage u,
        uint256 amount,
        uint256 userDebt
    ) private {
        uint256 scaled = amount == userDebt ? u.scaledDebt : amount.rayDiv(r.borrowIndex);
        u.scaledDebt -= scaled;
        r.totalScaledDebt -= scaled;
    }

    function _seizeCollateral(
        DataTypes.ReserveData storage r,
        DataTypes.UserReserve storage u,
        uint256 amount,
        uint256 userCollateral
    ) private {
        if (u.locked != 0) {
            u.locked -= amount;
            r.totalLocked -= amount;
        } else {
            uint256 scaled = amount == userCollateral ? u.scaledLendable : amount.rayDivUp(r.liquidityIndex);
            u.scaledLendable -= scaled;
            r.totalScaledLendable -= scaled;
            u.reducePrincipal(amount);
        }
    }
}
