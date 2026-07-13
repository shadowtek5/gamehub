"use client";

// Steam-style real-time activity graph for the downloads page: blue "network"
// throughput bars behind a smooth green "disk" line + fill, scrolling
// continuously right-to-left. Drawn on a canvas with requestAnimationFrame so
// the scroll interpolates between the (slow) data polls instead of jumping one
// whole sample each poll — new samples slide in from the right at 60fps.

import { useEffect, useRef } from "react";

const SAMPLE_MS = 1500; // matches the downloads poll cadence
const VISIBLE = 80; // samples shown across the width (dense, thin bars)
const KEEP = 96; // samples retained (some scroll off the left edge)

export default function ActivityGraph({
  series,
  className = "",
}: {
  series: number[];
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // animation state, mutated outside React's render cycle
  const st = useRef({ points: [] as number[], lastPush: 0 });

  // A new poll delivers a fresh array ref → treat as one sample arriving now.
  useEffect(() => {
    const padded = series.slice(-KEEP);
    while (padded.length < VISIBLE) padded.unshift(0);
    st.current.points = padded;
    st.current.lastPush =
      typeof performance !== "undefined" ? performance.now() : Date.now();
  }, [series]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

    const draw = () => {
      const pts = st.current.points;
      const n = pts.length;
      ctx.clearRect(0, 0, w, h);
      if (n >= 2) {
        // EMA-smoothed series for the disk line
        const alpha = 0.35;
        const ema: number[] = [];
        let e = pts[0];
        for (const v of pts) {
          e = alpha * v + (1 - alpha) * e;
          ema.push(e);
        }
        const max = Math.max(1, ...pts, ...ema);
        const step = w / VISIBLE;
        const frac = Math.min(1, (now() - st.current.lastPush) / SAMPLE_MS);
        // newest sample (i=n-1) sits at the right edge, sliding left by `frac`
        const xOf = (i: number) => w - (n - 1 - i) * step - frac * step;
        // full-height mapping for the disk line
        const yOf = (v: number) => h - (v / max) * (h - 3) - 1.5;
        // network bars only reach ~half height and rise from the bottom
        const yBar = (v: number) => h - (v / max) * (h * 0.5);

        // network bars — short, translucent, fading out toward the middle
        const barGrad = ctx.createLinearGradient(0, h * 0.5, 0, h);
        barGrad.addColorStop(0, "rgba(58,134,255,0)");
        barGrad.addColorStop(1, "rgba(58,134,255,0.28)");
        ctx.fillStyle = barGrad;
        const bw = step * 0.8; // thin bars packed tight, with a small gap
        for (let i = 0; i < n; i++) {
          const x = xOf(i);
          if (x < -step || x > w + step) continue;
          const y = yBar(pts[i]);
          ctx.fillRect(x - bw / 2, y, bw, Math.max(0, h - y));
        }

        // smooth disk line via Catmull-Rom → bezier
        const P = pts.map((_, i) => ({ x: xOf(i), y: yOf(ema[i]) }));
        ctx.beginPath();
        ctx.moveTo(P[0].x, P[0].y);
        for (let i = 0; i < P.length - 1; i++) {
          const p0 = P[i - 1] ?? P[i];
          const p1 = P[i];
          const p2 = P[i + 1];
          const p3 = P[i + 2] ?? p2;
          const c1x = p1.x + (p2.x - p0.x) / 6;
          const c1y = p1.y + (p2.y - p0.y) / 6;
          const c2x = p2.x - (p3.x - p1.x) / 6;
          const c2y = p2.y - (p3.y - p1.y) / 6;
          ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
        }
        // fill under the curve
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "rgba(89,191,64,0.30)");
        grad.addColorStop(1, "rgba(89,191,64,0)");
        ctx.save();
        ctx.lineTo(P[P.length - 1].x, h);
        ctx.lineTo(P[0].x, h);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();

        // stroke the line (redraw path without the fill closure)
        ctx.beginPath();
        ctx.moveTo(P[0].x, P[0].y);
        for (let i = 0; i < P.length - 1; i++) {
          const p0 = P[i - 1] ?? P[i];
          const p1 = P[i];
          const p2 = P[i + 1];
          const p3 = P[i + 2] ?? p2;
          const c1x = p1.x + (p2.x - p0.x) / 6;
          const c1y = p1.y + (p2.y - p0.y) / 6;
          const c2x = p2.x - (p3.x - p1.x) / 6;
          const c2y = p2.y - (p3.y - p1.y) / 6;
          ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
        }
        ctx.strokeStyle = "#59bf40";
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} />;
}
