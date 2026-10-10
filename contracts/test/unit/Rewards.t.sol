// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MuaraFixture } from "../utils/MuaraFixture.sol";
import { IMuaraLens } from "../../src/interfaces/IMuaraLens.sol";
import { Errors } from "../../src/lib/Errors.sol";

contract RewardsTest is MuaraFixture {
    function setUp() public override {
        super.setUp();
        vm.prank(rina);
        pool.supply(address(nvda), 100e18, rina);
        _budiOpensShort(3_800e6, 50e18);
        vm.warp(block.timestamp + 30 days);
        _setNvdaPrice(NVDA_PRICE);
    }

    function test_holderAccruesClaimableRewards() public view {
        uint256 claimable = pool.claimableRewards(rina, address(nvda));
        (uint256 collateral,,) = pool.getUserReserve(rina, address(nvda));
        assertGt(claimable, 0);
        assertApproxEqAbs(collateral, 100e18 + claimable, 1);

        IMuaraLens.UserView memory v = lens.getUser(rina);
        bool found;
        for (uint256 i; i < v.reserves.length; ++i) {
            if (v.reserves[i].asset == address(nvda)) {
                assertEq(v.reserves[i].claimableRewards, claimable);
                found = true;
            }
        }
        assertTrue(found);
    }

    function test_claimInUsdcByDefault() public {
        (uint256 claimable, uint256 usdcOut) = rewards.previewClaimInUsdc(rina, address(nvda));
        assertGt(usdcOut, 0);

        vm.prank(rina);
        uint256 paid = rewards.claimInUsdc(address(nvda), usdcOut, rina, 0);

        assertEq(paid, usdcOut);
        assertEq(usdc.balanceOf(rina), usdcOut);
        assertEq(pool.claimableRewards(rina, address(nvda)), 0);
        (uint256 collateral,,) = pool.getUserReserve(rina, address(nvda));
        assertApproxEqAbs(collateral, 100e18, 1);
        assertEq(nvda.balanceOf(address(rewards)), 0);
        assertGt(claimable, 0);
    }

    function test_claimInUsdcDeliveredToArbitrum() public {
        (, uint256 usdcOut) = rewards.previewClaimInUsdc(rina, address(nvda));
        uint256 fee = pool.quoteDelivery(address(usdc), usdcOut, B, rina);
        vm.prank(rina);
        rewards.claimInUsdc{ value: fee }(address(nvda), usdcOut, rina, B);
        verifyPackets(B, address(usdcB));
        assertEq(usdcB.balanceOf(rina), usdcOut);
    }

    function test_claimInKindKeepsPrincipal() public {
        uint256 claimable = pool.claimableRewards(rina, address(nvda));
        vm.prank(rina);
        uint256 claimed = pool.claimRewards(address(nvda), rina, 0);
        assertEq(claimed, claimable);
        assertEq(nvda.balanceOf(rina), claimed);
        (uint256 collateral,,) = pool.getUserReserve(rina, address(nvda));
        assertApproxEqAbs(collateral, 100e18, 1);
    }

    function test_partialWithdrawKeepsRewardsClaimable() public {
        uint256 claimable = pool.claimableRewards(rina, address(nvda));
        vm.prank(rina);
        pool.withdraw(address(nvda), 30e18, rina, 0);
        assertApproxEqAbs(pool.claimableRewards(rina, address(nvda)), claimable, 1);
    }

    function test_usdcSupplierEarnsInUsdc() public {
        vm.prank(rina);
        pool.borrow(address(usdc), 8_000e6, rina, 0);
        vm.warp(block.timestamp + 30 days);
        _setNvdaPrice(NVDA_PRICE);

        (uint256 claimable, uint256 usdcOut) = rewards.previewClaimInUsdc(dewi, address(usdc));
        assertGt(claimable, 0);
        assertEq(usdcOut, claimable);
        vm.prank(dewi);
        rewards.claimInUsdc(address(usdc), 0, dewi, 0);
        assertEq(usdc.balanceOf(dewi), claimable);
    }

    function test_nothingToClaimReverts() public {
        vm.prank(budi);
        vm.expectRevert(Errors.NoRewards.selector);
        pool.claimRewards(address(nvda), budi, 0);
    }

    function test_lockedStockHasNoRewards() public {
        address sari = makeAddr("sari");
        address[] memory accounts = new address[](1);
        accounts[0] = sari;
        allowA.setAllowed(accounts, true);
        nvda.mint(sari, 10e18);
        vm.startPrank(sari);
        nvda.approve(address(pool), type(uint256).max);
        pool.setLendable(address(nvda), false);
        pool.supply(address(nvda), 10e18, sari);
        vm.stopPrank();

        vm.warp(block.timestamp + 30 days);
        assertEq(pool.claimableRewards(sari, address(nvda)), 0);
    }

    function test_onlyModuleCanClaimFor() public {
        vm.expectRevert(Errors.OnlyModule.selector);
        pool.claimRewardsFor(rina, address(nvda), address(this));
    }
}
