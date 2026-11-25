import type { CSSProperties } from 'react';

/** A few slow sparks drifting up behind the two game-show stages (pure decoration; a fixed scatter, so every render agrees). */
const EMBERS = Array.from({ length: 14 }, (_, i) => ({ x: (i * 37 + 9) % 100, s: 3 + ((i * 7) % 5), d: 11 + ((i * 5) % 9), delay: -((i * 3) % 11), dx: ((i % 5) - 2) * 18 }));

export function Embers() {
  return (
    <div className="arc-embers" aria-hidden>
      {EMBERS.map((e, i) => (
        <i key={i} style={{ '--x': `${e.x}%`, '--s': `${e.s}px`, '--d': `${e.d}s`, '--dl': `${e.delay}s`, '--dx': `${e.dx}px` } as CSSProperties} />
      ))}
    </div>
  );
}
