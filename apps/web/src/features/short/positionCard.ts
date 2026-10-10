/**
 * Renders a short position as a trading-card image (PNG data URL) for the HoloCard and for
 * sharing. Drawn on a 2D canvas in Estuary colours; the foil shader is layered on top live.
 */
export interface PositionCardData {
  symbol: string;
  size: number;
  entry: number;
  mark: number;
  pnl: number;
  healthFactor: number;
  liqPrice?: number;
  address: string;
  openedAt?: Date;
  /** Keeper closed the position; render the "nice try" variant. */
  liquidated?: boolean;
  /** Stock the keeper bought back, for the liquidated card. */
  liquidatedSize?: number;
}

const W = 720;
const H = 1000;

const usd = (n: number, digits = 2) => `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function logoMark(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 32, s / 32);
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineWidth = 1.6;
  for (const [d, a] of [
    ["M3 7c7 0 9 6 13 9", 0.7],
    ["M3 16h13", 0.85],
    ["M3 25c7 0 9-6 13-9", 0.7],
  ] as const) {
    ctx.globalAlpha = a;
    ctx.stroke(new Path2D(d));
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = 4;
  ctx.stroke(new Path2D("M16 16h13"));
  ctx.restore();
}

export async function renderPositionCard(d: PositionCardData): Promise<string> {
  // Fonts are already loaded by the time anyone opens a position; never wait long on them.
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 800))]);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const sans = '"Instrument Sans Variable", system-ui, sans-serif';
  const mono = '"Geist Mono Variable", ui-monospace, monospace';
  const liq = Boolean(d.liquidated);
  const up = !liq && d.pnl >= 0;
  const accent = up ? "#3fbf7f" : "#e5484d";

  // Card body: deep water with a faint tide glow.
  roundedRect(ctx, 0, 0, W, H, 36);
  ctx.clip();
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0e1b21");
  bg.addColorStop(1, "#0b1418");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.8, H * 0.15, 20, W * 0.8, H * 0.15, 520);
  glow.addColorStop(0, liq ? "rgba(229, 72, 77, 0.38)" : "rgba(124, 131, 242, 0.35)");
  glow.addColorStop(1, liq ? "rgba(229, 72, 77, 0)" : "rgba(124, 131, 242, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Contour lines, like the header band.
  ctx.strokeStyle = "rgba(47, 184, 166, 0.16)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 9; i++) {
    const y = 620 + i * 38;
    const a = 14 + i * 3;
    ctx.beginPath();
    ctx.moveTo(-10, y);
    for (let x = 0; x <= W + 10; x += 10) ctx.lineTo(x, y + Math.sin(x / 110 + i) * a);
    ctx.stroke();
  }

  // Frame
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 3;
  roundedRect(ctx, 14, 14, W - 28, H - 28, 28);
  ctx.stroke();

  // Header
  logoMark(ctx, 48, 44, 40, "#2fb8a6");
  ctx.fillStyle = "#e8f1ef";
  ctx.font = `600 34px ${sans}`;
  ctx.textBaseline = "middle";
  ctx.fillText("Muara", 100, 64);
  ctx.textAlign = "right";
  if (liq) {
    ctx.font = `600 20px ${sans}`;
    const label = "LIQUIDATED";
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(229, 72, 77, 0.18)";
    roundedRect(ctx, W - 52 - tw - 28, 46, tw + 28, 36, 18);
    ctx.fill();
    ctx.fillStyle = "#e5484d";
    ctx.fillText(label, W - 66, 64);
  } else {
    ctx.fillStyle = "#7c83f2";
    ctx.font = `600 22px ${sans}`;
    ctx.fillText("SHORT", W - 52, 64);
  }
  ctx.textAlign = "left";

  // Asset
  ctx.fillStyle = "#9db3b0";
  ctx.font = `500 22px ${sans}`;
  ctx.fillText("Position", 52, 150);
  ctx.fillStyle = "#e8f1ef";
  ctx.font = `600 84px ${sans}`;
  ctx.fillText(d.symbol, 48, 215);
  ctx.fillStyle = "#9db3b0";
  ctx.font = `500 28px ${mono}`;
  const shown = liq ? (d.liquidatedSize ?? d.size) : d.size;
  ctx.fillText(`${shown.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${d.symbol} short`, 52, 280);

  if (liq) {
    // The keeper got here first.
    ctx.fillStyle = "#e5484d";
    ctx.font = `600 92px ${sans}`;
    ctx.fillText("Nice try.", 48, 420);
    ctx.fillStyle = "#e8f1ef";
    ctx.font = `500 40px ${sans}`;
    ctx.fillText("Don\u2019t be greedy.", 52, 488);
  } else {
    // P&L
    ctx.fillStyle = "#9db3b0";
    ctx.font = `500 22px ${sans}`;
    ctx.fillText(up ? "Unrealized profit" : "Unrealized loss", 52, 360);
    ctx.fillStyle = accent;
    ctx.font = `600 96px ${mono}`;
    ctx.fillText(`${up ? "+" : "−"}${usd(Math.abs(d.pnl))}`, 46, 430);
    const pct = d.entry > 0 ? ((d.entry - d.mark) / d.entry) * 100 : 0;
    ctx.font = `500 30px ${mono}`;
    ctx.fillText(`${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% vs entry`, 52, 495);
  }

  // Stats grid
  const rows: [string, string][] = liq
    ? [
        ["Entry", usd(d.entry)],
        ["Liquidated at", usd(d.mark)],
        ["Move against you", d.entry > 0 ? `+${(((d.mark - d.entry) / d.entry) * 100).toFixed(1)}%` : "-"],
        ["Result", "Lose"],
      ]
    : [
        ["Entry", usd(d.entry)],
        ["Mark", usd(d.mark)],
        ["Health", Number.isFinite(d.healthFactor) ? d.healthFactor.toFixed(2) : "∞"],
        ["Liquidation", d.liqPrice ? usd(d.liqPrice) : "-"],
      ];
  rows.forEach(([k, v], i) => {
    const x = 52 + (i % 2) * 330;
    const y = 585 + Math.floor(i / 2) * 92;
    ctx.fillStyle = "#6b8380";
    ctx.font = `500 20px ${sans}`;
    ctx.fillText(k, x, y);
    ctx.fillStyle = k === "Liquidation" || k === "Result" || k === "Move against you" ? "#e5484d" : "#e8f1ef";
    ctx.font = `600 36px ${mono}`;
    ctx.fillText(v, x, y + 40);
  });

  // Footer
  ctx.fillStyle = "#6b8380";
  ctx.font = `500 20px ${mono}`;
  ctx.fillText(`${d.address.slice(0, 6)}…${d.address.slice(-4)}`, 52, H - 92);
  ctx.textAlign = "right";
  ctx.fillText((d.openedAt ?? new Date()).toISOString().slice(0, 10), W - 52, H - 92);
  ctx.textAlign = "left";
  ctx.fillStyle = "#9db3b0";
  ctx.font = `500 22px ${sans}`;
  ctx.fillText("Every chain flows to one registry.", 52, H - 54);

  return canvas.toDataURL("image/png");
}

export function dataUrlToFile(dataUrl: string, name: string): File {
  const [head, body] = dataUrl.split(",");
  const mime = /data:(.*?);/.exec(head ?? "")?.[1] ?? "image/png";
  const bytes = atob(body ?? "");
  const buf = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
  return new File([buf], name, { type: mime });
}
