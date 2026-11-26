import { useId, type CSSProperties } from 'react';
import { poseById } from '../../../shared/poses';
import { PoseDrawing } from '../../portal/PoseDrawing';
import { CardBack, CardFace, JokerFace } from '../cards/CardArt';

// The artwork on the Funny Pose Challenge, Playing Cards and Tech Trivia landing pages (the name / host / join page opened for those two games). Both are
// pictures drawn in SVG / CSS — no images, no data from the room — and every motion is a CSS class in src/games.css that is off under
// reduced motion. TypeDrive's landing page has its own scene and does not use this file.

/** Facts shown under each game's introduction, taken from the rules of the game (see README). */
export const GAME_FACTS = {
  pose: ['6 rounds · 2 per team', '24 funny poses', '+10 pts a round'],
  cards: ['10 rounds', '3–5 cards', 'First right: +10 pts'],
  trivia: ['5 questions', '15 s to answer', 'First correct: +10 pts'],
} as const;

// ------------------------------------------------------------------------------------------------ Funny Pose Challenge
/** Five of the game's own poses on a game-show stage, each under a coloured spotlight (the centre one is the star). */
const CAST = [
  { id: 'shocked', c: '#35e6d8', rgb: '53, 230, 216' },
  { id: 'laughing', c: '#ffd04a', rgb: '255, 208, 74' },
  { id: 'superhero', c: '#ff5fa8', rgb: '255, 95, 168' },
  { id: 'confused', c: '#b98cff', rgb: '185, 140, 255' },
  { id: 'disco', c: '#ff8a3d', rgb: '255, 138, 61' },
] as const;

