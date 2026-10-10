// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { RiskEngine } from "../../src/modules/RiskEngine.sol";
import { MockPriceOracle } from "../../src/oracle/MockPriceOracle.sol";
import { IRiskEngine } from "../../src/interfaces/IRiskEngine.sol";
import { DataTypes } from "../../src/lib/DataTypes.sol";
import { Errors } from "../../src/lib/Errors.sol";

contract RiskEngineTest is Test {
    MockPriceOracle internal oracle;
    RiskEngine internal risk;
    address internal constant NVDA = address(0x1);

    // Monday 2024-01-01 10:00 New York.
    uint256 internal constant MONDAY_OPEN = 1_704_121_200;

    function setUp() public {
        vm.warp(MONDAY_OPEN);
        oracle = new MockPriceOracle(address(this));
        risk = new RiskEngine(oracle, -5 hours, address(this));
        oracle.setPrice(NVDA, 150e18);
        risk.setRiskConfig(NVDA, _config());
    }

    function _config() internal pure returns (IRiskEngine.RiskConfig memory c) {
        c.marketHours = true;
        c.ltvBps = 6_667;
        c.liquidationThresholdBps = 8_333;
        c.liquidationBonusBps = 500;
        c.closeFactorBps = 5_000;
        c.maxUtilizationBps = 8_000;
        c.maxPriceAge = 1 hours;
        c.preCloseLtvCutBps = 500;
        c.closedLtvCutBps = 500;
        c.weekendLtvCutBps = 1_000;
        c.closedLtCutBps = 200;
        c.weekendLtCutBps = 300;
    }

    function _refreshAndGet() internal returns (DataTypes.RiskData memory) {
        oracle.setPrice(NVDA, 150e18);
        return risk.getRiskData(NVDA);
    }

    function test_openSessionUsesBaseParams() public view {
        DataTypes.RiskData memory d = risk.getRiskData(NVDA);
        assertEq(d.price, 150e18);
        assertTrue(d.priceFresh);
        assertEq(d.ltvBps, 6_667);
        assertEq(d.liquidationThresholdBps, 8_333);
    }

    function test_preCloseCutsLtvAndRampsThreshold() public {
        vm.warp(MONDAY_OPEN + 5 hours + 45 minutes); // 15:45, halfway through the window
        DataTypes.RiskData memory d = _refreshAndGet();
        assertEq(d.ltvBps, 6_167);
        assertEq(d.liquidationThresholdBps, 8_233);
    }

    function test_closedAndWeekendCuts() public {
        vm.warp(MONDAY_OPEN + 8 hours); // 18:00 Monday
        DataTypes.RiskData memory d = _refreshAndGet();
        assertEq(uint8(risk.currentSession()), uint8(DataTypes.Session.Closed));
        assertEq(d.ltvBps, 6_167);
        assertEq(d.liquidationThresholdBps, 8_133);

        vm.warp(MONDAY_OPEN + 5 days); // Saturday
        d = _refreshAndGet();
        assertEq(uint8(risk.currentSession()), uint8(DataTypes.Session.Weekend));
        assertEq(d.ltvBps, 5_667);
        assertEq(d.liquidationThresholdBps, 8_033);
    }

    function test_overrideForcesSession() public {
        risk.setSessionOverride(DataTypes.Session.Weekend);
        assertEq(risk.getRiskData(NVDA).ltvBps, 5_667);
        risk.clearSessionOverride();
        assertEq(risk.getRiskData(NVDA).ltvBps, 6_667);
    }

    function test_assetsWithoutMarketHoursIgnoreSession() public {
        IRiskEngine.RiskConfig memory c = _config();
        c.marketHours = false;
        risk.setRiskConfig(NVDA, c);
        risk.setSessionOverride(DataTypes.Session.Weekend);
        assertEq(risk.getRiskData(NVDA).ltvBps, 6_667);
    }

    function test_stalePriceFlagged() public {
        vm.warp(block.timestamp + 1 hours + 1);
        assertFalse(risk.getRiskData(NVDA).priceFresh);
        assertTrue(_refreshAndGet().priceFresh);
    }

    function test_rejectsUnsafeConfig() public {
        IRiskEngine.RiskConfig memory c = _config();
        c.ltvBps = 9_000; // above liquidation threshold
        vm.expectRevert(Errors.InvalidParams.selector);
        risk.setRiskConfig(NVDA, c);

        c = _config();
        c.liquidationBonusBps = 3_000; // threshold x (1 + bonus) > 100%
        vm.expectRevert(Errors.InvalidParams.selector);
        risk.setRiskConfig(NVDA, c);
    }

    function test_onlyOwnerConfigures() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert();
        risk.setSessionOverride(DataTypes.Session.Closed);
    }

    function test_unconfiguredAssetReverts() public {
        vm.expectRevert(abi.encodeWithSelector(Errors.AssetNotConfigured.selector, address(0x2)));
        risk.getRiskData(address(0x2));
    }
}
