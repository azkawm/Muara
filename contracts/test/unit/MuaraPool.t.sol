// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MuaraFixture } from "../utils/MuaraFixture.sol";
import { Errors } from "../../src/lib/Errors.sol";
import { DataTypes } from "../../src/lib/DataTypes.sol";

contract MuaraPoolTest is MuaraFixture {
    function test_supplyAndWithdrawStock() public {
        vm.startPrank(rina);
        pool.supply(address(nvda), 100e18, rina);
        (uint256 collateral,, bool lendable) = pool.getUserReserve(rina, address(nvda));
        assertEq(collateral, 100e18);
        assertTrue(lendable);

        pool.withdraw(address(nvda), 40e18, rina, 0);
        vm.stopPrank();
        (collateral,,) = pool.getUserReserve(rina, address(nvda));
        assertEq(collateral, 60e18);
        assertEq(nvda.balanceOf(rina), 40e18);
    }

    function test_borrowWithinLtv() public {
        _rinaSuppliesAndBorrows(100e18, 8_000e6, 0);
        assertEq(usdc.balanceOf(rina), 8_000e6);
        // 15,000 x 83.33% / 8,000
        assertApproxEqAbs(_healthFactor(rina), 1.5624375e18, 1e12);
    }

    function test_borrowBeyondLtvReverts() public {
        vm.startPrank(rina);
        pool.supply(address(nvda), 100e18, rina);
        vm.expectRevert(); // capacity is 15,000 x 66.67% = 10,000.5
        pool.borrow(address(usdc), 10_001e6, rina, 0);
        vm.stopPrank();
    }

    function test_weekendCutReducesBorrowCapacity() public {
        risk.setSessionOverride(DataTypes.Session.Weekend);
        vm.startPrank(rina);
        pool.supply(address(nvda), 100e18, rina);
        vm.expectRevert(); // weekend LTV 56.67% caps at 8,500
        pool.borrow(address(usdc), 9_000e6, rina, 0);
        pool.borrow(address(usdc), 8_500e6, rina, 0);
        vm.stopPrank();
    }

    function test_stalePriceBlocksBorrow() public {
        vm.prank(rina);
        pool.supply(address(nvda), 100e18, rina);
        vm.warp(block.timestamp + 2 hours);
        vm.prank(rina);
        vm.expectRevert(Errors.StalePrice.selector);
        pool.borrow(address(usdc), 1_000e6, rina, 0);
    }

    function test_withdrawBlockedWhenItBreaksBorrowCapacity() public {
        _rinaSuppliesAndBorrows(100e18, 8_000e6, 0);
        vm.prank(rina);
        vm.expectRevert();
        pool.withdraw(address(nvda), 30e18, rina, 0);
    }

    function test_repayFullDebt() public {
        _rinaSuppliesAndBorrows(100e18, 8_000e6, 0);
        vm.warp(block.timestamp + 30 days);
        _setNvdaPrice(NVDA_PRICE);

        (, uint256 debt,) = pool.getUserReserve(rina, address(usdc));
        assertGt(debt, 8_000e6);
        usdc.mint(rina, debt - 8_000e6);

        vm.startPrank(rina);
        usdc.approve(address(pool), type(uint256).max);
        uint256 repaid = pool.repay(address(usdc), type(uint256).max, rina);
        vm.stopPrank();

        assertEq(repaid, debt);
        (, debt,) = pool.getUserReserve(rina, address(usdc));
        assertEq(debt, 0);
    }

    function test_interestAccruesToLendersAndTreasury() public {
        _rinaSuppliesAndBorrows(100e18, 8_000e6, 0);
        vm.warp(block.timestamp + 365 days);

        (uint256 dewiBalance,,) = pool.getUserReserve(dewi, address(usdc));
        (, uint256 rinaDebt,) = pool.getUserReserve(rina, address(usdc));
        uint256 interest = rinaDebt - 8_000e6;
        assertGt(interest, 0);
        // Suppliers get 90% of interest, the treasury keeps the 10% reserve factor.
        assertApproxEqAbs(dewiBalance - 50_000e6, interest * 9 / 10, 2);
    }

    function test_utilizationCapOnStock() public {
        vm.prank(rina);
        pool.supply(address(nvda), 100e18, rina);
        vm.startPrank(budi);
        pool.supply(address(usdc), 20_000e6, budi);
        vm.expectRevert(abi.encodeWithSelector(Errors.UtilizationCapExceeded.selector, address(nvda)));
        pool.borrow(address(nvda), 81e18, budi, 0);
        pool.borrow(address(nvda), 80e18, budi, 0);
        vm.stopPrank();
    }

    function test_shariaLockedStockIsNotLent() public {
        vm.startPrank(rina);
        pool.setLendable(address(nvda), false);
        pool.supply(address(nvda), 100e18, rina);
        vm.stopPrank();
        (uint256 collateral,, bool lendable) = pool.getUserReserve(rina, address(nvda));
        assertEq(collateral, 100e18);
        assertFalse(lendable);

        vm.startPrank(budi);
        pool.supply(address(usdc), 20_000e6, budi);
        vm.expectRevert(abi.encodeWithSelector(Errors.InsufficientLiquidity.selector, address(nvda)));
        pool.borrow(address(nvda), 1e18, budi, 0);
        vm.stopPrank();

        // Locked stock still counts as collateral.
        vm.prank(rina);
        pool.borrow(address(usdc), 8_000e6, rina, 0);
    }

    function test_cannotLockStockThatIsLentOut() public {
        vm.prank(rina);
        pool.supply(address(nvda), 100e18, rina);
        _budiOpensShort(3_800e6, 50e18);

        vm.prank(rina);
        vm.expectRevert(abi.encodeWithSelector(Errors.InsufficientLiquidity.selector, address(nvda)));
        pool.setLendable(address(nvda), false);
    }

    function test_lockedStockEarnsNoFees() public {
        address sari = makeAddr("sari");
        address[] memory accounts = new address[](1);
        accounts[0] = sari;
        allowA.setAllowed(accounts, true);
        nvda.mint(sari, 100e18);

        vm.startPrank(sari);
        nvda.approve(address(pool), type(uint256).max);
        pool.setLendable(address(nvda), false);
        pool.supply(address(nvda), 100e18, sari);
        vm.stopPrank();
        vm.prank(rina);
        pool.supply(address(nvda), 100e18, rina);

        _budiOpensShort(3_800e6, 50e18);
        vm.warp(block.timestamp + 365 days);

        (uint256 sariBalance,,) = pool.getUserReserve(sari, address(nvda));
        (uint256 rinaBalance,,) = pool.getUserReserve(rina, address(nvda));
        assertEq(sariBalance, 100e18);
        assertGt(rinaBalance, 100e18);
    }

    function test_onlyModuleCanBorrowFor() public {
        vm.expectRevert(Errors.OnlyModule.selector);
        pool.borrowFor(rina, address(usdc), 1e6, address(this));
    }

    function test_localDeliveryRejectsNativeFee() public {
        vm.startPrank(rina);
        pool.supply(address(nvda), 10e18, rina);
        vm.expectRevert(Errors.UnexpectedNativeFee.selector);
        pool.withdraw{ value: 1 }(address(nvda), 1e18, rina, 0);
        vm.stopPrank();
    }

    function test_treasuryWithdraw() public {
        _rinaSuppliesAndBorrows(100e18, 8_000e6, 0);
        vm.warp(block.timestamp + 365 days);
        _setNvdaPrice(NVDA_PRICE);
        usdc.mint(rina, 2_000e6);
        vm.startPrank(rina);
        usdc.approve(address(pool), type(uint256).max);
        pool.repay(address(usdc), type(uint256).max, rina);
        vm.stopPrank();

        uint256 accrued = pool.getReserveData(address(usdc)).accruedToTreasury;
        assertGt(accrued, 0);
        pool.withdrawTreasury(address(usdc), treasury, accrued);
        assertEq(usdc.balanceOf(treasury), accrued);
    }
}
