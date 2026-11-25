import { useEffect, useRef, useState } from 'react';
import { uiSound } from '../../audio/ui-sounds';

/** A number that counts up (or down) to its new value instead of jumping — for scores. The first value it shows is simply shown. */
export function CountUp({ value, ms = 700, sound = false, from: start }: { value: number; ms?: number; sound?: boolean; /** count up from this on first showing, instead of just showing the value */ from?: number }) {
  const [shown, setShown] = useState(start ?? value);
  const from = useRef(start ?? value);
  useEffect(() => {
    if (from.current === value) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    const a = from.current;
    if (sound && value > a) uiSound.pop();
    if (reduce) {
      from.current = value;
      setShown(value);
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(a + (value - a) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, ms, sound]);
  return <>{shown}</>;
}
