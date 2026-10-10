// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MuaraDeploy } from "./lib/MuaraDeploy.sol";

/// @notice Deploy Allowlist, MockUSDC and the NVDA StockToken on the current chain.
contract DeployTokens is MuaraDeploy {
    function run() external {
        _loadDeployer();
        vm.startBroadcast(deployerKey);
        Tokens memory t = _deployTokens();
        vm.stopBroadcast();
        _writeTokens(t);
    }
}
