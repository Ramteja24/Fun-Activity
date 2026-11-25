import { useEffect, useRef } from 'react';

const COLORS = ['#ffd23f', '#ff7a2f', '#35e6d8', '#2ee86b', '#ff4d6d', '#2563eb', '#8a7bff'];

/** Lightweight canvas confetti burst (no dependency). */
export function Confetti({ durationMs = 3600 }: { durationMs?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    const w = () => canvas.width;
    const h = () => canvas.height;

    const parts = Array.from({ length: 130 }, () => ({
      x: Math.random() * w(),
      y: -Math.random() * h() * 0.5,
      vx: (Math.random() - 0.5) * 2.4 * dpr,
      vy: (1.6 + Math.random() * 3.2) * dpr,
      s: (4 + Math.random() * 6) * dpr,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      c: COLORS[Math.floor(Math.random() * COLORS.length)]!,
    }));

    const start = performance.now();
    let raf = 0;
    const draw = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w(), h());
      const fade = t > durationMs - 700 ? Math.max(0, (durationMs - t) / 700) : 1;
      ctx.globalAlpha = fade;
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.03 * dpr;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.6);
        ctx.restore();
      }
      if (t < durationMs) raf = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, w(), h());
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [durationMs]);

  return <canvas ref={ref} className="confetti" style={{ width: '100%', height: '100%' }} />;
}
