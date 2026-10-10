// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { DataTypes } from "./DataTypes.sol";
import { Errors } from "./Errors.sol";
import { WadRayMath } from "./WadRayMath.sol";
import { PercentageMath } from "./PercentageMath.sol";
import { ReserveLogic } from "./ReserveLogic.sol";

/// @title HealthLogic
/// @notice Account valuation and health checks.
/// @dev Health factor = sum(collateral value x liquidation threshold) / debt value.
///      Borrow capacity = sum(collateral value x LTV); borrows and withdrawals must stay within it.
library HealthLogic {
    using WadRayMath for uint256;
    using PercentageMath for uint256;
    using ReserveLogic for DataTypes.ReserveData;
    using ReserveLogic for DataTypes.UserReserve;

    function getAccountData(DataTypes.PoolState storage s, address user)
        internal
        view
        returns (DataTypes.AccountData memory data)
    {
        data.pricesFresh = true;
        uint256 count = s.reservesList.length;
        for (uint256 i; i < count; ++i) {
            address asset = s.reservesList[i];
            DataTypes.UserReserve storage u = s.users[user][asset];
            if (u.scaledLendable == 0 && u.locked == 0 && u.scaledDebt == 0) continue;

            DataTypes.ReserveData storage r = s.reserves[asset];
            (uint256 liquidityIndex, uint256 borrowIndex,) = r.previewIndexes();
            DataTypes.RiskData memory risk = s.riskEngine.getRiskData(asset);
            if (!risk.priceFresh) data.pricesFresh = false;

            uint256 collateralValue = u.userCollateral(liquidityIndex).toValue(risk.price, r.decimals);
            data.collateralValue += collateralValue;
            data.borrowCapacity += collateralValue.bpsMul(risk.ltvBps);
            data.liquidationCapacity += collateralValue.bpsMul(risk.liquidationThresholdBps);
            data.debtValue += u.userDebt(borrowIndex).toValue(risk.price, r.decimals);
        }
        data.healthFactor = data.debtValue == 0 ? type(uint256).max : data.liquidationCapacity.wadDiv(data.debtValue);
    }

    /// @notice Revert unless debt fits within LTV-based borrow capacity at fresh prices.
    function requireBorrowCapacity(DataTypes.PoolState storage s, address user) internal view {
        DataTypes.AccountData memory data = getAccountData(s, user);
        if (data.debtValue == 0) return;
        if (!data.pricesFresh) revert Errors.StalePrice();
        if (data.debtValue > data.borrowCapacity) {
            revert Errors.BorrowCapacityExceeded(data.debtValue, data.borrowCapacity);
        }
    }
}
