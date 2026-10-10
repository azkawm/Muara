// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MuaraFixture } from "../utils/MuaraFixture.sol";
import { Errors } from "../../src/lib/Errors.sol";

contract LiquidationTest is MuaraFixture {
    function setUp() public override {
        super.setUp();
        vm.prank(rina);
        pool.supply(address(nvda), 100e18, rina);
        _budiOpensShort(3_800e6, 50e18);

        // The keeper buys stock to repay the short seller's debt.
        vm.startPrank(keeper);
        usdc.approve(address(exchange), type(uint256).max);
        exchange.buy(address(nvda), 60e18, type(uint256).max, keeper);
        nvda.approve(address(pool), type(uint256).max);
        vm.stopPrank();
    }

    function test_healthyPositionCannotBeLiquidated() public {
        vm.prank(keeper);
        vm.expectRevert();
        pool.liquidate(address(usdc), address(nvda), budi, 10e18);
    }

    function test_spikeTo190LiquidatesShort() public {
        _setNvdaPrice(190e18);
        assertLt(_healthFactor(budi), 1e18);

        uint256 keeperUsdcBefore = usdc.balanceOf(keeper);
        vm.prank(keeper);
        (uint256 repaid, uint256 seized) = pool.liquidate(address(usdc), address(nvda), budi, type(uint256).max);

        // Health factor is above 0.95, so the 50% close factor applies.
        assertEq(repaid, 25e18);
        // 25 x $190 x 1.05
        assertEq(seized, 4_987.5e6);
        uint256 fee = (seized - 4_750e6) / 10;
        assertEq(usdc.balanceOf(keeper) - keeperUsdcBefore, seized - fee);
        assertEq(pool.getReserveData(address(usdc)).accruedToTreasury, fee);
        assertGt(_healthFactor(budi), 1e18);
    }

    function test_deepUnderwaterAllowsFullClose() public {
        _setNvdaPrice(220e18);
        assertLt(_healthFactor(budi), 0.95e18);

        vm.prank(keeper);
        (uint256 repaid, uint256 seized) = pool.liquidate(address(usdc), address(nvda), budi, type(uint256).max);

        (uint256 collateral,,) = pool.getUserReserve(budi, address(usdc));
        assertEq(collateral, 0);
        assertEq(seized, 3_800e6 + 7_477.5e6);
        assertLt(repaid, 50e18);
    }

    function test_stalePricePausesLiquidation() public {
        _setNvdaPrice(190e18);
        vm.warp(block.timestamp + 2 hours);
        vm.prank(keeper);
        vm.expectRevert(Errors.LiquidationPaused.selector);
        pool.liquidate(address(usdc), address(nvda), budi, type(uint256).max);
    }

    function test_marginCallBlocksWithdraw() public {
        _setNvdaPrice(185e18);
        assertGt(_healthFactor(budi), 1e18);
        vm.prank(budi);
        vm.expectRevert();
        pool.withdraw(address(usdc), 100e6, budi, 0);
    }
}
