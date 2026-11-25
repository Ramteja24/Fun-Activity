import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { STAGE_MS } from '../../shared/protocol';
import { engine, socket } from '../store';
import { countdownStage, type CountdownStage } from './countdown';
import { laneHeightFor } from './sizing';

export type { CountdownStage };

/** Re-render whenever the race engine changes (keystroke, rank change, lane change, HUD tick). */
export function useEngine(): number {
  return useSyncExternalStore(engine.subscribe, engine.getVersion);
}

/** 3 → 2 → 1 → GO (0) → hidden (null), driven by the server clock so every device agrees. */
export function useCountdown(goAt: number, stageMs = STAGE_MS): CountdownStage {
  const compute = (): CountdownStage => countdownStage(goAt, socket.serverNow(), stageMs);
  const [stage, setStage] = useState<CountdownStage>(compute);
  useEffect(() => {
    setStage(compute());
    const id = window.setInterval(() => setStage((prev) => {
      const next = compute();
      return next === prev ? prev : next;
    }), 40);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goAt, stageMs]);
  return stage;
}

/**
 * Sizes the whole race stage from a single "lane height" (see `laneHeightFor`): it grows with the screen width and
 * shrinks to fit the *visible* viewport, so the typing bar stays above the on-screen keyboard on phones
 * (iOS/Android shrink the visual viewport, not the layout viewport).
 */
export function useStageSizing(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const vv = window.visualViewport;
    const apply = () => {
      const el = ref.current;
      if (!el) return;
      const w = el.parentElement?.clientWidth || window.innerWidth;
      // the 40-player demo (src/demo) keeps a control bar across the top of the window: the stage fits below it (0 when there is no bar)
      const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--demo-h')) || 0;
      const h = (vv ? vv.height : window.innerHeight) - bar;
      el.style.setProperty('--lane-h', `${laneHeightFor(w, h).toFixed(1)}px`);
      // the big-field road uses the whole visible height instead of the five-lane stage's (see field.css)
      el.style.setProperty('--stage-h', `${Math.max(320, Math.floor(h) - 12)}px`);
      if (vv && vv.offsetTop > 0) window.scrollTo(0, 0);
    };
    apply();
    vv?.addEventListener('resize', apply);
    vv?.addEventListener('scroll', apply);
    window.addEventListener('resize', apply);
    return () => {
      vv?.removeEventListener('resize', apply);
      vv?.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
    };
  }, [ref]);
}

/** Latest value in a ref (for rAF/timer callbacks). */
export function useLatest<T>(value: T): RefObject<T> {
  const r = useRef(value);
  r.current = value;
  return r;
}
