// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MuaraDeploy } from "./lib/MuaraDeploy.sol";

/// @notice Peer the OFTs with the other chain and set enforced receive gas. Run on both chains.
contract WireLayerZero is MuaraDeploy {
    function run() external {
        _loadDeployer();
        uint256 remote = _remoteChain(block.chainid);
        Tokens memory local = _readTokens(block.chainid);
        Tokens memory other = _readTokens(remote);
        vm.startBroadcast(deployerKey);
        _wire(local, other, _eid(remote));
        vm.stopBroadcast();
    }
}
