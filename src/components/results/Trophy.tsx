import { useId } from 'react';

export type Metal = 'gold' | 'silver' | 'bronze';

// Four tones per metal, light to dark: the highlight, the face, the shade and the edge.
const METALS: Record<Metal, readonly [string, string, string, string]> = {
  gold: ['#fff6c2', '#ffd04a', '#c88a0a', '#7a4d02'],
  silver: ['#ffffff', '#d3d9e8', '#8c95ad', '#4a5168'],
  bronze: ['#ffe0c2', '#e49a58', '#a8601f', '#5c3010'],
};

/** The metal of a finishing place: 1st gold, 2nd silver, 3rd bronze (an equal place gets the same metal). */
export const metalFor = (rank: number): Metal => (rank <= 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze');

/** A cup with handles in a metal finish (drawn in SVG), with a glint that crosses it now and then (CSS `.rc-shine`). */
export function Trophy({ metal, className = '' }: { metal: Metal; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [hi, face, shade, edge] = METALS[metal];
  return (
    <svg className={`rc-trophy ${className}`} viewBox="0 0 80 100" aria-hidden>
      <defs>
        <linearGradient id={`${uid}m`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={hi} />
          <stop offset="0.38" stopColor={face} />
          <stop offset="0.72" stopColor={shade} />
          <stop offset="1" stopColor={edge} />
        </linearGradient>
        <linearGradient id={`${uid}h`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={edge} />
          <stop offset="0.45" stopColor={face} />
          <stop offset="1" stopColor={edge} />
        </linearGradient>
        <clipPath id={`${uid}c`}>
          <path d="M16 8 H64 V32 C64 48 54 58 42 60 H38 C26 58 16 48 16 32 Z M35 60 H45 L47 74 H33 Z M24 74 H56 L60 86 H20 Z M16 86 H64 V95 H16 Z" />
        </clipPath>
      </defs>
      <path d="M19 16 C5 16 5 40 25 46" fill="none" stroke={`url(#${uid}h)`} strokeWidth="5.5" strokeLinecap="round" />
      <path d="M61 16 C75 16 75 40 55 46" fill="none" stroke={`url(#${uid}h)`} strokeWidth="5.5" strokeLinecap="round" />
      <path d="M16 8 H64 V32 C64 48 54 58 42 60 H38 C26 58 16 48 16 32 Z" fill={`url(#${uid}m)`} />
      <rect x="13" y="5" width="54" height="7" rx="3.5" fill={`url(#${uid}h)`} />
      <path d="M35 60 H45 L47 74 H33 Z" fill={`url(#${uid}m)`} />
      <path d="M24 74 H56 L60 86 H20 Z" fill={`url(#${uid}m)`} />
      <rect x="16" y="86" width="48" height="9" rx="3" fill={`url(#${uid}h)`} />
      <path d="M22 13 H33 V33 C33 43 29 50 26 51 C22 47 20 40 20 32 Z" fill="#fff" opacity="0.32" />
      <path d="M40 19 l3.6 7.4 8.1 1.2 -5.9 5.7 1.4 8 -7.2 -3.9 -7.2 3.9 1.4 -8 -5.9 -5.7 8.1 -1.2z" fill="#fff" opacity="0.55" />
      <g clipPath={`url(#${uid}c)`}>
        <rect className="rc-shine" x="-24" y="0" width="14" height="100" fill="#fff" opacity="0.7" transform="skewX(-18)" />
      </g>
    </svg>
  );
}
