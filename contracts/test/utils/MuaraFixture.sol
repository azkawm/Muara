// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { TestHelperOz5 } from "@layerzerolabs/test-devtools-evm-foundry/contracts/TestHelperOz5.sol";
import { OptionsBuilder } from "@layerzerolabs/oapp-evm/contracts/oapp/libs/OptionsBuilder.sol";
import { EnforcedOptionParam } from "@layerzerolabs/oapp-evm/contracts/oapp/interfaces/IOAppOptionsType3.sol";
import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";

import { MuaraPool } from "../../src/core/MuaraPool.sol";
import { RiskEngine } from "../../src/modules/RiskEngine.sol";
import { InterestRateModel } from "../../src/modules/InterestRateModel.sol";
import { ShortModule } from "../../src/modules/ShortModule.sol";
import { RewardsModule } from "../../src/modules/RewardsModule.sol";
import { MuaraLens } from "../../src/periphery/MuaraLens.sol";
import { MockPriceOracle } from "../../src/oracle/MockPriceOracle.sol";
import { MockExchange } from "../../src/exchange/MockExchange.sol";
import { MockUSDC } from "../../src/tokens/MockUSDC.sol";
import { StockToken } from "../../src/tokens/StockToken.sol";
import { Allowlist } from "../../src/tokens/Allowlist.sol";
import { IRiskEngine } from "../../src/interfaces/IRiskEngine.sol";
import { IInterestRateModel } from "../../src/interfaces/IInterestRateModel.sol";
import { IMuaraPool } from "../../src/interfaces/IMuaraPool.sol";
import { IMuaraExchange } from "../../src/interfaces/IMuaraExchange.sol";
import { IShortModule } from "../../src/interfaces/IShortModule.sol";
import { DataTypes } from "../../src/lib/DataTypes.sol";

