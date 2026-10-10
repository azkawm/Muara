// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MuaraFixture } from "../utils/MuaraFixture.sol";
import { DataTypes } from "../../src/lib/DataTypes.sol";

/// @notice The hackathon demo end to end.
/// @dev Numbers differ from the original script so the 150% / 120% ratios produce the
///      intended outcomes: Rina borrows 8,000 (10,000 would be liquidated at exactly $120)
///      and Budi posts 3,800 (with 15,000 his short only liquidates above ~$370).
contract DemoFlowTest is MuaraFixture {
    function setUp() public override {
        super.setUp();
        // Step 1: Rina deposits 100 NVDA on Base and borrows USDC delivered to Arbitrum.
        _rinaSuppliesAndBorrows(100e18, 8_000e6, B);
        verifyPackets(B, address(usdcB));
        // Step 2: Budi opens a 50 NVDA short at $150.
        _budiOpensShort(3_800e6, 50e18);
    }

    function test_scenarioA_priceFallsBudiProfitsRinaEarns() public {
        vm.warp(block.timestamp + 7 days);
        _setNvdaPrice(120e18);
        assertGt(_healthFactor(rina), 1e18);

        vm.prank(budi);
        shorts.closeShort(address(nvda), type(uint256).max, type(uint256).max);

        (uint256 budiUsdc,,) = pool.getUserReserve(budi, address(usdc));
        assertGt(budiUsdc, 3_800e6);
        uint256 fee = pool.quoteDelivery(address(usdc), budiUsdc, B, budi);
        vm.prank(budi);
        pool.withdraw{ value: fee }(address(usdc), type(uint256).max, budi, B);
        verifyPackets(B, address(usdcB));
        assertEq(usdcB.balanceOf(budi), budiUsdc);

        (uint256 rinaNvda,,) = pool.getUserReserve(rina, address(nvda));
        assertGt(rinaNvda, 100e18);
    }

    function test_scenarioB_spikeLiquidatesAndBlocksWithdraw() public {
        _setNvdaPrice(190e18);
        assertLt(_healthFactor(budi), 1e18);

        // Margin call: the withdrawal to Arbitrum fails the health check on Base.
        uint256 fee = pool.quoteDelivery(address(usdc), 1_000e6, B, budi);
        vm.prank(budi);
        vm.expectRevert();
        pool.withdraw{ value: fee }(address(usdc), 1_000e6, budi, B);

        // Keeper buys stock and liquidates.
        vm.startPrank(keeper);
        usdc.approve(address(exchange), type(uint256).max);
        exchange.buy(address(nvda), 25e18, type(uint256).max, keeper);
        nvda.approve(address(pool), type(uint256).max);
        pool.liquidate(address(usdc), address(nvda), budi, 25e18);
        vm.stopPrank();

        assertGt(_healthFactor(budi), 1e18);
        // Still above initial margin requirement, so withdrawal stays blocked.
        vm.prank(budi);
        vm.expectRevert();
        pool.withdraw{ value: fee }(address(usdc), 1_000e6, budi, B);

        // Rina's long is untouched by the spike.
        assertGt(_healthFactor(rina), 1.5e18);
    }

    function test_weekendOverrideTightensMargin() public {
        assertEq(uint8(_session()), uint8(DataTypes.Session.Open));
        risk.setSessionOverride(DataTypes.Session.Weekend);
        vm.prank(rina);
        vm.expectRevert();
        pool.borrow(address(usdc), 1_000e6, rina, 0);
    }
}
