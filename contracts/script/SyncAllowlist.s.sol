// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MuaraDeploy } from "./lib/MuaraDeploy.sol";
import { Allowlist } from "../src/tokens/Allowlist.sol";

/// @notice Allowlist the demo wallets on the current chain. Run on both chains so the hub's
///         mirror matches what the spoke accepts.
contract SyncAllowlist is MuaraDeploy {
    function run() external {
        _loadDeployer();
        Tokens memory t = _readTokens(block.chainid);

        address[] memory accounts = new address[](4);
        accounts[0] = vm.envAddress("RINA_ADDRESS");
        accounts[1] = vm.envAddress("BUDI_ADDRESS");
        accounts[2] = vm.envAddress("KEEPER_ADDRESS");
        accounts[3] = deployer;

        vm.startBroadcast(deployerKey);
        Allowlist(t.allowlist).setAllowed(accounts, true);
        vm.stopBroadcast();
    }
}
