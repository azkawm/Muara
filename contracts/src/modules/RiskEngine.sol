// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IRiskEngine } from "../interfaces/IRiskEngine.sol";
import { IMuaraOracle } from "../interfaces/IMuaraOracle.sol";
import { DataTypes } from "../lib/DataTypes.sol";
import { Errors } from "../lib/Errors.sol";
import { MarketHours } from "../lib/MarketHours.sol";
import { PercentageMath } from "../lib/PercentageMath.sol";

/// @title RiskEngine
/// @notice Per-asset risk parameters, adjusted for the underlying market's session.
/// @dev Stock tokens trade 24/7 while NYSE does not. For assets with `marketHours`:
///      - PreClose (last 30 min): the LTV cut applies in full and the liquidation threshold
///        ramps linearly toward its closed value, so no position is pushed under by a step.
///      - Closed and Weekend: their own LTV and liquidation threshold cuts apply.
///      A price older than `maxPriceAge` (0 disables the check) marks the asset stale; the
///      pool then pauses liquidations and new borrows that depend on it.
contract RiskEngine is IRiskEngine, Ownable {
    IMuaraOracle public immutable oracle;

    int32 public utcOffset;
    bool public overrideActive;
    DataTypes.Session public overrideSession;

    mapping(address asset => RiskConfig) internal _configs;

    constructor(IMuaraOracle oracle_, int32 utcOffset_, address owner_) Ownable(owner_) {
        if (address(oracle_) == address(0)) revert Errors.ZeroAddress();
        oracle = oracle_;
        utcOffset = utcOffset_;
    }

    /// @inheritdoc IRiskEngine
    function getRiskData(address asset) external view returns (DataTypes.RiskData memory data) {
        RiskConfig memory c = _configs[asset];
        if (!c.configured) revert Errors.AssetNotConfigured(asset);

        (uint256 price, uint256 updatedAt) = oracle.getPrice(asset);
        data.price = price;
        data.priceFresh = c.maxPriceAge == 0 || block.timestamp - updatedAt <= c.maxPriceAge;
        data.liquidationBonusBps = c.liquidationBonusBps;
        data.closeFactorBps = c.closeFactorBps;
        data.maxUtilizationBps = c.maxUtilizationBps;
        data.ltvBps = c.ltvBps;
        data.liquidationThresholdBps = c.liquidationThresholdBps;
        if (!c.marketHours) return data;

        (DataTypes.Session session, uint256 preCloseElapsed) = _session();
        if (session == DataTypes.Session.PreClose) {
            data.ltvBps -= c.preCloseLtvCutBps;
            uint256 ramp = uint256(c.closedLtCutBps) * preCloseElapsed / MarketHours.PRE_CLOSE_WINDOW;
            // Bounded by closedLtCutBps (uint16) because preCloseElapsed < PRE_CLOSE_WINDOW.
            // forge-lint: disable-next-line(unsafe-typecast)
            data.liquidationThresholdBps -= uint16(ramp);
        } else if (session == DataTypes.Session.Closed) {
            data.ltvBps -= c.closedLtvCutBps;
            data.liquidationThresholdBps -= c.closedLtCutBps;
        } else if (session == DataTypes.Session.Weekend) {
            data.ltvBps -= c.weekendLtvCutBps;
            data.liquidationThresholdBps -= c.weekendLtCutBps;
        }
    }

    function getRiskConfig(address asset) external view returns (RiskConfig memory) {
        return _configs[asset];
    }

    /// @inheritdoc IRiskEngine
    function currentSession() external view returns (DataTypes.Session session) {
        (session,) = _session();
    }

    function setRiskConfig(address asset, RiskConfig calldata c) external onlyOwner {
        if (asset == address(0)) revert Errors.ZeroAddress();
        uint256 bps = PercentageMath.BPS;
        if (
            c.ltvBps == 0 || c.ltvBps > c.liquidationThresholdBps || c.liquidationThresholdBps >= bps
                || c.closeFactorBps == 0 || c.closeFactorBps > bps || c.maxUtilizationBps > bps
                // Seizing collateral plus bonus must never need more collateral than the threshold covers.
                || uint256(c.liquidationThresholdBps) * (bps + c.liquidationBonusBps) > bps * bps
                || c.preCloseLtvCutBps > c.ltvBps || c.closedLtvCutBps > c.ltvBps || c.weekendLtvCutBps > c.ltvBps
                || c.closedLtCutBps > c.liquidationThresholdBps || c.weekendLtCutBps > c.liquidationThresholdBps
        ) revert Errors.InvalidParams();

        RiskConfig memory stored = c;
        stored.configured = true;
        _configs[asset] = stored;
        emit RiskConfigSet(asset, stored);
    }

    /// @notice Force a session, e.g. for exchange holidays or the demo weekend scenario.
    function setSessionOverride(DataTypes.Session session) external onlyOwner {
        overrideActive = true;
        overrideSession = session;
        emit SessionOverrideSet(true, session);
    }

    function clearSessionOverride() external onlyOwner {
        overrideActive = false;
        emit SessionOverrideSet(false, DataTypes.Session.Open);
    }

    /// @notice New York offset from UTC in seconds; update at DST changes.
    function setUtcOffset(int32 utcOffset_) external onlyOwner {
        if (utcOffset_ < -14 hours || utcOffset_ > 14 hours) revert Errors.InvalidParams();
        utcOffset = utcOffset_;
        emit UtcOffsetSet(utcOffset_);
    }

    function _session() internal view returns (DataTypes.Session, uint256) {
        if (overrideActive) return (overrideSession, 0);
        return MarketHours.sessionAt(block.timestamp, utcOffset);
    }
}
