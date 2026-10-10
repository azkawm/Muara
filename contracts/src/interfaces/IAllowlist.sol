// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IAllowlist
/// @notice Holder allowlist for stock tokens, mirrored on every chain.
interface IAllowlist {
    event AllowedSet(address indexed account, bool allowed);

    function isAllowed(address account) external view returns (bool);

    function setAllowed(address[] calldata accounts, bool allowed) external;
}
