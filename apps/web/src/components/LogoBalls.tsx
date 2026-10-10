/**
 * Metaballs that carry the actual asset logos. The orbit and cursor-follow math is the React
 * Bits MetaBalls source; the gooey merge is done with a blur + contrast filter on a 2D canvas
 * instead of the ogl shader, so logo images can sit on the blobs.
 */
import { useEffect, useRef } from "react";

export interface LogoBall {
  src: string;
  /** Pad the logo inside a white disc (wordmarks). */
  pad?: boolean;
}

export interface LogoBallsProps {
  logos: LogoBall[];
  color?: string;
  cursorColor?: string;
  /** World units across the shorter side, as in MetaBalls' animationSize. */
  animationSize?: number;
  speed?: number;
  clumpFactor?: number;
  hoverSmoothness?: number;
  cursorBallSize?: number;
  /** Extra blobs without logos, for a fuller field. */
  extraBalls?: number;
  className?: string;
}

const fract = (x: number) => x - Math.floor(x);

/**
 * Canvas drawImage cannot draw an SVG that has no intrinsic width/height (NVDA, MSFT and
 * SPY lack them). Load the SVG text and give it explicit dimensions via a blob URL.
 */
function loadLogo(src: string): HTMLImageElement {
  const img = new Image();
  img.decoding = "async";
  if (!src.endsWith(".svg")) {
    img.src = src;
    return img;
  }
  fetch(src)
    .then((r) => r.text())
    .then((svg) => {
      const fixed = /<svg[^>]*\swidth=/.test(svg) ? svg : svg.replace(/<svg/, '<svg width="512" height="512"');
      img.src = URL.createObjectURL(new Blob([fixed], { type: "image/svg+xml" }));
    })
    .catch(() => {
      img.src = src;
    });
  return img;
}

function hash31(p: number): [number, number, number] {
  const r = [p * 0.1031, p * 0.103, p * 0.0973].map(fract) as [number, number, number];
  const yzx = [r[1], r[2], r[0]];
  const d = r[0] * (yzx[0]! + 33.33) + r[1] * (yzx[1]! + 33.33) + r[2] * (yzx[2]! + 33.33);
  return r.map((v) => fract(v + d)) as [number, number, number];
}

function hash33(v: [number, number, number]): [number, number, number] {
  const p = [v[0] * 0.1031, v[1] * 0.103, v[2] * 0.0973].map(fract) as [number, number, number];
  const yxz = [p[1], p[0], p[2]];
  const d = p[0] * (yxz[0]! + 33.33) + p[1] * (yxz[1]! + 33.33) + p[2] * (yxz[2]! + 33.33);
  for (let i = 0; i < 3; i++) p[i] = fract(p[i]! + d);
  const xxy = [p[0], p[0], p[1]];
  const yxx = [p[1], p[0], p[0]];
  const zyx = [p[2], p[1], p[0]];
  return [0, 1, 2].map((i) => fract((xxy[i]! + yxx[i]!) * zyx[i]!)) as [number, number, number];
}

interface Ball {
  st: number;
  dtFactor: number;
  baseScale: number;
  toggle: number;
  radius: number;
  logo?: HTMLImageElement;
  pad?: boolean;
}

