import { memo, type CSSProperties } from 'react';

export interface ReelItem {
  key: string;
  label: string;
}

/**
 * Where a reel is `p` of the way through its run, in items scrolled: quick at first, slowing to a stop exactly on `target`.
 * The run always passes the whole list at least once or twice, so a short list does not look like a flicker.
 */
export function reelPosition(p: number, count: number, target: number): { pos: number; steps: number } {
  const loops = Math.max(2, Math.ceil(18 / Math.max(1, count)));
  const steps = loops * count + target;
  const t = Math.min(1, Math.max(0, p));
  return { pos: (1 - Math.pow(1 - t, 3)) * steps, steps };
}

// The strip never changes while a reel runs; only --pos on the wrapper does, so React leaves these nodes alone every frame.
const Strip = memo(function Strip({ items, steps }: { items: ReelItem[]; steps: number }) {
  return (
    <ul className="er-strip" aria-hidden>
      {Array.from({ length: steps + 3 }, (_, i) => (
        <li key={i}>{items[i % items.length]!.label}</li>
      ))}
    </ul>
  );
});

/**
 * One slot-machine reel. `progress` (0 → 1) is how far through its run it is; the caller derives it from the server's clock, so
 * every screen shows the same reel at the same moment and a late joiner sees it part-way through. With reduced motion it does not
 * scroll: it says "…" until it would have stopped, then shows the pick.
 */
export function Reel({ items, target, progress, label, reduced = false }: { items: ReelItem[]; target: number; progress: number; label: string; reduced?: boolean }) {
  const done = progress >= 1;
  const { pos, steps } = reelPosition(progress, items.length, target);
  return (
    <div className={`er-reel${done ? ' done' : ''}`} role="group" aria-label={label}>
      <p className="er-reel-label">{label}</p>
      <div className="er-window" style={{ '--pos': pos } as CSSProperties}>
        {reduced ? <span className="er-still">{done ? items[target]?.label : '…'}</span> : <Strip items={items} steps={steps} />}
      </div>
    </div>
  );
}
