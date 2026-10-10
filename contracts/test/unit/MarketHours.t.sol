// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { MarketHours } from "../../src/lib/MarketHours.sol";
import { DataTypes } from "../../src/lib/DataTypes.sol";

contract MarketHoursTest is Test {
    int32 internal constant EST = -5 hours;
    // Monday 2024-01-01 00:00 UTC.
    uint256 internal constant MONDAY = 1_704_067_200;

    function _at(uint256 day, uint256 nyHour, uint256 nyMinute) internal pure returns (uint256) {
        // New York local time to UTC under EST.
        return MONDAY + day * 1 days + nyHour * 1 hours + nyMinute * 1 minutes + 5 hours;
    }

    function _session(uint256 ts) internal pure returns (DataTypes.Session s) {
        (s,) = MarketHours.sessionAt(ts, EST);
    }

    function test_openDuringRegularHours() public pure {
        assertEq(uint8(_session(_at(0, 9, 30))), uint8(DataTypes.Session.Open));
        assertEq(uint8(_session(_at(2, 12, 0))), uint8(DataTypes.Session.Open));
        assertEq(uint8(_session(_at(4, 15, 29))), uint8(DataTypes.Session.Open));
    }

    function test_preCloseInLastHalfHour() public pure {
        (DataTypes.Session s, uint256 elapsed) = MarketHours.sessionAt(_at(1, 15, 45), EST);
        assertEq(uint8(s), uint8(DataTypes.Session.PreClose));
        assertEq(elapsed, 15 minutes);
    }

    function test_closedOvernightOnWeekdays() public pure {
        assertEq(uint8(_session(_at(0, 9, 29))), uint8(DataTypes.Session.Closed));
        assertEq(uint8(_session(_at(0, 16, 0))), uint8(DataTypes.Session.Closed));
        assertEq(uint8(_session(_at(3, 23, 0))), uint8(DataTypes.Session.Closed));
    }

    function test_weekendFromFridayCloseThroughSunday() public pure {
        assertEq(uint8(_session(_at(4, 16, 0))), uint8(DataTypes.Session.Weekend));
        assertEq(uint8(_session(_at(5, 12, 0))), uint8(DataTypes.Session.Weekend));
        assertEq(uint8(_session(_at(6, 23, 59))), uint8(DataTypes.Session.Weekend));
        // Monday before the open is an ordinary closed session.
        assertEq(uint8(_session(_at(7, 8, 0))), uint8(DataTypes.Session.Closed));
    }
}
