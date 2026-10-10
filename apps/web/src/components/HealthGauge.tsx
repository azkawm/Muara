import { healthTone, type HealthTone } from "../lib/format";
import { cx } from "./ui";

const TONE_VAR: Record<HealthTone, string> = {
  safe: "var(--hf-safe)",
  watch: "var(--hf-watch)",
  danger: "var(--hf-danger)",
  critical: "var(--hf-critical)",
};

const TONE_TEXT: Record<HealthTone, string> = {
  safe: "text-hf-safe",
  watch: "text-hf-watch",
  danger: "text-hf-danger",
  critical: "text-hf-critical",
};

/** Gauge spans health factor 0 to 3; the flood line sits at 1.0. */
const MAX = 3;
const levelPct = (hf: number) => (Number.isFinite(hf) ? Math.min(hf, MAX) / MAX : 1) * 100;

export function healthTextClass(hf: number) {
  return Number.isFinite(hf) ? TONE_TEXT[healthTone(hf)] : "text-hf-safe";
}

/**
 * Water level gauge. The water drains toward the flood line as the health factor falls;
 * below the line the position can be liquidated.
 */
export function HealthTank({ hf, height = 112 }: { hf: number; height?: number }) {
  const tone = Number.isFinite(hf) ? healthTone(hf) : "safe";
  const color = TONE_VAR[tone];
  const level = levelPct(hf);
  const flood = (1 / MAX) * 100;
  return (
    <div className="relative w-14 overflow-hidden rounded-card border border-line bg-bg" style={{ height }} aria-hidden>
      <div className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out" style={{ height: `${level}%` }}>
        <svg className="animate-drift absolute -top-2 left-0 h-3 w-[200%]" viewBox="0 0 200 12" preserveAspectRatio="none">
          <path d="M0 6 Q 12.5 0 25 6 T 50 6 T 75 6 T 100 6 T 125 6 T 150 6 T 175 6 T 200 6 V12 H0 Z" fill={color} opacity="0.55" />
        </svg>
        <div className="h-full w-full" style={{ background: `linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 55%, transparent))` }} />
      </div>
      <div className="absolute inset-x-0 border-t border-dashed border-hf-critical" style={{ bottom: `${flood}%` }} />
    </div>
  );
}

/** Horizontal gauge for modals and tables, with the flood line marked. */
export function HealthBar({ hf, className }: { hf: number; className?: string }) {
  const tone = Number.isFinite(hf) ? healthTone(hf) : "safe";
  return (
    <div className={cx("relative h-2 w-full overflow-hidden rounded-full bg-raised", className)} aria-hidden>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${levelPct(hf)}%`, background: TONE_VAR[tone] }}
      />
      <div className="absolute inset-y-0 w-px bg-hf-critical" style={{ left: `${(1 / MAX) * 100}%` }} />
    </div>
  );
}
