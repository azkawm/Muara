import * as Switch from "@radix-ui/react-switch";
import { Tip } from "../../components/ui";
import { contracts } from "../../lib/contracts";
import { useTx } from "../../lib/useTx";
import type { Position } from "../markets/useMarkets";

/**
 * Sharia filter: stock is lent to short sellers by default. Switching off locks it as plain
 * collateral that earns no fees and is never lent.
 */
export function LendableSwitch({ position }: { position: Position }) {
  const { send, busy } = useTx();
  const { meta } = position.market;
  const toggle = (lendable: boolean) =>
    send(lendable ? `Lend ${meta.symbol} to shorts` : `Stop lending ${meta.symbol}`, {
      ...contracts.pool,
      functionName: "setLendable",
      args: [meta.address, lendable],
    }).catch(() => {});

  return (
    <Tip
      content={
        position.lendable
          ? "Lent to short sellers; you earn their borrow fee. Turn off to keep it out of short selling (sharia filter)."
          : "Not lent: kept as collateral only and earns no fees. Turn on to lend to short sellers."
      }
    >
      <label className="flex cursor-pointer items-center gap-2 text-small text-ink-2">
        <Switch.Root
          checked={position.lendable}
          disabled={busy}
          onCheckedChange={toggle}
          className="relative h-5 w-9 rounded-full bg-raised transition data-[state=checked]:bg-brand disabled:opacity-50"
        >
          <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition data-[state=checked]:translate-x-[18px]" />
        </Switch.Root>
        Lend
      </label>
    </Tip>
  );
}
