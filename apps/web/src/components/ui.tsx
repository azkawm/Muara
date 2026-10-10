import * as Tooltip from "@radix-ui/react-tooltip";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type Variant = "primary" | "secondary" | "ghost" | "tide" | "danger" | "glass" | "glass-tide";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-brand-ink hover:brightness-110",
  secondary: "border border-line bg-surface text-ink hover:bg-raised",
  ghost: "text-ink-2 hover:bg-raised hover:text-ink",
  tide: "bg-tide text-white hover:brightness-110",
  danger: "bg-neg text-white hover:brightness-110",
  // Modal actions: a translucent, blurred tint of the action colour with a hairline in the same hue.
  glass: "border border-brand/60 bg-transparent text-brand backdrop-blur-md hover:bg-brand/10",
  "glass-tide": "border border-tide/60 bg-transparent text-tide backdrop-blur-md hover:bg-tide/10",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  const sizes = { sm: "h-8 px-3 text-small", md: "h-10 px-4 text-body", lg: "h-12 px-5 text-lead" };
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-input font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
        sizes[size],
        VARIANTS[variant],
        className,
      )}
    >
      {loading && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx("rounded-card border border-line bg-surface", className)}>{children}</section>;
}

export function CardHeader({ title, aside, sub }: { title: ReactNode; aside?: ReactNode; sub?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-lead font-medium text-ink">{title}</h2>
        {sub && <p className="mt-0.5 text-small text-ink-3">{sub}</p>}
      </div>
      {aside}
    </header>
  );
}

type BadgeTone = "neutral" | "brand" | "tide" | "silt" | "pos" | "neg" | "warn";

const BADGE: Record<BadgeTone, string> = {
  neutral: "bg-raised text-ink-2",
  brand: "bg-brand/15 text-brand",
  tide: "bg-tide/15 text-tide",
  silt: "bg-silt/15 text-silt",
  pos: "bg-pos/15 text-pos",
  neg: "bg-neg/15 text-neg",
  warn: "bg-hf-danger/15 text-hf-danger",
};

export function Badge({ tone = "neutral", dot, children }: { tone?: BadgeTone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-medium", BADGE[tone])}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Stat({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: string }) {
  return (
    <div>
      <div className="text-caption tracking-wide text-ink-3 uppercase">{label}</div>
      <div className={cx("num mt-1 text-h3 text-ink", tone)}>{value}</div>
      {hint && <div className="mt-0.5 text-small text-ink-3">{hint}</div>}
    </div>
  );
}

export function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-body">
      <span className="text-ink-2">{label}</span>
      <span className="num text-ink">{children}</span>
    </div>
  );
}

export function Tip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={6}
          className="z-50 max-w-64 rounded-input border border-line bg-raised px-3 py-2 text-small text-ink-2 shadow-lg"
        >
          {content}
          <Tooltip.Arrow className="fill-raised" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="relative overflow-hidden px-5 py-10 text-center">
      <svg aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-16 w-full -translate-y-1/2 text-line" viewBox="0 0 400 60" preserveAspectRatio="none">
        <path d="M0 30 C 80 10, 120 50, 200 30 S 320 10, 400 30" stroke="currentColor" fill="none" strokeWidth="1" />
        <path d="M0 42 C 80 22, 120 62, 200 42 S 320 22, 400 42" stroke="currentColor" fill="none" strokeWidth="1" opacity="0.6" />
      </svg>
      <p className="relative text-body text-ink-2">{title}</p>
      {children && <div className="relative mt-3">{children}</div>}
    </div>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span className={cx("skeleton", className ?? "h-4 w-16")} style={style} aria-hidden />;
}

/** Table placeholder rows: a round avatar in the first cell, a pill per remaining column. */
export function SkeletonRows({ rows = 3, cols, cellClass = "px-4 py-5" }: { rows?: number; cols: number; cellClass?: string }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="border-t border-line">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} className={cellClass}>
              {c === 0 ? (
                <span className="flex items-center gap-3">
                  <Skeleton className="size-8" />
                  <Skeleton className="h-4 w-36" />
                </span>
              ) : (
                <Skeleton className="h-4 w-24" />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Stacked list placeholder for cards and panels. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="size-8" />
          <span className="space-y-2">
            <Skeleton className="block h-4 w-28" />
            <Skeleton className="block h-3 w-16" />
          </span>
          <Skeleton className="ml-auto h-8 w-20" />
        </div>
      ))}
    </div>
  );
}
