// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MuaraDeploy } from "./lib/MuaraDeploy.sol";

/// @notice Full demo reset: fresh hub and seed. Tokens and LayerZero peers stay as they are.
contract RedeployHub is MuaraDeploy {
    function run() external {
        _requireHub();
        _loadDeployer();
        Tokens memory t = _readTokens(block.chainid);
        vm.startBroadcast(deployerKey);
        Hub memory h = _deployHub(t);
        _seed(t, h);
        vm.stopBroadcast();
        _writeHub(t, h);
    }
}