/// @notice Full Muara deployment across two simulated LayerZero endpoints.
///         Hub (Base) is eid A, spoke (Arbitrum) is eid B.
abstract contract MuaraFixture is TestHelperOz5 {
    using OptionsBuilder for bytes;

    uint32 internal constant A = 1;
    uint32 internal constant B = 2;
    uint128 internal constant USDC_RECEIVE_GAS = 80_000;
    uint128 internal constant STOCK_RECEIVE_GAS = 150_000;

    uint256 internal constant NVDA_PRICE = 150e18;

    // Hub
    MuaraPool internal pool;
    RiskEngine internal risk;
    InterestRateModel internal rates;
    ShortModule internal shorts;
    RewardsModule internal rewards;
    MuaraLens internal lens;
    MockPriceOracle internal oracle;
    MockExchange internal exchange;
    Allowlist internal allowA;
    MockUSDC internal usdc;
    StockToken internal nvda;

    // Spoke
    Allowlist internal allowB;
    MockUSDC internal usdcB;
    StockToken internal nvdaB;

    address internal rina = makeAddr("rina");
    address internal budi = makeAddr("budi");
    address internal dewi = makeAddr("dewi");
    address internal keeper = makeAddr("keeper");
    address internal treasury = makeAddr("treasury");

    function setUp() public virtual override {
        super.setUp();
        setUpEndpoints(2, LibraryType.UltraLightNode);
        vm.warp(1_704_121_200); // Monday 2024-01-01 10:00 New York, market open

        _deployTokens();
        _deployHub();
        _configure();
        _fund();
    }

    function _deployTokens() internal {
        allowA = new Allowlist(address(this));
        allowB = new Allowlist(address(this));
        usdc = new MockUSDC(address(endpoints[A]), address(this));
        usdcB = new MockUSDC(address(endpoints[B]), address(this));
        nvda = new StockToken("NVIDIA Tokenized Stock", "NVDA", address(endpoints[A]), allowA, address(this));
        nvdaB = new StockToken("NVIDIA Tokenized Stock", "NVDA", address(endpoints[B]), allowB, address(this));

        address[] memory pair = new address[](2);
        pair[0] = address(usdc);
        pair[1] = address(usdcB);
        wireOApps(pair);
        pair[0] = address(nvda);
        pair[1] = address(nvdaB);
        wireOApps(pair);

        _enforceOptions(OFT(address(usdc)), B, USDC_RECEIVE_GAS);
        _enforceOptions(OFT(address(usdcB)), A, USDC_RECEIVE_GAS);
        _enforceOptions(OFT(address(nvda)), B, STOCK_RECEIVE_GAS);
        _enforceOptions(OFT(address(nvdaB)), A, STOCK_RECEIVE_GAS);
    }

    function _deployHub() internal {
        oracle = new MockPriceOracle(address(this));
        risk = new RiskEngine(oracle, -5 hours, address(this));
        rates = new InterestRateModel(address(this));
        pool = new MuaraPool(risk, rates, A, address(this));
        exchange = new MockExchange(oracle, address(usdc), 30, address(this));
        shorts = new ShortModule(IMuaraPool(address(pool)), IMuaraExchange(address(exchange)));
        rewards = new RewardsModule(IMuaraPool(address(pool)), IMuaraExchange(address(exchange)));
        lens =
            new MuaraLens(IMuaraPool(address(pool)), IShortModule(address(shorts)), IMuaraExchange(address(exchange)));
    }

    function _configure() internal {
        oracle.setPrice(address(usdc), 1e18);
        oracle.setPrice(address(nvda), NVDA_PRICE);

        risk.setRiskConfig(address(usdc), usdcRisk());
        risk.setRiskConfig(address(nvda), nvdaRisk());

        rates.setRateParams(
            address(usdc),
            IInterestRateModel.RateParams({ baseRate: 0, slope1: 0.06e27, slope2: 0.8e27, optimalUtilization: 0.85e27 })
        );
        rates.setRateParams(
            address(nvda),
            IInterestRateModel.RateParams({
                baseRate: 0.01e27, slope1: 0.04e27, slope2: 0.6e27, optimalUtilization: 0.7e27
            })
        );

        pool.initReserve(address(usdc), false, true, 1_000);
        pool.initReserve(address(nvda), true, true, 1_000);
        pool.setModule(address(shorts), true);
        pool.setModule(address(rewards), true);

        address[] memory hub = new address[](9);
        hub[0] = address(pool);
        hub[1] = address(exchange);
        hub[2] = address(shorts);
        hub[3] = rina;
        hub[4] = budi;
        hub[5] = keeper;
        hub[6] = address(this);
        hub[7] = treasury;
        hub[8] = address(rewards);
        allowA.setAllowed(hub, true);

        address[] memory spoke = new address[](2);
        spoke[0] = rina;
        spoke[1] = budi;
        allowB.setAllowed(spoke, true);
    }

    function _fund() internal {
        usdc.mint(address(exchange), 1_000_000e6);
        nvda.mint(address(exchange), 10_000e18);

        usdc.mint(dewi, 50_000e6);
        vm.startPrank(dewi);
        usdc.approve(address(pool), type(uint256).max);
        pool.supply(address(usdc), 50_000e6, dewi);
        vm.stopPrank();

        nvda.mint(rina, 100e18);
        usdc.mint(budi, 20_000e6);
        usdc.mint(keeper, 100_000e6);
        vm.deal(rina, 10 ether);
        vm.deal(budi, 10 ether);

        vm.prank(rina);
        nvda.approve(address(pool), type(uint256).max);
        vm.prank(budi);
        usdc.approve(address(shorts), type(uint256).max);
        vm.prank(budi);
        usdc.approve(address(pool), type(uint256).max);
        vm.prank(keeper);
        usdc.approve(address(pool), type(uint256).max);
    }

    function usdcRisk() internal pure returns (IRiskEngine.RiskConfig memory c) {
        c.ltvBps = 6_667;
        c.liquidationThresholdBps = 8_333;
        c.liquidationBonusBps = 500;
        c.closeFactorBps = 5_000;
        c.maxUtilizationBps = 9_500;
    }

    function nvdaRisk() internal pure returns (IRiskEngine.RiskConfig memory c) {
        c.marketHours = true;
        c.ltvBps = 6_667;
        c.liquidationThresholdBps = 8_333;
        c.liquidationBonusBps = 500;
        c.closeFactorBps = 5_000;
        c.maxUtilizationBps = 8_000;
        c.maxPriceAge = 1 hours;
        c.preCloseLtvCutBps = 500;
        c.closedLtvCutBps = 500;
        c.weekendLtvCutBps = 1_000;
        c.closedLtCutBps = 0;
        c.weekendLtCutBps = 300;
    }

    // ---------------------------------------------------------------- helpers

    function _enforceOptions(OFT oft, uint32 dstEid, uint128 gas) internal {
        EnforcedOptionParam[] memory params = new EnforcedOptionParam[](1);
        params[0] = EnforcedOptionParam(dstEid, 1, OptionsBuilder.newOptions().addExecutorLzReceiveOption(gas, 0));
        oft.setEnforcedOptions(params);
    }

    function _setNvdaPrice(uint256 price) internal {
        oracle.setPrice(address(nvda), price);
    }

    function _rinaSuppliesAndBorrows(uint256 nvdaAmount, uint256 usdcAmount, uint32 dstEid) internal {
        vm.startPrank(rina);
        pool.supply(address(nvda), nvdaAmount, rina);
        uint256 fee = pool.quoteDelivery(address(usdc), usdcAmount, dstEid, rina);
        pool.borrow{ value: fee }(address(usdc), usdcAmount, rina, dstEid);
        vm.stopPrank();
    }

    function _budiOpensShort(uint256 usdcIn, uint256 nvdaAmount) internal returns (uint256 proceeds) {
        vm.prank(budi);
        proceeds = shorts.openShort(address(nvda), usdcIn, nvdaAmount, 0);
    }

    function _healthFactor(address user) internal view returns (uint256) {
        return pool.getAccountData(user).healthFactor;
    }

    function _session() internal view returns (DataTypes.Session) {
        return risk.currentSession();
    }
}
