import type { DeliveryStatus } from "@muara/shared";
import * as Select from "@radix-ui/react-select";
import { HUB_EID, SPOKE_EID } from "../lib/contracts";
import { cx } from "./ui";

export interface ChainOption {
  eid: number;
  name: string;
  tag: string;
  note: string;
  live: boolean;
}

/** Delivery destinations. Only the hub and the wired spoke are live; the rest show the roadmap. */
export const CHAIN_OPTIONS: ChainOption[] = [
  { eid: HUB_EID, name: "Base", tag: "B", note: "Instant, no bridge fee", live: true },
  { eid: SPOKE_EID, name: "Arbitrum", tag: "A", note: "Via LayerZero, about 1 min", live: true },
  { eid: 40161, name: "Ethereum", tag: "E", note: "Coming soon", live: false },
  { eid: 40232, name: "Optimism", tag: "O", note: "Coming soon", live: false },
  { eid: 40267, name: "Polygon", tag: "P", note: "Coming soon", live: false },
  { eid: 40168, name: "Solana", tag: "S", note: "Coming soon", live: false },
];

export const chainName = (eid: number | null | undefined) =>
  CHAIN_OPTIONS.find((c) => c.eid === eid)?.name ?? (eid ? `eid ${eid}` : "Base");

const CHAIN_LOGOS: Record<string, string> = {
  Base: "/logos/base.png",
  Arbitrum: "/logos/arbitrum.png",
  Ethereum: "/logos/ethereum.png",
  Optimism: "/logos/optimism.png",
  Polygon: "/logos/polygon.png",
  Solana: "/logos/solana.png",
};

function ChainDot({ tag, name, active }: { tag: string; name?: string; active?: boolean }) {
  const logo = name ? CHAIN_LOGOS[name] : undefined;
  if (logo) {
    return <img src={logo} alt="" className={cx("size-6 shrink-0 rounded-full", !active && "opacity-60 grayscale")} draggable={false} />;
  }
  return (
    <span
      className={cx(
        "grid size-6 shrink-0 place-items-center rounded-full border text-caption font-semibold",
        active ? "border-brand bg-brand/15 text-brand" : "border-line bg-raised text-ink-3",
      )}
    >
      {tag}
    </span>
  );
}

/** Where delivered funds should land. Every chain flows to one registry; pick the tributary. */
export function ChainSelector({ value, onChange }: { value: number; onChange: (eid: number) => void }) {
  const current = CHAIN_OPTIONS.find((c) => c.eid === value) ?? CHAIN_OPTIONS[0]!;
  return (
    <Select.Root value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <Select.Trigger
        aria-label="Destination chain"
        className="flex w-full items-center gap-3 rounded-input border border-line bg-bg/25 px-3 py-2.5 text-left transition hover:bg-raised data-[state=open]:border-brand"
      >
        <ChainDot tag={current.tag} name={current.name} active />
        <span className="flex-1">
          <span className="block text-body font-medium text-ink">{current.name}</span>
          <span className="block text-caption text-ink-3">{current.note}</span>
        </span>
        <Select.Icon className="text-ink-3">▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          className="z-50 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-card border border-white/15 shadow-xl shadow-black/40 backdrop-blur-xl backdrop-saturate-150"
          style={{ background: "color-mix(in srgb, var(--surface-raised) 55%, transparent)" }}
        >
          <Select.Viewport className="p-1.5">
            {CHAIN_OPTIONS.map((c) => (
              <Select.Item
                key={c.eid}
                value={String(c.eid)}
                disabled={!c.live}
                className="flex cursor-pointer items-center gap-3 rounded-input px-2.5 py-2 outline-none data-[highlighted]:bg-surface data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45"
              >
                <ChainDot tag={c.tag} name={c.name} active={c.live} />
                <span className="flex-1">
                  <Select.ItemText>
                    <span className="text-body font-medium text-ink">{c.name}</span>
                  </Select.ItemText>
                  <span className="block text-caption text-ink-3">{c.note}</span>
                </span>
                {c.live ? (
                  <Select.ItemIndicator className="text-small text-brand">✓</Select.ItemIndicator>
                ) : (
                  <span className="rounded-full bg-surface px-2 py-0.5 text-caption text-ink-3">Soon</span>
                )}
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

const STAGES: DeliveryStatus[] = ["sent", "verified", "delivered"];
const STAGE_LABEL: Record<DeliveryStatus, string> = {
  sent: "Sent",
  verified: "Verified",
  delivered: "Delivered",
  failed: "Failed",
};

/** Base to destination flow path; dashes move while the message is in transit. */
export function DeliveryFlow({ status, dstEid }: { status: DeliveryStatus; dstEid: number }) {
  const reached = status === "failed" ? 0 : STAGES.indexOf(status);
  const inTransit = status === "sent" || status === "verified";
  const stroke = status === "failed" ? "var(--neg)" : status === "delivered" ? "var(--brand)" : "var(--tide)";
  return (
    <div className="flex items-center gap-3">
      <span className="text-caption text-ink-3">Base</span>
      <svg width="120" height="18" viewBox="0 0 120 18" aria-hidden className="shrink-0">
        <path d="M4 9 C 40 1, 80 17, 116 9" fill="none" stroke="var(--border)" strokeWidth="2" />
        <path
          d="M4 9 C 40 1, 80 17, 116 9"
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeDasharray={inTransit ? "6 6" : undefined}
          className={inTransit ? "animate-flow-dash" : undefined}
          strokeLinecap="round"
        />
        <circle cx="4" cy="9" r="3" fill="var(--brand)" />
        <circle cx="116" cy="9" r="3" fill={status === "delivered" ? "var(--brand)" : "var(--border)"} />
      </svg>
      <span className="text-caption text-ink-3">{chainName(dstEid)}</span>
      <span className="ml-1 flex items-center gap-1.5">
        {status === "failed" ? (
          <span className="text-caption font-medium text-neg">Failed</span>
        ) : (
          STAGES.map((s, i) => (
            <span key={s} className={cx("text-caption", i <= reached ? "font-medium text-ink" : "text-ink-3")}>
              {i > 0 && <span className="mr-1.5 text-ink-3">›</span>}
              {STAGE_LABEL[s]}
            </span>
          ))
        )}
      </span>
    </div>
  );
}
