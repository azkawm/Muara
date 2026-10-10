// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MuaraDeploy } from "./lib/MuaraDeploy.sol";

/// @notice Fund the exchange, demo wallets and USDC liquidity, and open the background positions that build Rina's rewards.
contract Seed is MuaraDeploy {
    function run() external {
        _requireHub();
        _loadDeployer();
        Tokens memory t = _readTokens(block.chainid);
        Hub memory h = _readHub();
        vm.startBroadcast(deployerKey);
        _seed(t, h);
        vm.stopBroadcast();
    }
}
