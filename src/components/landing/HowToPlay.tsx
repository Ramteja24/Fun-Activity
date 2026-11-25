import type { SVGProps } from 'react';

// Four short steps under TypeDrive's entry form. They mirror what the game really does: join with a code, wait for the host, only the
// next correct character moves your car, and the results page shows your rank and WPM.

type P = SVGProps<SVGSVGElement>;
const svg = (p: P) => ({ width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p });

const IconEnter = (p: P) => (
  <svg {...svg(p)}>
    <path d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4" />
  </svg>
);
const IconLight = (p: P) => (
  <svg {...svg(p)}>
    <rect x="8" y="2.5" width="8" height="19" rx="3" />
    <circle cx="12" cy="7.5" r="1.4" fill="currentColor" />
    <circle cx="12" cy="12" r="1.4" />
    <circle cx="12" cy="16.5" r="1.4" />
  </svg>
);
const IconKeys = (p: P) => (
  <svg {...svg(p)}>
    <rect x="2" y="6" width="20" height="12" rx="2.5" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
  </svg>
);
const IconPodium = (p: P) => (
  <svg {...svg(p)}>
    <path d="M8 21v-9H3v9h5zM14 21V4h-4v17h4zM21 21v-6h-5v6h5z" />
  </svg>
);

const STEPS = [
  { icon: <IconEnter />, title: 'Join', text: 'Enter your name and join with a room code.' },
  { icon: <IconLight />, title: 'Get ready', text: 'Wait for the host to start.' },
  { icon: <IconKeys />, title: 'Type & race', text: 'Type the passage correctly to move your car.' },
  { icon: <IconPodium />, title: 'Win', text: 'Finish first and check your WPM and rank.' },
];

export function HowToPlay() {
  return (
    <section className="htp" aria-labelledby="htp-title">
      <h2 id="htp-title" className="htp-title">
        How to play
      </h2>
      <ol className="htp-steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className="htp-step">
            <span className="htp-num" aria-hidden>
              {i + 1}
            </span>
            <div className="htp-body">
              <h3>
                {s.icon}
                {s.title}
              </h3>
              <p>{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
