// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { DataTypes } from "../lib/DataTypes.sol";
import { IMuaraOracle } from "./IMuaraOracle.sol";

/// @title IRiskEngine
/// @notice Per-asset risk parameters with market-hours adjustments and price freshness.
interface IRiskEngine {
    /// @notice Base risk configuration for an asset. Cuts are subtracted from the base value
    ///         during the matching session when `marketHours` is true.
    struct RiskConfig {
        bool configured;
        bool marketHours;
        uint16 ltvBps;
        uint16 liquidationThresholdBps;
        uint16 liquidationBonusBps;
        uint16 closeFactorBps;
        uint16 maxUtilizationBps;
        uint32 maxPriceAge;
        uint16 preCloseLtvCutBps;
        uint16 closedLtvCutBps;
        uint16 weekendLtvCutBps;
        uint16 closedLtCutBps;
        uint16 weekendLtCutBps;
    }

    event RiskConfigSet(address indexed asset, RiskConfig config);
    event SessionOverrideSet(bool active, DataTypes.Session session);
    event UtcOffsetSet(int32 utcOffset);

    function oracle() external view returns (IMuaraOracle);

    /// @notice Effective risk data for `asset` at the current block.
    function getRiskData(address asset) external view returns (DataTypes.RiskData memory);

    function getRiskConfig(address asset) external view returns (RiskConfig memory);

    /// @notice Current session, honoring the admin override.
    function currentSession() external view returns (DataTypes.Session);

    function setRiskConfig(address asset, RiskConfig calldata config) external;

    function setSessionOverride(DataTypes.Session session) external;

    function clearSessionOverride() external;

    function setUtcOffset(int32 utcOffset) external;
}
