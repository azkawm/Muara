// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IMuaraPool } from "../interfaces/IMuaraPool.sol";
import { IRiskEngine } from "../interfaces/IRiskEngine.sol";
import { IInterestRateModel } from "../interfaces/IInterestRateModel.sol";
import { DataTypes } from "../lib/DataTypes.sol";
import { Errors } from "../lib/Errors.sol";
import { WadRayMath } from "../lib/WadRayMath.sol";
import { ReserveLogic } from "../lib/ReserveLogic.sol";
import { HealthLogic } from "../lib/HealthLogic.sol";
import { SupplyLogic } from "../lib/SupplyLogic.sol";
import { BorrowLogic } from "../lib/BorrowLogic.sol";
import { LiquidationLogic } from "../lib/LiquidationLogic.sol";
import { DeliveryLogic } from "../lib/DeliveryLogic.sol";

/// @title MuaraPool
/// @notice Hub loan book on Base. Holds storage, entry points and token custody; the heavy
///         flows live in linked external libraries to stay under EIP-170.
/// @dev Not upgradeable. Risk engine, rate model and hub eid are fixed at deployment.
contract MuaraPool is IMuaraPool, Ownable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;
    using ReserveLogic for DataTypes.ReserveData;
    using ReserveLogic for DataTypes.UserReserve;

    uint256 public constant MAX_RESERVES = 16;

    DataTypes.PoolState internal _s;

    modifier onlyModule() {
        if (!_s.modules[msg.sender]) revert Errors.OnlyModule();
        _;
    }

    constructor(IRiskEngine riskEngine_, IInterestRateModel rateModel_, uint32 localEid_, address owner_)
        Ownable(owner_)
    {
        if (address(riskEngine_) == address(0) || address(rateModel_) == address(0)) revert Errors.ZeroAddress();
        _s.riskEngine = riskEngine_;
        _s.rateModel = rateModel_;
        _s.localEid = localEid_;
    }

    // ---------------------------------------------------------------- user actions

    /// @inheritdoc IMuaraPool
    function supply(address asset, uint256 amount, address onBehalfOf) external nonReentrant {
        SupplyLogic.executeSupply(_s, DataTypes.SupplyParams(asset, amount, msg.sender, onBehalfOf));
    }

    /// @inheritdoc IMuaraPool
    function withdraw(address asset, uint256 amount, address to, uint32 dstEid)
        external
        payable
        nonReentrant
        returns (uint256 withdrawn)
    {
        withdrawn = SupplyLogic.executeWithdraw(
            _s, DataTypes.WithdrawParams(asset, amount, msg.sender, to, dstEid, true)
        );
        DeliveryLogic.deliver(asset, to, withdrawn, _s.localEid, dstEid, msg.value, msg.sender);
    }

    /// @inheritdoc IMuaraPool
    function borrow(address asset, uint256 amount, address to, uint32 dstEid) external payable nonReentrant {
        uint256 borrowed =
            BorrowLogic.executeBorrow(_s, DataTypes.BorrowParams(asset, amount, msg.sender, to, dstEid, true));
        DeliveryLogic.deliver(asset, to, borrowed, _s.localEid, dstEid, msg.value, msg.sender);
    }

    /// @inheritdoc IMuaraPool
    function repay(address asset, uint256 amount, address onBehalfOf) external nonReentrant returns (uint256) {
        return BorrowLogic.executeRepay(_s, DataTypes.RepayParams(asset, amount, msg.sender, onBehalfOf));
    }

    /// @inheritdoc IMuaraPool
    function claimRewards(address asset, address to, uint32 dstEid)
        external
        payable
        nonReentrant
        returns (uint256 claimed)
    {
        claimed = SupplyLogic.executeClaimRewards(_s, DataTypes.ClaimParams(asset, msg.sender, to, dstEid, true));
        DeliveryLogic.deliver(asset, to, claimed, _s.localEid, dstEid, msg.value, msg.sender);
    }

    /// @inheritdoc IMuaraPool
    function setLendable(address asset, bool lendable) external nonReentrant {
        SupplyLogic.executeSetLendable(_s, msg.sender, asset, lendable);
    }

    /// @inheritdoc IMuaraPool
    function liquidate(address collateralAsset, address debtAsset, address user, uint256 debtToCover)
        external
        nonReentrant
        returns (uint256, uint256)
    {
        return LiquidationLogic.executeLiquidation(
            _s, DataTypes.LiquidationParams(collateralAsset, debtAsset, user, debtToCover, msg.sender)
        );
    }

    // ---------------------------------------------------------------- module actions

    /// @inheritdoc IMuaraPool
    function borrowFor(address user, address asset, uint256 amount, address to) external onlyModule nonReentrant {
        uint256 borrowed = BorrowLogic.executeBorrow(_s, DataTypes.BorrowParams(asset, amount, user, to, 0, false));
        DeliveryLogic.deliver(asset, to, borrowed, _s.localEid, 0, 0, user);
    }

    /// @inheritdoc IMuaraPool
    function withdrawFor(address user, address asset, uint256 amount, address to)
        external
        onlyModule
        nonReentrant
        returns (uint256 withdrawn)
    {
        withdrawn = SupplyLogic.executeWithdraw(_s, DataTypes.WithdrawParams(asset, amount, user, to, 0, false));
        DeliveryLogic.deliver(asset, to, withdrawn, _s.localEid, 0, 0, user);
    }

    /// @inheritdoc IMuaraPool
    function claimRewardsFor(address user, address asset, address to)
        external
        onlyModule
        nonReentrant
        returns (uint256 claimed)
    {
        claimed = SupplyLogic.executeClaimRewards(_s, DataTypes.ClaimParams(asset, user, to, 0, true));
        DeliveryLogic.deliver(asset, to, claimed, _s.localEid, 0, 0, user);
    }

    /// @inheritdoc IMuaraPool
    function requireBorrowHealth(address user) external view {
        HealthLogic.requireBorrowCapacity(_s, user);
    }

    // ---------------------------------------------------------------- views

    function riskEngine() external view returns (IRiskEngine) {
        return _s.riskEngine;
    }

    function rateModel() external view returns (IInterestRateModel) {
        return _s.rateModel;
    }

    function localEid() external view returns (uint32) {
        return _s.localEid;
    }

    function isModule(address module) external view returns (bool) {
        return _s.modules[module];
    }

    function getReservesList() external view returns (address[] memory) {
        return _s.reservesList;
    }

    function getReserveData(address asset) external view returns (DataTypes.ReserveData memory) {
        return _s.reserves[asset];
    }

    function getNormalizedIndexes(address asset) public view returns (uint256 liquidityIndex, uint256 borrowIndex) {
        (liquidityIndex, borrowIndex,) = _s.reserves[asset].previewIndexes();
    }

    function getReserveTotals(address asset)
        external
        view
        returns (uint256 supplied, uint256 lendable, uint256 borrowed)
    {
        DataTypes.ReserveData storage r = _s.reserves[asset];
        (uint256 liquidityIndex, uint256 borrowIndex) = getNormalizedIndexes(asset);
        lendable = r.totalLendable(liquidityIndex);
        supplied = lendable + r.totalLocked;
        borrowed = r.totalDebt(borrowIndex);
    }

    function availableLiquidity(address asset) external view returns (uint256) {
        return _s.reserves[asset].availableLiquidity(asset);
    }

    function getUserReserve(address user, address asset)
        external
        view
        returns (uint256 collateral, uint256 debt, bool lendable)
    {
        DataTypes.UserReserve storage u = _s.users[user][asset];
        (uint256 liquidityIndex, uint256 borrowIndex) = getNormalizedIndexes(asset);
        collateral = u.userCollateral(liquidityIndex);
        debt = u.userDebt(borrowIndex);
        lendable = !(_s.reserves[asset].isStock && u.nonLendable);
    }

    function getAccountData(address user) external view returns (DataTypes.AccountData memory) {
        return HealthLogic.getAccountData(_s, user);
    }

    function claimableRewards(address user, address asset) external view returns (uint256) {
        (uint256 liquidityIndex,) = getNormalizedIndexes(asset);
        return _s.users[user][asset].earnedRewards(liquidityIndex);
    }

    function quoteDelivery(address asset, uint256 amount, uint32 dstEid, address to) external view returns (uint256) {
        return DeliveryLogic.quote(asset, amount, _s.localEid, dstEid, to);
    }

    // ---------------------------------------------------------------- admin

    function initReserve(address asset, bool isStock, bool borrowEnabled, uint16 reserveFactorBps) external onlyOwner {
        if (asset == address(0)) revert Errors.ZeroAddress();
        DataTypes.ReserveData storage r = _s.reserves[asset];
        if (r.lastUpdate != 0) revert Errors.ReserveAlreadyInitialized(asset);
        if (_s.reservesList.length >= MAX_RESERVES) revert Errors.TooManyReserves();
        if (reserveFactorBps > 10_000) revert Errors.InvalidParams();

        r.active = true;
        r.isStock = isStock;
        r.borrowEnabled = borrowEnabled;
        r.decimals = IERC20Metadata(asset).decimals();
        r.reserveFactorBps = reserveFactorBps;
        r.liquidityIndex = WadRayMath.RAY;
        r.borrowIndex = WadRayMath.RAY;
        r.lastUpdate = uint40(block.timestamp);
        _s.reservesList.push(asset);

        r.updateRate(asset, _s.rateModel);
        emit ReserveInitialized(asset, isStock, r.decimals);
        emit ReserveConfigured(asset, true, borrowEnabled, reserveFactorBps);
    }

    function configureReserve(address asset, bool active, bool borrowEnabled, uint16 reserveFactorBps)
        external
        onlyOwner
    {
        DataTypes.ReserveData storage r = _s.reserves[asset];
        if (r.lastUpdate == 0) revert Errors.ReserveNotActive(asset);
        if (reserveFactorBps > 10_000) revert Errors.InvalidParams();
        r.accrue();
        r.active = active;
        r.borrowEnabled = borrowEnabled;
        r.reserveFactorBps = reserveFactorBps;
        emit ReserveConfigured(asset, active, borrowEnabled, reserveFactorBps);
    }

    function setModule(address module, bool enabled) external onlyOwner {
        if (module == address(0)) revert Errors.ZeroAddress();
        _s.modules[module] = enabled;
        emit ModuleSet(module, enabled);
    }

    function withdrawTreasury(address asset, address to, uint256 amount) external onlyOwner nonReentrant {
        DataTypes.ReserveData storage r = _s.reserves[asset];
        r.accrue();
        if (amount > r.accruedToTreasury) revert Errors.InsufficientBalance();
        uint256 balance = IERC20(asset).balanceOf(address(this));
        if (amount + r.totalLocked > balance) revert Errors.InsufficientLiquidity(asset);
        r.accruedToTreasury -= amount;
        IERC20(asset).safeTransfer(to, amount);
        emit TreasuryWithdrawn(asset, to, amount);
    }
}