export function PoseStage() {
  return (
    <section className="gl-stage gl-pose-stage" aria-hidden>
      <div className="gl-curtain gl-curtain-l" />
      <div className="gl-curtain gl-curtain-r" />
      <div className="gl-marquee">
        {Array.from({ length: 30 }, (_, i) => (
          <i key={i} style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
      <ol className="gl-cast">
        {CAST.map((a, i) => {
          const pose = poseById(a.id);
          if (!pose) return null;
          return (
            <li key={a.id} className={`gl-actor${i === 2 ? ' star' : ''}`} style={{ '--i': i, '--c': a.c, '--c-rgb': a.rgb } as CSSProperties}>
              <span className="gl-beam" />
              <PoseDrawing figure={pose.figure} className="gl-fig" />
              <span className="gl-pool" />
              <span className="gl-plate">{pose.title}</span>
            </li>
          );
        })}
      </ol>
      <div className="gl-boards" />
      <div className="gl-confetti">
        {Array.from({ length: 16 }, (_, i) => (
          <i key={i} style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ Tech Trivia
/** The five topics of the quiz as small glowing badges that float around the question. Plain symbols, not logos. */
const TOPICS = [
  { key: 'python', label: 'Python', x: 150, y: 118, c: '#ffd04a' },
  { key: 'sql', label: 'SQL', x: 112, y: 262, c: '#35e6d8' },
  { key: 'ai', label: 'AI', x: 952, y: 104, c: '#b98cff' },
  { key: 'cloud', label: 'Cloud', x: 996, y: 250, c: '#6fc0ff' },
  { key: 'git', label: 'Git', x: 808, y: 82, c: '#ff8a3d' },
] as const;

function TopicGlyph({ k, c }: { k: (typeof TOPICS)[number]['key']; c: string }) {
  const s = { fill: 'none', stroke: c, strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  switch (k) {
    case 'python':
      return (
        <g {...s}>
          <path d="M-14 -6 V-14 Q-14 -20 -8 -20 H4 Q10 -20 10 -14 V-4 Q10 0 6 0 H-6 Q-10 0 -10 4 V10 Q-10 14 -6 14 H-14 Q-20 14 -20 8 V-2 Q-20 -6 -14 -6 Z" />
          <path d="M14 6 V14 Q14 20 8 20 H-4 Q-10 20 -10 14" />
          <circle cx="-3" cy="-13" r="1.6" fill={c} stroke="none" />
        </g>
      );
    case 'sql':
      return (
        <g {...s}>
          <ellipse cx="0" cy="-12" rx="16" ry="6" />
          <path d="M-16 -12 V12 Q-16 18 0 18 Q16 18 16 12 V-12" />
          <path d="M-16 0 Q-16 6 0 6 Q16 6 16 0" />
        </g>
      );
    case 'ai':
      return (
        <g {...s}>
          <rect x="-14" y="-14" width="28" height="28" rx="6" />
          <path d="M-14 -7 H-21 M-14 0 H-21 M-14 7 H-21 M14 -7 H21 M14 0 H21 M14 7 H21 M-7 -14 V-21 M0 -14 V-21 M7 -14 V-21 M-7 14 V21 M0 14 V21 M7 14 V21" strokeWidth="2" />
          <path d="M-6 6 L0 -7 L6 6 M-3 2 H3" strokeWidth="2.6" />
        </g>
      );
    case 'cloud':
      return (
        <g {...s}>
          <path d="M-16 10 Q-24 10 -24 2 Q-24 -6 -15 -6 Q-13 -18 0 -18 Q12 -18 14 -7 Q24 -6 24 3 Q24 10 16 10 Z" />
          <path d="M0 14 V-1 M-6 5 L0 -1 L6 5" strokeWidth="2.6" />
        </g>
      );
    case 'git':
      return (
        <g {...s}>
          <circle cx="-10" cy="-14" r="5" />
          <circle cx="-10" cy="14" r="5" />
          <circle cx="12" cy="-4" r="5" />
          <path d="M-10 -9 V9 M-10 4 Q-10 -4 7 -4" />
        </g>
      );
  }
}

/** A digital quiz arena: a giant glowing question mark over a lit stage, the five topics floating around it, four answer panels. */
// ------------------------------------------------------------------------------------------------ Playing Cards
/** A green card table: four cards face down in an arc, the joker lifted in the middle under a warm light. */
export function CardTable() {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const cards = [
    { x: 236, r: -14, y: 150 },
    { x: 378, r: -6, y: 118 },
    { x: 642, r: 6, y: 118 },
    { x: 784, r: 14, y: 150 },
  ];
  return (
    <section className="gl-stage gl-cards-stage" aria-hidden>
      <svg viewBox="0 0 1100 380" preserveAspectRatio="xMidYMid slice" className="gl-arena">
        <defs>
          <radialGradient id={`${uid}felt`} cx="0.5" cy="0.4" r="0.8">
            <stop offset="0" stopColor="#14a372" />
            <stop offset="0.55" stopColor="#0b6e4d" />
            <stop offset="1" stopColor="#042a1e" />
          </radialGradient>
          <radialGradient id={`${uid}glow`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff1bf" stopOpacity="0.9" />
            <stop offset="1" stopColor="#fff1bf" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1100" height="380" fill={`url(#${uid}felt)`} />
        <ellipse cx="550" cy="210" rx="500" ry="170" fill="none" stroke="#f3c969" strokeOpacity="0.3" strokeWidth="3" />
        <ellipse cx="550" cy="190" rx="180" ry="150" fill={`url(#${uid}glow)`} className="gl-cards-glow" />
        {cards.map((c, i) => (
          <g key={i} className="gl-card-bob" style={{ '--i': i } as CSSProperties}>
            <g transform={`rotate(${c.r} ${c.x + 40} ${c.y + 112})`}>
              {i === 1 ? <CardFace x={c.x} y={c.y} width={80} height={112} rank="K" suit="♥" /> : <CardBack x={c.x} y={c.y} width={80} height={112} />}
            </g>
          </g>
        ))}
        <g className="gl-joker">
          <JokerFace x={496} y={64} width={108} height={151} />
        </g>
        <g fontFamily="Georgia, serif" fontWeight="700" fontSize="44" fill="#f3c969" fillOpacity="0.4">
          <text x="80" y="330">♠</text>
          <text x="150" y="356">♥</text>
          <text x="930" y="350">♦</text>
          <text x="1000" y="320">♣</text>
        </g>
      </svg>
    </section>
  );
}

export function TriviaArena() {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const panels = [
    { x: 270, t: 'A', c: '#4aa3ff' },
    { x: 436, t: 'B', c: '#35e6d8' },
    { x: 602, t: 'C', c: '#2ee86b', hot: true },
    { x: 768, t: 'D', c: '#ffcf4a' },
  ];
  return (
    <section className="gl-stage gl-arena-stage" aria-hidden>
      <svg viewBox="0 0 1100 380" preserveAspectRatio="xMidYMid slice" className="gl-arena">
        <defs>
          <linearGradient id={`${uid}q`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f4faff" />
            <stop offset="0.45" stopColor="#9fd0ff" />
            <stop offset="1" stopColor="#2f86ff" />
          </linearGradient>
          <radialGradient id={`${uid}g`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#4aa3ff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#4aa3ff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${uid}b`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#bfe4ff" stopOpacity="0.38" />
            <stop offset="1" stopColor="#bfe4ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${uid}f`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0a1c4e" />
            <stop offset="1" stopColor="#050a26" />
          </linearGradient>
        </defs>

        {/* the arena: back wall, light beams, a perspective floor with rings */}
        <rect width="1100" height="380" fill="#060b2c" />
        <path className="gl-beam-a" d="M250 0 L120 250 L520 250 Z" fill={`url(#${uid}b)`} />
        <path className="gl-beam-b" d="M850 0 L580 250 L980 250 Z" fill={`url(#${uid}b)`} />
        <path d="M0 262 H1100 V380 H0 Z" fill={`url(#${uid}f)`} />
        <g stroke="#2a62d6" strokeWidth="1" opacity="0.5" fill="none">
          <path d="M550 262 L-80 380 M550 262 L120 380 M550 262 L330 380 M550 262 L550 380 M550 262 L770 380 M550 262 L980 380 M550 262 L1180 380" />
          <path d="M0 282 H1100 M0 306 H1100 M0 336 H1100" />
        </g>
        <ellipse className="gl-ring-a" cx="550" cy="270" rx="300" ry="26" fill="none" stroke="#4aa3ff" strokeWidth="2" opacity="0.7" />
        <ellipse className="gl-ring-b" cx="550" cy="270" rx="210" ry="17" fill="none" stroke="#35e6d8" strokeWidth="1.6" opacity="0.6" />

        {/* circuit traces from the question to each topic */}
        <g className="gl-traces" fill="none" stroke="#4aa3ff" strokeWidth="1.6" strokeDasharray="4 7" opacity="0.7">
          {TOPICS.map((t) => (
            <path key={t.key} d={`M550 150 Q${(550 + t.x) / 2} ${t.y - 30} ${t.x} ${t.y}`} />
          ))}
        </g>

        {/* the question mark, on its glowing plinth */}
        <circle cx="550" cy="150" r="150" fill={`url(#${uid}g)`} />
        <g className="gl-q">
          <text x="550" y="246" textAnchor="middle" fontSize="236" fontWeight="900" fontStyle="italic" fill="#0a2a6c" transform="translate(7 8)" fontFamily="Outfit Variable, Outfit, system-ui, sans-serif">
            ?
          </text>
          <text x="550" y="246" textAnchor="middle" fontSize="236" fontWeight="900" fontStyle="italic" fill={`url(#${uid}q)`} stroke="#0d3a99" strokeWidth="2" fontFamily="Outfit Variable, Outfit, system-ui, sans-serif">
            ?
          </text>
        </g>

        {/* the topics, floating */}
        {TOPICS.map((t, i) => (
          <g key={t.key} className={`gl-t gl-t-${t.key}`} transform={`translate(${t.x} ${t.y})`}>
            <g className="gl-ico" style={{ '--i': i } as CSSProperties}>
              <circle r="38" fill="#071236" stroke={t.c} strokeWidth="2" opacity="0.95" />
              <circle r="38" fill="none" stroke={t.c} strokeWidth="1" opacity="0.4" transform="scale(1.18)" />
              <TopicGlyph k={t.key} c={t.c} />
              <text y="58" textAnchor="middle" fontSize="13" fontWeight="800" letterSpacing="2" fill={t.c} fontFamily="JetBrains Mono Variable, monospace">
                {t.label.toUpperCase()}
              </text>
            </g>
          </g>
        ))}

        {/* four answer panels on the stage */}
        {panels.map((p, i) => (
          <g key={p.t} className={`gl-panel${p.hot ? ' gl-hot' : ''}`} style={{ '--i': i } as CSSProperties}>
            <rect x={p.x} y="292" width="150" height="50" rx="10" fill={p.hot ? '#0e3b22' : '#08113a'} stroke={p.c} strokeWidth={p.hot ? 3 : 1.6} />
            <rect x={p.x + 10} y="303" width="28" height="28" rx="7" fill={p.c} opacity={p.hot ? 1 : 0.85} />
            <text x={p.x + 24} y="323" textAnchor="middle" fontSize="18" fontWeight="900" fill="#04102c" fontFamily="JetBrains Mono Variable, monospace">
              {p.t}
            </text>
            <rect x={p.x + 48} y="306" width="82" height="5" rx="2.5" fill={p.c} opacity="0.55" />
            <rect x={p.x + 48} y="319" width="54" height="5" rx="2.5" fill={p.c} opacity="0.35" />
          </g>
        ))}

        {/* particles rising through the light */}
        <g className="gl-motes" fill="#9fd0ff">
          {Array.from({ length: 18 }, (_, i) => (
            <circle key={i} cx={40 + ((i * 59) % 1030)} cy={360 - ((i * 37) % 180)} r={1.4 + (i % 3) * 0.6} style={{ '--i': i } as CSSProperties} />
          ))}
        </g>
      </svg>
    </section>
  );
}
