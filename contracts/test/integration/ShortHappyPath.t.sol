// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MuaraFixture } from "../utils/MuaraFixture.sol";
import { IMuaraLens } from "../../src/interfaces/IMuaraLens.sol";
import { DataTypes } from "../../src/lib/DataTypes.sol";

/// @notice The short tab exactly as a fresh wallet clicks through it on testnet:
///         faucet, approve, open with a slippage bound, watch P&L, close, withdraw to Arbitrum.
/// @dev Runs during the NYSE closed session (daytime in Jakarta) to match the demo.
contract ShortHappyPathTest is MuaraFixture {
    address internal andi = makeAddr("andi");

    function setUp() public override {
        super.setUp();
        vm.prank(rina);
        pool.supply(address(nvda), 100e18, rina);
        vm.deal(andi, 1 ether);

        vm.warp(block.timestamp + 12 hours); // Monday 22:00 New York
        _setNvdaPrice(NVDA_PRICE);
    }

    function test_happyPath() public {
        assertEq(uint8(_session()), uint8(DataTypes.Session.Closed));
        // The short seller never holds stock, so no allowlist entry is needed.
        assertFalse(allowA.isAllowed(andi));

        // 1. Faucet and approve.
        vm.startPrank(andi);
        usdc.faucet(3_800e6);
        usdc.approve(address(shorts), type(uint256).max);

        // 2. Open with a 1% slippage bound from the exchange quote.
        uint256 quote = exchange.quoteSell(address(nvda), 50e18);
        uint256 proceeds = shorts.openShort(address(nvda), 3_800e6, 50e18, quote * 99 / 100);
        vm.stopPrank();
        assertEq(proceeds, quote);
        assertGt(pool.getAccountData(andi).healthFactor, 1.2e18);

        // 3. Price steps down as the scenario runner would drive it.
        for (uint256 p = 145; p >= 120; p -= 5) {
            vm.warp(block.timestamp + 3);
            _setNvdaPrice(p * 1e18);
        }
        IMuaraLens.ShortView memory live = lens.getShort(andi, address(nvda));
        assertGt(live.pnl, 1_400e6);

        // 4. Close with a 1% slippage bound on the buyback.
        vm.startPrank(andi);
        uint256 maxIn = live.buybackCost * 101 / 100;
        shorts.closeShort(address(nvda), type(uint256).max, maxIn);

        // 5. Withdraw everything to Arbitrum.
        (uint256 balance,,) = pool.getUserReserve(andi, address(usdc));
        uint256 fee = pool.quoteDelivery(address(usdc), balance, B, andi);
        pool.withdraw{ value: fee }(address(usdc), type(uint256).max, andi, B);
        vm.stopPrank();

        verifyPackets(B, address(usdcB));
        assertEq(usdcB.balanceOf(andi), balance);
        assertGt(balance, 3_800e6 + 1_400e6);
        (uint256 collateral, uint256 debt,) = pool.getUserReserve(andi, address(nvda));
        assertEq(collateral + debt, 0);
    }
}
