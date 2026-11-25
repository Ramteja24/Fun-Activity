import { useId } from 'react';

// Playing-card artwork for "Playing Cards": the back, the plain faces and the joker. Each is one SVG on a 100 × 140 card, so it can
// sit in an HTML card (the game) or be nested inside a larger SVG picture (the dashboard and landing art). Ids come from useId.

export type Suit = '♠' | '♥' | '♦' | '♣';
const RED = new Set<Suit>(['♥', '♦']);

/** The card back: deep green with a gold lattice and a GANTEC-orange centre medallion. */
export function CardBack({ x, y, width, height }: { x?: number; y?: number; width?: number | string; height?: number | string }) {
  const u = useId();
  return (
    <svg className="card-art" viewBox="0 0 100 140" x={x} y={y} width={width} height={height} aria-hidden>
      <defs>
        <linearGradient id={`${u}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0f6b52" />
          <stop offset="1" stopColor="#063a2c" />
        </linearGradient>
        <pattern id={`${u}p`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 5h10M5 0v10" stroke="#f3c969" strokeOpacity="0.28" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100" height="140" rx="9" fill="#fff" />
      <rect x="5" y="5" width="90" height="130" rx="6" fill={`url(#${u}b)`} />
      <rect x="5" y="5" width="90" height="130" rx="6" fill={`url(#${u}p)`} />
      <rect x="10" y="10" width="80" height="120" rx="4" fill="none" stroke="#f3c969" strokeOpacity="0.7" strokeWidth="1.2" />
      <circle cx="50" cy="70" r="17" fill="#063a2c" stroke="#f3c969" strokeWidth="1.5" />
      <circle cx="50" cy="70" r="11" fill="#f67c01" />
      <path d="M44 70l6-7 6 7-6 7z" fill="#fff" fillOpacity="0.9" />
    </svg>
  );
}

/** A plain face: rank in two corners and a big suit pip in the middle. */
export function CardFace({ rank, suit, x, y, width, height }: { rank: string; suit: Suit; x?: number; y?: number; width?: number | string; height?: number | string }) {
  const ink = RED.has(suit) ? '#c8243a' : '#1a1f33';
  return (
    <svg className="card-art" viewBox="0 0 100 140" x={x} y={y} width={width} height={height} aria-hidden>
      <rect width="100" height="140" rx="9" fill="#fff" />
      <rect x="1" y="1" width="98" height="138" rx="8.5" fill="none" stroke="#d9dce6" />
      <g fill={ink} fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700">
        <text x="11" y="25" fontSize="20">
          {rank}
        </text>
        <text x="12" y="42" fontSize="15">
          {suit}
        </text>
        <g transform="rotate(180 50 70)">
          <text x="11" y="25" fontSize="20">
            {rank}
          </text>
          <text x="12" y="42" fontSize="15">
            {suit}
          </text>
        </g>
        <text x="50" y="87" fontSize="50" textAnchor="middle">
          {suit}
        </text>
      </g>
    </svg>
  );
}

/** The joker: a grinning jester with a three-point belled hat, on a warm gold card. */
export function JokerFace({ x, y, width, height }: { x?: number; y?: number; width?: number | string; height?: number | string }) {
  const u = useId();
  return (
    <svg className="card-art joker-art" viewBox="0 0 100 140" x={x} y={y} width={width} height={height} aria-hidden>
      <defs>
        <linearGradient id={`${u}j`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff7e0" />
          <stop offset="1" stopColor="#ffe2a8" />
        </linearGradient>
      </defs>
      <rect width="100" height="140" rx="9" fill={`url(#${u}j)`} />
      <rect x="1" y="1" width="98" height="138" rx="8.5" fill="none" stroke="#e9b44c" strokeWidth="1.5" />
      <g fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fill="#7c2d12" fontSize="9" letterSpacing="0.5">
        <text x="9" y="16">
          J
        </text>
        <text x="9" y="26">
          O
        </text>
        <text x="9" y="36">
          K
        </text>
        <text x="9" y="46">
          E
        </text>
        <text x="9" y="56">
          R
        </text>
      </g>
      {/* hat: three floppy points with bells */}
      <path d="M30 60 L22 30 Q36 40 42 50 L50 22 L58 50 Q64 40 78 30 L70 60 Z" fill="#7c3aed" />
      <path d="M42 50 L50 22 L58 50 Q54 56 50 56 Q46 56 42 50 Z" fill="#f67c01" />
      <path d="M30 60 L22 30 Q36 40 42 50 Q38 58 30 60Z" fill="#db2777" />
      <circle cx="22" cy="29" r="4" fill="#facc15" stroke="#a16207" strokeWidth="1" />
      <circle cx="50" cy="21" r="4" fill="#facc15" stroke="#a16207" strokeWidth="1" />
      <circle cx="78" cy="29" r="4" fill="#facc15" stroke="#a16207" strokeWidth="1" />
      <rect x="28" y="57" width="44" height="7" rx="3.5" fill="#facc15" />
      {/* face */}
      <ellipse cx="50" cy="80" rx="17" ry="18" fill="#fde7d4" stroke="#7c2d12" strokeWidth="1.2" />
      <path d="M41 74 q3 -3 6 0" stroke="#1a1f33" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M53 74 q3 -3 6 0" stroke="#1a1f33" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="40" cy="83" r="3" fill="#f472b6" fillOpacity="0.6" />
      <circle cx="60" cy="83" r="3" fill="#f472b6" fillOpacity="0.6" />
      <path d="M41 86 Q50 97 59 86 Q50 91 41 86Z" fill="#b91c1c" />
      <path d="M44 87.5 Q50 90 56 87.5" stroke="#fff" strokeWidth="1.5" fill="none" />
      {/* ruff collar */}
      <path d="M28 100 l7 -6 l7 6 l8 -6 l8 6 l7 -6 l7 6 l-3 9 h-38z" fill="#fff" stroke="#7c3aed" strokeWidth="1.2" />
      <circle cx="35" cy="104" r="2" fill="#db2777" />
      <circle cx="50" cy="104" r="2" fill="#f67c01" />
      <circle cx="65" cy="104" r="2" fill="#7c3aed" />
      <text x="50" y="128" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="11" fill="#7c2d12" letterSpacing="2">
        JOKER
      </text>
    </svg>
  );
}

/** The plain faces dealt beside the joker, in order (the joker takes one card's place). */
export const PLAIN_FACES: readonly { rank: string; suit: Suit }[] = [
  { rank: 'A', suit: '♠' },
  { rank: 'K', suit: '♥' },
  { rank: 'Q', suit: '♣' },
  { rank: 'J', suit: '♦' },
  { rank: '10', suit: '♠' },
];
