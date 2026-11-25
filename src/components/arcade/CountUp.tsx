import { useEffect, useRef, useState } from 'react';
import { uiSound } from '../../audio/ui-sounds';

/** A number that counts up (or down) to its new value instead of jumping — for scores. The first value it shows is simply shown. */
export function CountUp({ value, ms = 700, sound = false, from: start }: { value: number; ms?: number; sound?: boolean; /** count up from this on first showing, instead of just showing the value */ from?: number }) {
  const [shown, setShown] = useState(start ?? value);
  // what is on screen right now: a new value animates from here, so an interrupted (or re-run) animation never sticks
  const current = useRef(start ?? value);
  useEffect(() => {
    if (current.current === value) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const begin = performance.now();
    const a = current.current;
    if (sound && value > a) uiSound.pop();
    if (reduce) {
      current.current = value;
      setShown(value);
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - begin) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      current.current = Math.round(a + (value - a) * eased);
      setShown(current.current);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms, sound]);
  return <>{shown}</>;
}
