// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test, console } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MuaraFixture } from "../utils/MuaraFixture.sol";
import { MuaraPool } from "../../src/core/MuaraPool.sol";
import { MockPriceOracle } from "../../src/oracle/MockPriceOracle.sol";
import { MockUSDC } from "../../src/tokens/MockUSDC.sol";
import { StockToken } from "../../src/tokens/StockToken.sol";
import { DataTypes } from "../../src/lib/DataTypes.sol";

/// @notice Drives random supply, withdraw, borrow, repay, sharia toggles, time and price moves.
contract PoolHandler is Test {
    MuaraPool internal pool;
    MockPriceOracle internal oracle;
    MockUSDC internal usdc;
    StockToken internal nvda;
    address[] internal actors;

    uint256 public borrows;
    uint256 public repays;

    constructor(MuaraPool pool_, MockPriceOracle oracle_, MockUSDC usdc_, StockToken nvda_, address[] memory actors_) {
        pool = pool_;
        oracle = oracle_;
        usdc = usdc_;
        nvda = nvda_;
        actors = actors_;
        for (uint256 i; i < actors.length; ++i) {
            vm.startPrank(actors[i]);
            usdc.approve(address(pool), type(uint256).max);
            nvda.approve(address(pool), type(uint256).max);
            vm.stopPrank();
        }
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _asset(uint256 seed) internal view returns (address) {
        return seed % 2 == 0 ? address(usdc) : address(nvda);
    }

    function _mint(address asset, address to, uint256 amount) internal {
        if (asset == address(usdc)) usdc.mint(to, amount);
        else nvda.mint(to, amount);
    }

    function _unit(address asset) internal view returns (uint256) {
        return asset == address(usdc) ? 1e6 : 1e18;
    }

    function supply(uint256 actorSeed, uint256 assetSeed, uint256 amount) external {
        address actor = _actor(actorSeed);
        address asset = _asset(assetSeed);
        amount = bound(amount, 1, 10_000 * _unit(asset));
        _mint(asset, actor, amount);
        vm.prank(actor);
        pool.supply(asset, amount, actor);
    }

    function withdraw(uint256 actorSeed, uint256 assetSeed, uint256 amount) external {
        address actor = _actor(actorSeed);
        address asset = _asset(assetSeed);
        amount = bound(amount, 1, 10_000 * _unit(asset));
        vm.prank(actor);
        try pool.withdraw(asset, amount, actor, 0) { } catch { }
    }

    function borrow(uint256 actorSeed, uint256 assetSeed, uint256 amount) external {
        address actor = _actor(actorSeed);
        address asset = _asset(assetSeed);
        // Size the borrow to the actor's remaining capacity and the pool's idle cash.
        DataTypes.AccountData memory data = pool.getAccountData(actor);
        if (data.borrowCapacity <= data.debtValue) return;
        (uint256 price,) = oracle.getPrice(asset);
        uint256 room = (data.borrowCapacity - data.debtValue) * _unit(asset) / price;
        uint256 cash = pool.availableLiquidity(asset);
        if (cash < room) room = cash;
        if (room < 2) return;
        amount = bound(amount, 1, room - 1);
        vm.prank(actor);
        try pool.borrow(asset, amount, actor, 0) {
            ++borrows;
        } catch { }
    }

    function repay(uint256 actorSeed, uint256 assetSeed, uint256 amount) external {
        address actor = _actor(actorSeed);
        address asset = _asset(assetSeed);
        amount = bound(amount, 1, 5_000 * _unit(asset));
        _mint(asset, actor, amount);
        vm.prank(actor);
        try pool.repay(asset, amount, actor) {
            ++repays;
        } catch { }
    }

    function claim(uint256 actorSeed, uint256 assetSeed) external {
        address actor = _actor(actorSeed);
        vm.prank(actor);
        try pool.claimRewards(_asset(assetSeed), actor, 0) { } catch { }
    }

    function toggleLendable(uint256 actorSeed, bool lendable) external {
        vm.prank(_actor(actorSeed));
        try pool.setLendable(address(nvda), lendable) { } catch { }
    }

    function passTime(uint256 seconds_, uint256 price) external {
        vm.warp(block.timestamp + bound(seconds_, 1, 3 days));
        oracle.setPrice(address(nvda), bound(price, 50e18, 400e18));
    }
}

/// @notice The pool must always hold enough tokens, plus outstanding debt, to cover every
///         supplier claim, locked stock and the treasury.
contract SolvencyInvariantTest is MuaraFixture {
    PoolHandler internal handler;

    function setUp() public override {
        super.setUp();
        address[] memory actors = new address[](3);
        actors[0] = rina;
        actors[1] = budi;
        actors[2] = keeper;

        // The handler mints test tokens, so it needs ownership of both.
        handler = new PoolHandler(pool, oracle, usdc, nvda, actors);
        usdc.transferOwnership(address(handler));
        nvda.transferOwnership(address(handler));
        oracle.setUpdater(address(handler), true);

        targetContract(address(handler));
    }

    function invariant_solvent() public view {
        _assertSolvent(address(usdc));
        _assertSolvent(address(nvda));
    }

    function _assertSolvent(address asset) internal view {
        (uint256 supplied,, uint256 borrowed) = pool.getReserveTotals(asset);
        uint256 treasuryOwed = pool.getReserveData(asset).accruedToTreasury;
        uint256 assets = IERC20(asset).balanceOf(address(pool)) + borrowed;
        // A few wei of rounding per operation, always in the pool's favour or within dust.
        assertGe(assets + 1_000, supplied + treasuryOwed, "pool insolvent");
    }

    function afterInvariant() public view {
        console.log("successful borrows", handler.borrows(), "repays", handler.repays());
    }

    function invariant_lockedStockBackedByCash() public view {
        uint256 locked = pool.getReserveData(address(nvda)).totalLocked;
        assertGe(nvda.balanceOf(address(pool)), locked, "locked stock lent out");
    }
}
