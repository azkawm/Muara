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
import { DeliveryLogic } from "./DeliveryLogic.sol";
import { IMuaraPool } from "../interfaces/IMuaraPool.sol";

/// @title BorrowLogic
/// @notice Borrow and repay.
library BorrowLogic {
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;
    using PercentageMath for uint256;
    using ReserveLogic for DataTypes.ReserveData;
    using ReserveLogic for DataTypes.UserReserve;

    /// @return amount Amount added to the user's debt, ready for delivery.
    function executeBorrow(DataTypes.PoolState storage s, DataTypes.BorrowParams memory p)
        external
        returns (uint256 amount)
    {
        if (p.to == address(0)) revert Errors.ZeroAddress();
        DataTypes.ReserveData storage r = s.reserves[p.asset];
        if (!r.active) revert Errors.ReserveNotActive(p.asset);
        if (!r.borrowEnabled) revert Errors.BorrowNotEnabled(p.asset);
        r.accrue();

        amount = p.amount;
        if (DeliveryLogic.isRemote(s.localEid, p.dstEid)) amount = DeliveryLogic.removeDust(p.asset, amount);
        if (amount == 0) revert Errors.ZeroAmount();

        DataTypes.RiskData memory risk = s.riskEngine.getRiskData(p.asset);
        if (!risk.priceFresh) revert Errors.StalePrice();
        if (amount > r.availableLiquidity(p.asset)) revert Errors.InsufficientLiquidity(p.asset);
        uint256 debtAfter = r.totalDebt(r.borrowIndex) + amount;
        if (debtAfter > r.totalLendable(r.liquidityIndex).bpsMul(risk.maxUtilizationBps)) {
            revert Errors.UtilizationCapExceeded(p.asset);
        }

        uint256 scaled = amount.rayDivUp(r.borrowIndex);
        s.users[p.user][p.asset].scaledDebt += scaled;
        r.totalScaledDebt += scaled;

        r.updateRate(p.asset, s.rateModel);
        if (p.checkHealth) HealthLogic.requireBorrowCapacity(s, p.user);
        emit IMuaraPool.Borrow(p.asset, p.user, p.to, amount, p.dstEid);
    }

    /// @return repaid Debt actually repaid, capped at the outstanding amount.
    function executeRepay(DataTypes.PoolState storage s, DataTypes.RepayParams memory p)
        external
        returns (uint256 repaid)
    {
        DataTypes.ReserveData storage r = s.reserves[p.asset];
        r.accrue();

        DataTypes.UserReserve storage u = s.users[p.onBehalfOf][p.asset];
        uint256 debt = u.userDebt(r.borrowIndex);
        if (debt == 0) revert Errors.NoDebt();
        repaid = p.amount < debt ? p.amount : debt;
        if (repaid == 0) revert Errors.ZeroAmount();

        uint256 scaled = repaid == debt ? u.scaledDebt : repaid.rayDiv(r.borrowIndex);
        u.scaledDebt -= scaled;
        r.totalScaledDebt -= scaled;

        IERC20(p.asset).safeTransferFrom(p.from, address(this), repaid);
        r.updateRate(p.asset, s.rateModel);
        emit IMuaraPool.Repay(p.asset, p.onBehalfOf, p.from, repaid);
    }
}
