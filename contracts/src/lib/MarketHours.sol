// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { DataTypes } from "./DataTypes.sol";

/// @title MarketHours
/// @notice NYSE regular session from a timestamp. Holidays are not modelled; the risk engine
///         exposes an admin override for those and for the demo.
library MarketHours {
    uint256 internal constant DAY = 1 days;
    uint256 internal constant OPEN = 9 hours + 30 minutes;
    uint256 internal constant CLOSE = 16 hours;
    uint256 internal constant PRE_CLOSE_WINDOW = 30 minutes;
    uint256 internal constant PRE_CLOSE = CLOSE - PRE_CLOSE_WINDOW;

    /// @param timestamp Unix time.
    /// @param utcOffset New York offset from UTC in seconds (-14400 for EDT, -18000 for EST).
    /// @return session Current session.
    /// @return preCloseElapsed Seconds elapsed in the pre-close window (0 outside it).
    function sessionAt(uint256 timestamp, int32 utcOffset)
        internal
        pure
        returns (DataTypes.Session session, uint256 preCloseElapsed)
    {
        // Timestamps fit in int256 and stay positive after a +/-14h offset.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 local = uint256(int256(timestamp) + int256(utcOffset));
        // 1970-01-01 was a Thursday, so (days + 4) % 7 maps 0 to Sunday.
        uint256 dayOfWeek = (local / DAY + 4) % 7;
        uint256 secondOfDay = local % DAY;

        if (dayOfWeek == 0 || dayOfWeek == 6 || (dayOfWeek == 5 && secondOfDay >= CLOSE)) {
            return (DataTypes.Session.Weekend, 0);
        }
        if (secondOfDay < OPEN || secondOfDay >= CLOSE) return (DataTypes.Session.Closed, 0);
        if (secondOfDay >= PRE_CLOSE) return (DataTypes.Session.PreClose, secondOfDay - PRE_CLOSE);
        return (DataTypes.Session.Open, 0);
    }
}
