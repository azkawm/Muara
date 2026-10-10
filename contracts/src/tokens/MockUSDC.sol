// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import { Errors } from "../lib/Errors.sol";

/// @title MockUSDC
/// @notice Testnet USDC as a native LayerZero OFT (burn on source, mint on destination).
/// @dev Mainnet uses Circle's USDC with CCTP instead.
contract MockUSDC is OFT {
    uint256 public constant FAUCET_CAP = 100_000e6;

    constructor(address lzEndpoint, address owner_)
        OFT("Muara USD Coin", "USDC", lzEndpoint, owner_)
        Ownable(owner_)
    { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Testnet faucet, capped per call.
    function faucet(uint256 amount) external {
        if (amount > FAUCET_CAP) revert Errors.InvalidParams();
        _mint(msg.sender, amount);
    }
}
