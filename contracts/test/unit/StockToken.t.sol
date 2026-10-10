// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MuaraFixture } from "../utils/MuaraFixture.sol";
import { SendParam, MessagingFee } from "@layerzerolabs/oft-evm/contracts/interfaces/IOFT.sol";
import { Errors } from "../../src/lib/Errors.sol";

contract StockTokenTest is MuaraFixture {
    address internal stranger = makeAddr("stranger");

    function test_transferToNonAllowlistedReverts() public {
        vm.prank(rina);
        vm.expectRevert(abi.encodeWithSelector(Errors.NotAllowlisted.selector, stranger));
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        nvda.transfer(stranger, 1e18);
    }

    function test_faucetRequiresAllowlist() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Errors.NotAllowlisted.selector, stranger));
        nvda.faucet(1e18);

        vm.prank(rina);
        nvda.faucet(1e18);
        assertEq(nvda.balanceOf(rina), 101e18);
    }

    function test_sendRejectsRecipientBeforeBurning() public {
        SendParam memory p = SendParam(B, bytes32(uint256(uint160(stranger))), 1e18, 1e18, "", "", "");
        MessagingFee memory fee = nvda.quoteSend(p, false);
        vm.prank(rina);
        vm.expectRevert(abi.encodeWithSelector(Errors.NotAllowlisted.selector, stranger));
        nvda.send{ value: fee.nativeFee }(p, fee, rina);
        assertEq(nvda.balanceOf(rina), 100e18);
    }

    function test_sendToAllowlistedRecipientCrossChain() public {
        SendParam memory p = SendParam(B, bytes32(uint256(uint160(rina))), 10e18, 10e18, "", "", "");
        MessagingFee memory fee = nvda.quoteSend(p, false);
        vm.prank(rina);
        nvda.send{ value: fee.nativeFee }(p, fee, rina);
        verifyPackets(B, address(nvdaB));
        assertEq(nvda.balanceOf(rina), 90e18);
        assertEq(nvdaB.balanceOf(rina), 10e18);
    }
}
