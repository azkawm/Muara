// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MuaraFixture } from "../utils/MuaraFixture.sol";
import { IShortModule } from "../../src/interfaces/IShortModule.sol";
import { IMuaraLens } from "../../src/interfaces/IMuaraLens.sol";
import { Errors } from "../../src/lib/Errors.sol";

contract ShortModuleTest is MuaraFixture {
    function setUp() public override {
        super.setUp();
        vm.prank(rina);
        pool.supply(address(nvda), 100e18, rina);
    }

    function test_openShortInOneCall() public {
        uint256 proceeds = _budiOpensShort(3_800e6, 50e18);

        // 50 x $150 minus 30 bps.
        assertEq(proceeds, 7_477.5e6);
        (uint256 collateral, uint256 debt,) = pool.getUserReserve(budi, address(usdc));
        assertEq(collateral, 3_800e6 + proceeds);
        assertEq(debt, 0);
        (, debt,) = pool.getUserReserve(budi, address(nvda));
        assertEq(debt, 50e18);

        IShortModule.Position memory p = shorts.getPosition(budi, address(nvda));
        assertEq(p.size, 50e18);
        assertEq(p.proceeds, proceeds);
        assertEq(nvda.balanceOf(address(shorts)), 0);
        assertEq(usdc.balanceOf(address(shorts)), 0);
    }

    function test_openShortCountsProceedsTowardInitialMargin() public {
        // 3,000 USDC alone cannot back a 7,500 short; with proceeds it is still under 150%.
        vm.prank(budi);
        vm.expectRevert();
        shorts.openShort(address(nvda), 3_000e6, 50e18, 0);

        // 3,800 plus 7,477.5 of proceeds clears the 150% initial requirement.
        _budiOpensShort(3_800e6, 50e18);
    }

    function test_closeShortAtProfit() public {
        uint256 proceeds = _budiOpensShort(3_800e6, 50e18);
        _setNvdaPrice(120e18);

        IMuaraLens.ShortView memory live = lens.getShort(budi, address(nvda));
        assertGt(live.pnl, 0);

        vm.prank(budi);
        (uint256 repaid, uint256 spent) = shorts.closeShort(address(nvda), type(uint256).max, type(uint256).max);

        assertEq(repaid, 50e18);
        assertEq(spent, exchange.quoteBuy(address(nvda), 50e18));
        (, uint256 debt,) = pool.getUserReserve(budi, address(nvda));
        assertEq(debt, 0);
        (uint256 collateral,,) = pool.getUserReserve(budi, address(usdc));
        assertEq(collateral, 3_800e6 + proceeds - spent);
        assertGt(collateral, 3_800e6 + 1_400e6);

        IShortModule.Position memory p = shorts.getPosition(budi, address(nvda));
        assertEq(p.size, 0);
        assertEq(p.proceeds, 0);
    }

    function test_partialClose() public {
        _budiOpensShort(3_800e6, 50e18);
        vm.prank(budi);
        shorts.closeShort(address(nvda), 20e18, type(uint256).max);
        (, uint256 debt,) = pool.getUserReserve(budi, address(nvda));
        assertEq(debt, 30e18);
        assertEq(shorts.getPosition(budi, address(nvda)).size, 30e18);
    }

    function test_closeShortSlippageGuard() public {
        _budiOpensShort(3_800e6, 50e18);
        vm.prank(budi);
        vm.expectRevert();
        shorts.closeShort(address(nvda), type(uint256).max, 1e6);
    }

    function test_closeWithoutDebtReverts() public {
        vm.prank(budi);
        vm.expectRevert(Errors.NoDebt.selector);
        shorts.closeShort(address(nvda), 1e18, type(uint256).max);
    }

    function test_holderEarnsShortBorrowFee() public {
        _budiOpensShort(3_800e6, 50e18);
        vm.warp(block.timestamp + 30 days);
        (uint256 rinaNvda,,) = pool.getUserReserve(rina, address(nvda));
        assertGt(rinaNvda, 100e18);
    }
}
