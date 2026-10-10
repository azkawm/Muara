// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IMuaraOracle } from "../interfaces/IMuaraOracle.sol";
import { Errors } from "../lib/Errors.sol";

/// @title MockPriceOracle
/// @notice Testnet price feed driven by the admin and the backend scenario runner.
/// @dev Same interface as the mainnet Pyth adapter. Prices are WAD USD per whole token.
contract MockPriceOracle is IMuaraOracle, Ownable {
    struct Price {
        uint256 price;
        uint256 updatedAt;
    }

    mapping(address asset => Price) internal _prices;
    mapping(address account => bool) public isUpdater;

    event PriceUpdated(address indexed asset, uint256 price, uint256 updatedAt);
    event UpdaterSet(address indexed account, bool enabled);

    modifier onlyUpdater() {
        if (msg.sender != owner() && !isUpdater[msg.sender]) revert Errors.NotPriceUpdater();
        _;
    }

    constructor(address owner_) Ownable(owner_) { }

    /// @inheritdoc IMuaraOracle
    function getPrice(address asset) external view returns (uint256 price, uint256 updatedAt) {
        Price memory p = _prices[asset];
        if (p.price == 0) revert Errors.PriceNotSet(asset);
        return (p.price, p.updatedAt);
    }

    function setPrice(address asset, uint256 price) external onlyUpdater {
        _setPrice(asset, price);
    }

    function setPrices(address[] calldata assets, uint256[] calldata prices) external onlyUpdater {
        if (assets.length != prices.length) revert Errors.InvalidParams();
        for (uint256 i; i < assets.length; ++i) {
            _setPrice(assets[i], prices[i]);
        }
    }

    function setUpdater(address account, bool enabled) external onlyOwner {
        isUpdater[account] = enabled;
        emit UpdaterSet(account, enabled);
    }

    function _setPrice(address asset, uint256 price) internal {
        if (price == 0) revert Errors.InvalidParams();
        _prices[asset] = Price(price, block.timestamp);
        emit PriceUpdated(asset, price, block.timestamp);
    }
}
