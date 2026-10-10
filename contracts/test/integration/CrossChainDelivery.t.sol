// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MuaraFixture } from "../utils/MuaraFixture.sol";
import { Errors } from "../../src/lib/Errors.sol";

contract CrossChainDeliveryTest is MuaraFixture {
    function test_borrowDeliveredToSpoke() public {
        uint256 ethBefore = rina.balance;
        _rinaSuppliesAndBorrows(100e18, 8_000e6, B);
        assertEq(usdc.balanceOf(rina), 0);

        verifyPackets(B, address(usdcB));
        assertEq(usdcB.balanceOf(rina), 8_000e6);
        assertLt(rina.balance, ethBefore);
        (, uint256 debt,) = pool.getUserReserve(rina, address(usdc));
        assertEq(debt, 8_000e6);
    }

    function test_quoteIsZeroForLocalDelivery() public view {
        assertEq(pool.quoteDelivery(address(usdc), 1_000e6, 0, rina), 0);
        assertEq(pool.quoteDelivery(address(usdc), 1_000e6, A, rina), 0);
        assertGt(pool.quoteDelivery(address(usdc), 1_000e6, B, rina), 0);
    }

    function test_withdrawStockToSpokeRemovesDust() public {
        vm.startPrank(rina);
        pool.supply(address(nvda), 100e18, rina);
        uint256 amount = 10e18 + 123; // 123 wei is below the OFT's 6 shared decimals
        uint256 fee = pool.quoteDelivery(address(nvda), amount, B, rina);
        uint256 withdrawn = pool.withdraw{ value: fee }(address(nvda), amount, rina, B);
        vm.stopPrank();

        assertEq(withdrawn, 10e18);
        verifyPackets(B, address(nvdaB));
        assertEq(nvdaB.balanceOf(rina), 10e18);
        (uint256 collateral,,) = pool.getUserReserve(rina, address(nvda));
        assertEq(collateral, 90e18);
    }

    function test_withdrawToNonAllowlistedRecipientReverts() public {
        address stranger = makeAddr("stranger");
        vm.startPrank(rina);
        pool.supply(address(nvda), 100e18, rina);
        uint256 fee = pool.quoteDelivery(address(nvda), 10e18, B, rina);
        vm.expectRevert(abi.encodeWithSelector(Errors.NotAllowlisted.selector, stranger));
        pool.withdraw{ value: fee }(address(nvda), 10e18, stranger, B);
        vm.stopPrank();
    }

    function test_excessFeeRefunded() public {
        vm.prank(rina);
        pool.supply(address(nvda), 100e18, rina);
        uint256 fee = pool.quoteDelivery(address(usdc), 1_000e6, B, rina);
        uint256 ethBefore = rina.balance;
        vm.prank(rina);
        pool.borrow{ value: fee + 1 ether }(address(usdc), 1_000e6, rina, B);
        assertEq(ethBefore - rina.balance, fee);
    }
}
