import type { SVGProps } from 'react';

// The four HOW IT WORKS icons: one small line drawing per step (24 × 24, drawn in the step's own colour). Decorative only — the words
// beside them carry the meaning — so they are aria-hidden by their wrapper.

type P = SVGProps<SVGSVGElement>;
const base: P = { viewBox: '0 0 24 24', width: 22, height: 22, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

/** Step 1 — open a game: a game controller. */
export const StepGame = (p: P) => (
  <svg {...base} {...p}>
    <path d="M7 8h10a5 5 0 0 1 4.8 6.4l-.6 2.2a2.4 2.4 0 0 1-4 1.1L15 15.5H9L6.8 17.7a2.4 2.4 0 0 1-4-1.1l-.6-2.2A5 5 0 0 1 7 8Z" />
    <path d="M7.5 10.6v3M6 12.1h3" />
    <circle cx="15.6" cy="11" r=".7" fill="currentColor" />
    <circle cx="17.8" cy="13" r=".7" fill="currentColor" />
  </svg>
);

/** Step 2 — enter your name, host or join with a code: a key. */
export const StepKey = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="8" cy="12" r="4.2" />
    <path d="M12.2 12H21M17.5 12v3M20.6 12v2" />
    <circle cx="8" cy="12" r="1" fill="currentColor" />
  </svg>
);

/** Step 3 — wait in the lobby until the host starts: a small crowd. */
export const StepLobby = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8.5" r="3" />
    <path d="M3.2 19.5a5.8 5.8 0 0 1 11.6 0" />
    <circle cx="17" cy="9.6" r="2.3" />
    <path d="M16.6 14.2a4.6 4.6 0 0 1 4.6 5.3" />
  </svg>
);

/** Step 4 — points add up on one leaderboard: a trophy. */
export const StepTrophy = (p: P) => (
  <svg {...base} {...p}>
    <path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0V4Z" />
    <path d="M7.5 6H4.6c0 3 1.4 4.6 3.4 4.8M16.5 6h2.9c0 3-1.4 4.6-3.4 4.8" />
    <path d="M12 13.5V17M8.5 20h7M9.8 17h4.4" />
  </svg>
);
