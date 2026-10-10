// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MuaraDeploy } from "./lib/MuaraDeploy.sol";

/// @notice Deploy and configure the lending hub on Base Sepolia against the existing tokens.
contract DeployHub is MuaraDeploy {
    function run() external {
        _requireHub();
        _loadDeployer();
        Tokens memory t = _readTokens(block.chainid);
        vm.startBroadcast(deployerKey);
        Hub memory h = _deployHub(t);
        vm.stopBroadcast();
        _writeHub(t, h);
    }
}
