// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { InterestRateModel } from "../../src/modules/InterestRateModel.sol";
import { IInterestRateModel } from "../../src/interfaces/IInterestRateModel.sol";
import { Errors } from "../../src/lib/Errors.sol";

contract InterestRateModelTest is Test {
    InterestRateModel internal model;
    address internal constant ASSET = address(0x1);

    function setUp() public {
        model = new InterestRateModel(address(this));
        model.setRateParams(
            ASSET,
            IInterestRateModel.RateParams({
                baseRate: 0.01e27, slope1: 0.04e27, slope2: 0.6e27, optimalUtilization: 0.7e27
            })
        );
    }

    function test_kinkedCurve() public view {
        assertEq(model.getBorrowRate(ASSET, 0), 0.01e27);
        assertEq(model.getBorrowRate(ASSET, 0.35e27), 0.03e27);
        assertEq(model.getBorrowRate(ASSET, 0.7e27), 0.05e27);
        assertEq(model.getBorrowRate(ASSET, 0.85e27), 0.35e27);
        assertEq(model.getBorrowRate(ASSET, 1e27), 0.65e27);
    }

    function test_utilizationAboveOneIsCapped() public view {
        assertEq(model.getBorrowRate(ASSET, 2e27), 0.65e27);
    }

    function testFuzz_monotonic(uint256 a, uint256 b) public view {
        a = bound(a, 0, 1e27);
        b = bound(b, a, 1e27);
        assertLe(model.getBorrowRate(ASSET, a), model.getBorrowRate(ASSET, b));
    }

    function test_rejectsInvalidKink() public {
        vm.expectRevert(Errors.InvalidParams.selector);
        model.setRateParams(ASSET, IInterestRateModel.RateParams(0, 0, 0, 1e27));
    }
}
