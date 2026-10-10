import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { erc20Abi, type Abi, type Address, type Hash } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { CHAINS } from "@muara/shared";
import { useToast } from "../components/Toast";
import { errorsAbi, HUB_CHAIN_ID } from "./contracts";
import { describeError } from "./errors";

export interface TxParams {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
}

export const txUrl = (hash: string) => `${CHAINS.baseSepolia.explorer}/tx/${hash}`;

/**
 * Every write goes through here: switch to Base, simulate (custom errors decoded, including
 * those raised inside the pool's linked libraries), estimate gas plus 30%, send, wait, toast,
 * then refresh all reads. Exact estimates have run out of gas on pool calls, hence the buffer.
 */
export function useTx() {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: HUB_CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);

  const send = useCallback(
    async (label: string, params: TxParams): Promise<Hash> => {
      if (!address || !client) throw new Error("Connect a wallet first");
      setPending(label);
      try {
        if (chainId !== HUB_CHAIN_ID) await switchChainAsync({ chainId: HUB_CHAIN_ID });
        const call = { ...params, abi: [...(params.abi as Abi), ...errorsAbi], account: address } as never;
        await client.simulateContract(call);
        const gas = ((await client.estimateContractGas(call)) * 130n) / 100n;
        const hash = await writeContractAsync({ ...(call as object), gas, chainId: HUB_CHAIN_ID } as never);
        toast.push({ title: `${label} submitted`, tone: "info", href: txUrl(hash) });
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Transaction reverted on chain");
        toast.push({ title: `${label} confirmed`, tone: "success", href: txUrl(hash) });
        await queryClient.invalidateQueries();
        return hash;
      } catch (err) {
        toast.push({ title: `${label} failed`, description: describeError(err), tone: "error" });
        throw err;
      } finally {
        setPending(null);
      }
    },
    [address, chainId, client, queryClient, switchChainAsync, toast, writeContractAsync],
  );

  /** Approve `spender` for `amount` (max when unlimited) only if the allowance is short. */
  const ensureAllowance = useCallback(
    async (token: { address: Address; symbol: string }, spender: Address, amount: bigint) => {
      if (!address || !client) throw new Error("Connect a wallet first");
      const allowance = await client.readContract({
        address: token.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, spender],
      });
      if (allowance >= amount) return;
      await send(`Approve ${token.symbol}`, {
        address: token.address,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, 2n ** 256n - 1n],
      });
    },
    [address, client, send],
  );

  return { send, ensureAllowance, pending, busy: pending !== null };
}
