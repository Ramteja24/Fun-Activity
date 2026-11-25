import { useEffect, useState } from 'react';
import { socket } from '../store';

/** The server's clock, re-read every `everyMs` — so a timer on every screen agrees with the host's (not with the device's own clock). */
export function useServerNow(everyMs = 100): number {
  const [now, setNow] = useState(() => socket.serverNow());
  useEffect(() => {
    setNow(socket.serverNow());
    const id = window.setInterval(() => setNow(socket.serverNow()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}

/** Seconds left until a server-clock deadline (never negative). */
export function useSecondsLeft(endsAt: number | undefined, everyMs = 100): number {
  const now = useServerNow(everyMs);
  return endsAt === undefined ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** Fraction of the time still left (1 → 0) until a server-clock deadline. */
export function useTimeFraction(endsAt: number | undefined, totalMs: number, everyMs = 100): number {
  const now = useServerNow(everyMs);
  return endsAt === undefined || totalMs <= 0 ? 0 : Math.min(1, Math.max(0, (endsAt - now) / totalMs));
}

/** How far through a server-timed animation we are (0 → 1), read from the server's clock every animation frame — the same on every screen. */
export function useSpinProgress(startedAt: number, ms: number): number {
  const read = () => Math.min(1, Math.max(0, (socket.serverNow() - startedAt) / ms));
  const [t, setT] = useState(read);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = read();
      setT(v);
      if (v < 1) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, ms]);
  return t;
}

/** "Reduce motion" is switched on in the operating system. */
export function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(query);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** 1 → "1st", 2 → "2nd", 3 → "3rd". */
export const ordinal = (n: number): string => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};
