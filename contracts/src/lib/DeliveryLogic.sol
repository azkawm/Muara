// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { SendParam, MessagingFee, MessagingReceipt } from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import { Errors } from "./Errors.sol";
import { IMuaraOFT } from "../interfaces/IMuaraOFT.sol";
import { IMuaraPool } from "../interfaces/IMuaraPool.sol";

/// @title DeliveryLogic
/// @notice Sends funds leaving the hub either locally or through the asset's LayerZero OFT.
/// @dev The OFT burns from the pool's own balance, so no approval is needed. The caller's
///      native fee is forwarded and LayerZero refunds any excess to `refundAddress`.
library DeliveryLogic {
    using SafeERC20 for IERC20;

    /// @return guid LayerZero message id, zero for local delivery.
    function deliver(
        address asset,
        address to,
        uint256 amount,
        uint32 localEid,
        uint32 dstEid,
        uint256 nativeFee,
        address refundAddress
    ) external returns (bytes32 guid) {
        if (!isRemote(localEid, dstEid)) {
            if (nativeFee != 0) revert Errors.UnexpectedNativeFee();
            IERC20(asset).safeTransfer(to, amount);
            return bytes32(0);
        }

        (MessagingReceipt memory receipt,) = IMuaraOFT(asset).send{ value: nativeFee }(
            _sendParam(to, amount, dstEid), MessagingFee(nativeFee, 0), refundAddress
        );
        guid = receipt.guid;
        emit IMuaraPool.CrossChainDelivery(asset, to, amount, dstEid, guid);
    }

    function quote(address asset, uint256 amount, uint32 localEid, uint32 dstEid, address to)
        internal
        view
        returns (uint256)
    {
        if (!isRemote(localEid, dstEid)) return 0;
        return IMuaraOFT(asset).quoteSend(_sendParam(to, removeDust(asset, amount), dstEid), false).nativeFee;
    }

    function isRemote(uint32 localEid, uint32 dstEid) internal pure returns (bool) {
        return dstEid != 0 && dstEid != localEid;
    }

    /// @notice Round `amount` down to what the OFT can carry without losing dust.
    function removeDust(address asset, uint256 amount) internal view returns (uint256) {
        uint256 rate = IMuaraOFT(asset).decimalConversionRate();
        return amount - amount % rate;
    }

    function _sendParam(address to, uint256 amount, uint32 dstEid) private pure returns (SendParam memory) {
        return SendParam({
            dstEid: dstEid,
            to: bytes32(uint256(uint160(to))),
            amountLD: amount,
            minAmountLD: amount,
            extraOptions: "",
            composeMsg: "",
            oftCmd: ""
        });
    }
}
