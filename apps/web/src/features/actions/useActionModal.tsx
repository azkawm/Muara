import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useState } from "react";
import { useAccount } from "wagmi";
import type { Market } from "../markets/useMarkets";
import { ActionModal, type ActionKind } from "./ActionModal";

/** One modal instance per page; `open(kind, market)` launches it, or the wallet modal first. */
export function useActionModal() {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [state, setState] = useState<{ kind: ActionKind; market: Market } | null>(null);
  const [open, setOpen] = useState(false);

  const launch = (kind: ActionKind, market: Market) => {
    if (!isConnected) return openConnectModal?.();
    setState({ kind, market });
    setOpen(true);
  };

  const modal = state ? <ActionModal kind={state.kind} market={state.market} open={open} onOpenChange={setOpen} /> : null;
  return { launch, modal };
}
