// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script } from "forge-std/Script.sol";
import { stdJson } from "forge-std/StdJson.sol";
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
import { IMuaraPool } from "../../src/interfaces/IMuaraPool.sol";
import { IMuaraExchange } from "../../src/interfaces/IMuaraExchange.sol";
import { IShortModule } from "../../src/interfaces/IShortModule.sol";
import { DemoConfig } from "./DemoConfig.sol";

/// @notice Shared deployment steps and the deployments JSON read by the TypeScript packages.
/// @dev Files live in packages/shared/deployments/<chain>.json with a `tokens` section on
///      both chains and a `hub` section on Base.
abstract contract MuaraDeploy is Script {
    using stdJson for string;
    using OptionsBuilder for bytes;

    struct Tokens {
        address allowlist;
        address usdc;
        address nvda;
    }

    struct Hub {
        address oracle;
        address riskEngine;
        address rateModel;
        address pool;
        address exchange;
        address shortModule;
        address rewardsModule;
        address lens;
    }

    uint256 internal deployerKey;
    address internal deployer;

    function _loadDeployer() internal {
        deployerKey = vm.envUint("PRIVATE_KEY");
        deployer = vm.addr(deployerKey);
        require(deployer == vm.envAddress("ADDRESS"), "ADDRESS does not match PRIVATE_KEY");
    }

    // ---------------------------------------------------------------- chain info

    function _chainName(uint256 chainId) internal pure returns (string memory) {
        if (chainId == DemoConfig.BASE_SEPOLIA) return "base-sepolia";
        if (chainId == DemoConfig.ARBITRUM_SEPOLIA) return "arbitrum-sepolia";
        revert("unsupported chain");
    }

    function _eid(uint256 chainId) internal pure returns (uint32) {
        return chainId == DemoConfig.BASE_SEPOLIA ? DemoConfig.BASE_EID : DemoConfig.ARBITRUM_EID;
    }

    function _remoteChain(uint256 chainId) internal pure returns (uint256) {
        return chainId == DemoConfig.BASE_SEPOLIA ? DemoConfig.ARBITRUM_SEPOLIA : DemoConfig.BASE_SEPOLIA;
    }

    function _requireHub() internal view {
        require(block.chainid == DemoConfig.BASE_SEPOLIA, "hub lives on Base Sepolia");
    }

    // ---------------------------------------------------------------- deployments JSON

    function _path(uint256 chainId) internal view returns (string memory) {
        return string.concat(vm.projectRoot(), "/../packages/shared/deployments/", _chainName(chainId), ".json");
    }

    function _readTokens(uint256 chainId) internal view returns (Tokens memory t) {
        string memory json = vm.readFile(_path(chainId));
        t.allowlist = json.readAddress(".tokens.allowlist");
        t.usdc = json.readAddress(".tokens.usdc");
        t.nvda = json.readAddress(".tokens.nvda");
    }

    function _readHub() internal view returns (Hub memory h) {
        string memory json = vm.readFile(_path(DemoConfig.BASE_SEPOLIA));
        h.oracle = json.readAddress(".hub.oracle");
        h.riskEngine = json.readAddress(".hub.riskEngine");
        h.rateModel = json.readAddress(".hub.rateModel");
        h.pool = json.readAddress(".hub.pool");
        h.exchange = json.readAddress(".hub.exchange");
        h.shortModule = json.readAddress(".hub.shortModule");
        h.rewardsModule = json.readAddress(".hub.rewardsModule");
        h.lens = json.readAddress(".hub.lens");
    }

    function _writeTokens(Tokens memory t) internal {
        vm.serializeUint("root", "chainId", block.chainid);
        vm.serializeUint("root", "eid", _eid(block.chainid));
        string memory json = vm.serializeString("root", "tokens", _tokensJson(t));
        vm.writeJson(json, _path(block.chainid));
    }

    function _writeHub(Tokens memory t, Hub memory h) internal {
        vm.serializeAddress("hub", "oracle", h.oracle);
        vm.serializeAddress("hub", "riskEngine", h.riskEngine);
        vm.serializeAddress("hub", "rateModel", h.rateModel);
        vm.serializeAddress("hub", "pool", h.pool);
        vm.serializeAddress("hub", "exchange", h.exchange);
        vm.serializeAddress("hub", "shortModule", h.shortModule);
        vm.serializeAddress("hub", "rewardsModule", h.rewardsModule);
        vm.serializeUint("hub", "deployedAtBlock", block.number);
        string memory hubJson = vm.serializeAddress("hub", "lens", h.lens);

        vm.serializeUint("root", "chainId", block.chainid);
        vm.serializeUint("root", "eid", _eid(block.chainid));
        vm.serializeString("root", "tokens", _tokensJson(t));
        string memory json = vm.serializeString("root", "hub", hubJson);
        vm.writeJson(json, _path(block.chainid));
    }

    function _tokensJson(Tokens memory t) private returns (string memory) {
        vm.serializeAddress("tokens", "allowlist", t.allowlist);
        vm.serializeAddress("tokens", "usdc", t.usdc);
        return vm.serializeAddress("tokens", "nvda", t.nvda);
    }

    // ---------------------------------------------------------------- steps

    /// @dev Call inside a broadcast.
    function _deployTokens() internal returns (Tokens memory t) {
        Allowlist allowlist = new Allowlist(deployer);
        t.allowlist = address(allowlist);
        t.usdc = address(new MockUSDC(DemoConfig.LZ_ENDPOINT, deployer));
        t.nvda = address(new StockToken("NVIDIA Tokenized Stock", "NVDA", DemoConfig.LZ_ENDPOINT, allowlist, deployer));
    }

    /// @dev Call inside a broadcast, once per chain after both token sets exist.
    function _wire(Tokens memory local, Tokens memory remote, uint32 remoteEid) internal {
        OFT(local.usdc).setPeer(remoteEid, bytes32(uint256(uint160(remote.usdc))));
        OFT(local.nvda).setPeer(remoteEid, bytes32(uint256(uint160(remote.nvda))));
        _enforce(OFT(local.usdc), remoteEid, DemoConfig.USDC_RECEIVE_GAS);
        _enforce(OFT(local.nvda), remoteEid, DemoConfig.STOCK_RECEIVE_GAS);
    }

    function _enforce(OFT oft, uint32 dstEid, uint128 gas) private {
        EnforcedOptionParam[] memory params = new EnforcedOptionParam[](1);
        params[0] = EnforcedOptionParam(dstEid, 1, OptionsBuilder.newOptions().addExecutorLzReceiveOption(gas, 0));
        oft.setEnforcedOptions(params);
    }

    /// @dev Call inside a broadcast on Base. Tokens stay fixed across hub redeploys.
    function _deployHub(Tokens memory t) internal returns (Hub memory h) {
        MockPriceOracle oracle = new MockPriceOracle(deployer);
        RiskEngine risk = new RiskEngine(oracle, DemoConfig.NEW_YORK_EDT, deployer);
        InterestRateModel rates = new InterestRateModel(deployer);
        MuaraPool pool = new MuaraPool(risk, rates, DemoConfig.BASE_EID, deployer);
        MockExchange exchange = new MockExchange(oracle, t.usdc, DemoConfig.EXCHANGE_FEE_BPS, deployer);
        ShortModule shorts = new ShortModule(IMuaraPool(address(pool)), IMuaraExchange(address(exchange)));
        RewardsModule rewards = new RewardsModule(IMuaraPool(address(pool)), IMuaraExchange(address(exchange)));
        MuaraLens lens =
            new MuaraLens(IMuaraPool(address(pool)), IShortModule(address(shorts)), IMuaraExchange(address(exchange)));

        oracle.setPrice(t.usdc, DemoConfig.USDC_PRICE);
        oracle.setPrice(t.nvda, DemoConfig.NVDA_PRICE);
        address updater = vm.envOr("PRICE_UPDATER_ADDRESS", address(0));
        if (updater != address(0)) oracle.setUpdater(updater, true);

        risk.setRiskConfig(t.usdc, DemoConfig.usdcRisk());
        risk.setRiskConfig(t.nvda, DemoConfig.stockRisk());
        rates.setRateParams(t.usdc, DemoConfig.usdcRates());
        rates.setRateParams(t.nvda, DemoConfig.stockRates());

        pool.initReserve(t.usdc, false, true, DemoConfig.RESERVE_FACTOR_BPS);
        pool.initReserve(t.nvda, true, true, DemoConfig.RESERVE_FACTOR_BPS);
        pool.setModule(address(shorts), true);
        pool.setModule(address(rewards), true);

        address[] memory holders = new address[](5);
        holders[0] = address(pool);
        holders[1] = address(exchange);
        holders[2] = address(shorts);
        holders[3] = address(rewards);
        holders[4] = deployer;
        Allowlist(t.allowlist).setAllowed(holders, true);

        h = Hub({
            oracle: address(oracle),
            riskEngine: address(risk),
            rateModel: address(rates),
            pool: address(pool),
            exchange: address(exchange),
            shortModule: address(shorts),
            rewardsModule: address(rewards),
            lens: address(lens)
        });
    }

    /// @dev Call inside a broadcast on Base. The deployer acts as USDC liquidity provider and as
    ///      a background short seller whose borrow fees build up Rina's claimable rewards.
    function _seed(Tokens memory t, Hub memory h) internal {
        address rina = vm.envAddress("RINA_ADDRESS");
        address budi = vm.envAddress("BUDI_ADDRESS");
        address keeper = vm.envAddress("KEEPER_ADDRESS");

        address[] memory holders = new address[](3);
        holders[0] = rina;
        holders[1] = budi;
        holders[2] = keeper;
        Allowlist(t.allowlist).setAllowed(holders, true);

        MockUSDC usdc = MockUSDC(t.usdc);
        StockToken nvda = StockToken(t.nvda);
        MuaraPool pool = MuaraPool(h.pool);

        // Exchange liquidity.
        usdc.mint(h.exchange, DemoConfig.EXCHANGE_USDC);
        nvda.mint(h.exchange, DemoConfig.EXCHANGE_NVDA);

        // Demo wallets.
        nvda.mint(rina, DemoConfig.RINA_WALLET_NVDA);
        usdc.mint(budi, DemoConfig.BUDI_WALLET_USDC);
        usdc.mint(keeper, DemoConfig.KEEPER_USDC);
        nvda.mint(keeper, DemoConfig.KEEPER_NVDA);

        // USDC liquidity so borrows and short closes always have cash.
        usdc.mint(deployer, DemoConfig.LP_USDC + DemoConfig.BACKGROUND_SHORT_USDC);
        usdc.approve(h.pool, type(uint256).max);
        pool.supply(t.usdc, DemoConfig.LP_USDC, deployer);

        // Rina's earlier lendable position, credited to her so rewards accrue before the demo.
        nvda.mint(deployer, DemoConfig.RINA_EARLY_NVDA);
        nvda.approve(h.pool, type(uint256).max);
        pool.supply(t.nvda, DemoConfig.RINA_EARLY_NVDA, rina);

        // Background short paying borrow fees to Rina.
        usdc.approve(h.shortModule, type(uint256).max);
        ShortModule(h.shortModule)
            .openShort(t.nvda, DemoConfig.BACKGROUND_SHORT_USDC, DemoConfig.BACKGROUND_SHORT_NVDA, 0);

        uint256 gas = vm.envOr("SEED_GAS_WEI", uint256(0));
        if (gas != 0) {
            payable(rina).transfer(gas);
            payable(budi).transfer(gas);
            payable(keeper).transfer(gas);
        }
    }
}
