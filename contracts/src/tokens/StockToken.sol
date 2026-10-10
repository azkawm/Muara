// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import {
    SendParam,
    MessagingFee,
    MessagingReceipt,
    OFTReceipt
} from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import { IAllowlist } from "../interfaces/IAllowlist.sol";
import { Errors } from "../lib/Errors.sol";

/// @title StockToken
/// @notice Tokenized stock as a native LayerZero OFT with a holder allowlist.
/// @dev Every transfer, mint (including cross-chain credit) and burn checks both parties.
///      `_send` also checks the remote recipient against the local mirror of the allowlist
///      so a message is never sent that the destination would refuse.
contract StockToken is OFT {
    uint256 public constant FAUCET_CAP = 1_000e18;

    IAllowlist public immutable allowlist;

    constructor(string memory name_, string memory symbol_, address lzEndpoint, IAllowlist allowlist_, address owner_)
        OFT(name_, symbol_, lzEndpoint, owner_)
        Ownable(owner_)
    {
        if (address(allowlist_) == address(0)) revert Errors.ZeroAddress();
        allowlist = allowlist_;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Testnet faucet for allowlisted accounts, capped per call.
    function faucet(uint256 amount) external {
        if (amount > FAUCET_CAP) revert Errors.InvalidParams();
        _mint(msg.sender, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && !allowlist.isAllowed(from)) revert Errors.NotAllowlisted(from);
        if (to != address(0) && !allowlist.isAllowed(to)) revert Errors.NotAllowlisted(to);
        super._update(from, to, value);
    }

    function _send(SendParam calldata sendParam, MessagingFee calldata fee, address refundAddress)
        internal
        override
        returns (MessagingReceipt memory, OFTReceipt memory)
    {
        address recipient = address(uint160(uint256(sendParam.to)));
        if (!allowlist.isAllowed(recipient)) revert Errors.NotAllowlisted(recipient);
        return super._send(sendParam, fee, refundAddress);
    }
}
