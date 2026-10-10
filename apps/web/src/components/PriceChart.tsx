import { AreaSeries, createChart, LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef } from "react";
import { useTheme } from "../app/theme";
import type { PricePoint } from "../lib/hooks";

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Canvas colours cannot use color-mix(); derive rgba from the hex token. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Live oracle price with optional reference lines (entry, liquidation). */
export function PriceChart({
  points,
  lines = [],
  height = 220,
}: {
  points: PricePoint[];
  lines?: { price: number; label: string; color: "brand" | "neg" | "tide" | "silt" }[];
  height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Area"> | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      height,
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: css("--text-3"), fontFamily: css("--font-mono") || "monospace" },
      grid: { vertLines: { visible: false }, horzLines: { color: css("--border") } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 2, shiftVisibleRangeOnNewBar: true },
      crosshair: { horzLine: { labelBackgroundColor: css("--surface-raised") }, vertLine: { labelBackgroundColor: css("--surface-raised") } },
    });
    const brand = css("--brand");
    series.current = c.addSeries(AreaSeries, {
      lineColor: brand,
      topColor: withAlpha(brand, 0.35),
      bottomColor: withAlpha(brand, 0),
      lineWidth: 2,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
    };
  }, [height, theme]);

  const fitted = useRef(false);
  useEffect(() => {
    const s = series.current;
    const c = chart.current;
    if (!s || !c) return;
    const data = points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));
    const prev = s.data();
    const last = data.at(-1);
    // Append in place when only new points arrived, so the visible range never jumps.
    if (fitted.current && prev.length && data.length >= prev.length && data[0]?.time === prev[0]?.time && last) {
      for (const p of data.slice(prev.length - 1)) s.update(p);
    } else {
      s.setData(data);
      c.timeScale().fitContent();
      fitted.current = true;
    }
  }, [points, theme]);

  useEffect(() => {
    const s = series.current;
    if (!s) return;
    const created = lines.map((l) =>
      s.createPriceLine({ price: l.price, color: css(`--${l.color}`), lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: l.label }),
    );
    return () => created.forEach((p) => s.removePriceLine(p));
  }, [lines, theme]);

  return <div ref={el} style={{ height }} className="w-full" />;
}
