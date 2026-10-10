/** Tributaries converging into one channel: every chain flows to one registry. */
/** Tributaries converging into one channel: every chain flows to one registry. Source: public/logos/muara.svg */
export function LogoMark({ size = 28 }: { size?: number }) {
  return <img src="/logos/muara.svg" width={size} height={size} alt="" draggable={false} aria-hidden />;
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="font-display text-[24px] leading-none font-semibold tracking-tight text-ink">Muara</span>
    </span>
  );
}

/** Faint bathymetric contour lines drifting behind the header. */
export function ContourBand() {
  const lines = Array.from({ length: 7 }, (_, i) => i);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-56 overflow-hidden opacity-[0.35]">
      <svg className="animate-drift h-full w-[200%]" viewBox="0 0 1600 220" preserveAspectRatio="none">
        {lines.map((i) => {
          const y = 30 + i * 26;
          const a = 10 + i * 3;
          const d = `M0 ${y} C 200 ${y - a}, 300 ${y + a}, 400 ${y} S 600 ${y - a}, 800 ${y} S 1000 ${y + a}, 1200 ${y} S 1400 ${y - a}, 1600 ${y}`;
          return <path key={i} d={d} fill="none" stroke="var(--brand)" strokeOpacity={0.08 + i * 0.02} strokeWidth="1" />;
        })}
      </svg>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-bg" />
    </div>
  );
}
