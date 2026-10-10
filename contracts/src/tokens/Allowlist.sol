// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IAllowlist } from "../interfaces/IAllowlist.sol";

/// @title Allowlist
/// @notice Accounts permitted to hold stock tokens. One per chain, kept in sync by
///         `scripts/sync-allowlist` so the source chain can reject recipients the
///         destination would refuse.
contract Allowlist is IAllowlist, Ownable {
    mapping(address account => bool) internal _allowed;

    constructor(address owner_) Ownable(owner_) { }

    function isAllowed(address account) external view returns (bool) {
        return _allowed[account];
    }

    function setAllowed(address[] calldata accounts, bool allowed) external onlyOwner {
        for (uint256 i; i < accounts.length; ++i) {
            _allowed[accounts[i]] = allowed;
            emit AllowedSet(accounts[i], allowed);
        }
    }
}