export function LogoBalls({
  logos,
  color = "#2fb8a6",
  cursorColor = "#7c83f2",
  animationSize = 30,
  speed = 0.3,
  clumpFactor = 1,
  hoverSmoothness = 0.05,
  cursorBallSize = 2,
  extraBalls = 6,
  className = "",
}: LogoBallsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<HTMLCanvasElement>(null);
  const logoRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const blobCanvas = blobRef.current;
    const logoCanvas = logoRef.current;
    if (!root || !blobCanvas || !logoCanvas) return;
    const blob = blobCanvas.getContext("2d");
    const top = logoCanvas.getContext("2d");
    if (!blob || !top) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const balls: Ball[] = Array.from({ length: logos.length + extraBalls }, (_, i) => {
      const h1 = hash31(i + 1);
      const h2 = hash33(h1);
      const logo = logos[i];
      const img = logo ? loadLogo(logo.src) : undefined;
      return {
        st: h1[0] * 2 * Math.PI,
        dtFactor: 0.1 * Math.PI + h1[1] * (0.4 * Math.PI - 0.1 * Math.PI),
        baseScale: 5 + h1[1] * 5,
        toggle: Math.floor(h2[0] * 2),
        // Logo blobs are a little larger so the image has room.
        radius: logo ? 1.6 + h2[2] * 0.8 : 0.5 + h2[2] * 1.5,
        logo: img,
        pad: logo?.pad,
      };
    });

    let width = 0;
    let height = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = root.clientWidth;
      height = root.clientHeight;
      for (const c of [blobCanvas, logoCanvas]) {
        c.width = Math.round(width * dpr);
        c.height = Math.round(height * dpr);
        c.style.width = `${width}px`;
        c.style.height = `${height}px`;
      }
      blob.setTransform(dpr, 0, 0, dpr, 0, 0);
      top.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(root);

    const pointer = { x: 0, y: 0, inside: false };
    const cursor = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.inside = true;
    };
    const onLeave = () => {
      pointer.inside = false;
    };
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", onLeave);

    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#0b1418";
    const start = performance.now();
    let raf = 0;

    const frame = (t: number) => {
      raf = reduce ? 0 : requestAnimationFrame(frame);
      const elapsed = (t - start) * 0.001;
      // World scale: animationSize units across the shorter side, like the shader.
      const scale = Math.min(width, height) / animationSize;
      const cx = width / 2;
      const cy = height / 2;

      // Blob layer: solid background plus discs; the CSS filter melts them together.
      blob.fillStyle = bg;
      blob.fillRect(0, 0, width, height);
      blob.fillStyle = color;
      const positions = balls.map((b) => {
        const dt = elapsed * speed * b.dtFactor;
        const th = b.st + dt;
        const x = cx + Math.cos(th) * b.baseScale * clumpFactor * scale;
        const y = cy + Math.sin(th + dt * b.toggle) * b.baseScale * clumpFactor * scale;
        const r = b.radius * scale;
        blob.beginPath();
        blob.arc(x, y, r, 0, Math.PI * 2);
        blob.fill();
        return { x, y, r };
      });

      // Cursor ball: follows the pointer, otherwise drifts in a slow ellipse.
      const target = pointer.inside
        ? pointer
        : { x: cx + Math.cos(elapsed * speed) * width * 0.15, y: cy + Math.sin(elapsed * speed) * height * 0.15 };
      cursor.x += (target.x - cursor.x) * hoverSmoothness;
      cursor.y += (target.y - cursor.y) * hoverSmoothness;
      blob.fillStyle = cursorColor;
      blob.beginPath();
      blob.arc(cursor.x, cursor.y, cursorBallSize * scale, 0, Math.PI * 2);
      blob.fill();

      // Logo layer, unfiltered so the images stay crisp.
      top.clearRect(0, 0, width, height);
      balls.forEach((b, i) => {
        if (!b.logo || !b.logo.complete || !b.logo.src) return;
        const { x, y, r } = positions[i]!;
        const size = r * 1.15;
        top.save();
        top.beginPath();
        top.arc(x, y, size / 2, 0, Math.PI * 2);
        top.closePath();
        try {
          if (b.pad) {
            top.fillStyle = "#ffffff";
            top.fill();
            top.clip();
            // Keep the wordmark aspect ratio inside the disc.
            const inner = size * 0.62;
            const ar = b.logo.naturalWidth && b.logo.naturalHeight ? b.logo.naturalWidth / b.logo.naturalHeight : 1;
            const w = ar >= 1 ? inner : inner * ar;
            const h = ar >= 1 ? inner / ar : inner;
            top.drawImage(b.logo, x - w / 2, y - h / 2, w, h);
          } else {
            top.clip();
            top.drawImage(b.logo, x - size / 2, y - size / 2, size, size);
          }
        } catch {
          // Image not decodable yet; it will draw on a later frame.
        }
        top.restore();
      });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
    };
  }, [logos, color, cursorColor, animationSize, speed, clumpFactor, hoverSmoothness, cursorBallSize, extraBalls]);

  return (
    <div ref={rootRef} className={`relative h-full w-full overflow-hidden ${className}`} aria-hidden>
      {/* blur + contrast is the classic gooey filter: soft discs merge into one surface. */}
      <canvas ref={blobRef} className="absolute inset-0" style={{ filter: "blur(14px) contrast(18)" }} />
      <canvas ref={logoRef} className="absolute inset-0" />
    </div>
  );
}
