// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IMuaraOFT } from "./IMuaraOFT.sol";
import { IAllowlist } from "./IAllowlist.sol";

/// @title IStockToken
/// @notice Tokenized stock: an OFT whose holders must be on the allowlist.
interface IStockToken is IMuaraOFT {
    function allowlist() external view returns (IAllowlist);

    function mint(address to, uint256 amount) external;
}
