import { memo } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { BOARD_TEXT } from '../../brand';

// The stands behind the track: three tiles of cheering spectators (so the crowd loops without a gap as it slides with the race),
// floodlights, bunting, and a barrier of sponsor boards at the track edge. Spectators are <use> copies of a few shared shapes; each
// group switches between two arm poses with one opacity animation per pose layer (see ui/race.css), never per spectator.

const TILE_W = 1600;
const TILE_H = 115;
const TILES = 3;
const BOARDS = 18;

/** A small seeded random generator, so the crowd is the same on every screen and every visit. */
function seeded(seed: number) {
  let t = seed;
  return () => {
    t = (t + 1831565813) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const ACCENTS = ['#ff8a24', '#35e6d8', '#8b5cf6', '#eef1ff', '#ffcf4a', '#ff5d8f'];
/** The two arm poses of each of the three front groups (the flag-wavers keep their own). */
const POSES: [string, string][] = [
  ['up', 'down'],
  ['left', 'right'],
  ['clap', 'wide'],
];

interface Person {
  x: number;
  accent: string | null;
  flag: string;
}

function people(n: number, seed: number, accentShare: number): Person[] {
  const rnd = seeded(seed);
  const step = TILE_W / n;
  return Array.from({ length: n }, (_, i) => ({
    x: (i + 0.5) * step + (rnd() - 0.5) * step * 0.28,
    accent: rnd() < accentShare ? ACCENTS[Math.floor(rnd() * ACCENTS.length)]! : null,
    flag: ACCENTS[Math.floor(rnd() * 3)]!,
  }));
}

const FRONT = people(34, 7, 0.3);
const BACK = people(40, 23, 0.2);
const waves = (i: number) => i % 5 === 2;
const LIGHTS = [160, 560, 960, 1360];
const FLAGS = Array.from({ length: 32 }, (_, i) => {
  const x = 25 + i * 50;
  return { x, y: 30 + 7 * Math.sin((2 * Math.PI * x) / 400), c: ['#ff8a24', '#eef1ff', '#8b5cf6', '#35e6d8'][i % 4]! };
});
const BUNTING = Array.from({ length: 81 }, (_, i) => `${i * 20},${(30 + 7 * Math.sin((2 * Math.PI * i * 20) / 400)).toFixed(1)}`).join(' ');

/** The shared shapes: a body (plain, or in an accent colour), the arm poses, the floodlight glow. */
function CrowdDefs() {
  const torso = 'M-7 0 V-14 Q-7 -22 0 -22 Q7 -22 7 -14 V0 Z';
  return (
    <svg className="cr-defs" width="0" height="0" aria-hidden focusable="false">
      <defs>
        <radialGradient id="cr-glow">
          <stop offset="0" stopColor="#fff4d2" stopOpacity="0.62" />
          <stop offset="0.35" stopColor="#ffe9b0" stopOpacity="0.2" />
          <stop offset="1" stopColor="#ffe9b0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cr-cone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff2cc" stopOpacity="0.16" />
          <stop offset="1" stopColor="#fff2cc" stopOpacity="0" />
        </linearGradient>
        <g id="cr-body" fill="currentColor">
          <path d={torso} />
          <circle cx="0" cy="-28.5" r="5.6" />
        </g>
        <g id="cr-bodyA" fill="currentColor">
          <path d={torso} style={{ fill: 'var(--a)' } as CSSProperties} />
          <circle cx="0" cy="-28.5" r="5.6" />
        </g>
        <g id="cr-up" className="cr-arm">
          <path d="M-6 -19 L-11.5 -35 M6 -19 L11.5 -35" />
          <circle cx="-11.5" cy="-35.6" r="2.4" />
          <circle cx="11.5" cy="-35.6" r="2.4" />
        </g>
        <g id="cr-down" className="cr-arm">
          <path d="M-6.5 -18 L-9.8 -6 M6.5 -18 L9.8 -6" />
          <circle cx="-9.8" cy="-5.4" r="2.2" />
          <circle cx="9.8" cy="-5.4" r="2.2" />
        </g>
        <g id="cr-left" className="cr-arm">
          <path d="M-6 -19 L-11.5 -35 M6.5 -18 L9.8 -6" />
          <circle cx="-11.5" cy="-35.6" r="2.4" />
          <circle cx="9.8" cy="-5.4" r="2.2" />
        </g>
        <g id="cr-right" className="cr-arm">
          <path d="M6 -19 L11.5 -35 M-6.5 -18 L-9.8 -6" />
          <circle cx="11.5" cy="-35.6" r="2.4" />
          <circle cx="-9.8" cy="-5.4" r="2.2" />
        </g>
        <g id="cr-clap" className="cr-arm">
          <path d="M-6 -18 L-1.6 -13.5 M6 -18 L1.6 -13.5" />
          <circle cx="0" cy="-13" r="2.8" />
        </g>
        <g id="cr-wide" className="cr-arm">
          <path d="M-6 -19 L-15 -31 M6 -19 L15 -31" />
          <circle cx="-15.4" cy="-31.6" r="2.4" />
          <circle cx="15.4" cy="-31.6" r="2.4" />
        </g>
        <g id="cr-flag" className="cr-arm">
          <path d="M6 -19 L11.5 -35 M-6.5 -18 L-9.8 -6" />
          <circle cx="-9.8" cy="-5.4" r="2.2" />
          <path d="M11.5 -35 L11.5 -49" strokeWidth="1.2" />
          <path d="M11.5 -49 L22 -45 L11.5 -41 Z" style={{ fill: 'var(--f)', stroke: 'none' } as CSSProperties} />
        </g>
      </defs>
    </svg>
  );
}

const ref = (pose: string) => `#cr-${pose}`;
const paint = (p: Person): CSSProperties => (p.accent ? { '--a': p.accent, '--f': p.flag } : { '--f': p.flag }) as unknown as CSSProperties;

function CrowdTile({ index }: { index: number }) {
  const groups = [0, 1, 2].map((g) => FRONT.map((p, i) => ({ p, i })).filter(({ i }) => i % 3 === g));
  return (
    <svg className="cr-tile" viewBox={`0 0 ${TILE_W} ${TILE_H}`} preserveAspectRatio="xMinYMax slice" aria-hidden focusable="false" data-tile={index}>
      {LIGHTS.map((x) => (
        <g key={x}>
          <circle cx={x} cy="10" r="48" fill="url(#cr-glow)" />
          <polygon points={`${x - 24},13 ${x + 24},13 ${x + 78},108 ${x - 78},108`} fill="url(#cr-cone)" />
          <rect x={x - 1.3} y="13" width="2.6" height="96" fill="#0a2a30" />
          <rect x={x - 27} y="5" width="54" height="8" rx="2" fill="#1b323a" />
          {[-20, -10, 0, 10, 20].map((d) => (
            <circle key={d} cx={x + d} cy="9" r="2.4" fill="#fff6dc" />
          ))}
        </g>
      ))}
      <polyline points={BUNTING} fill="none" stroke="#0a2a30" strokeWidth="1.2" />
      {FLAGS.map((f) => (
        <polygon key={f.x} points={`${f.x - 4.5},${f.y} ${f.x + 4.5},${f.y} ${f.x},${f.y + 10}`} fill={f.c} opacity="0.92" />
      ))}
      <g className="cr-row cr-back">
        <g transform="translate(0 94) scale(0.8)">
          {BACK.map((p, i) => (
            <use key={i} href={p.accent ? '#cr-bodyA' : '#cr-body'} x={p.x / 0.8} style={paint(p)} />
          ))}
          <g className="cr-p cr-p1">
            {BACK.map((p, i) => (
              <use key={i} href={ref(i % 2 ? 'up' : 'left')} x={p.x / 0.8} className="cr-hand" style={paint(p)} />
            ))}
          </g>
          <g className="cr-p cr-p2">
            {BACK.map((p, i) => (
              <use key={i} href={ref(i % 2 ? 'wide' : 'right')} x={p.x / 0.8} className="cr-hand" style={paint(p)} />
            ))}
          </g>
        </g>
      </g>
      <g className="cr-row cr-front">
        {groups.map((members, g) => (
          <g key={g} className={`cr-g cr-g${g}`} transform="translate(0 113)">
            <g className="cr-hop">
              {members.map(({ p, i }) => (
                <use key={i} href={p.accent ? '#cr-bodyA' : '#cr-body'} x={p.x} style={paint(p)} />
              ))}
              <g className="cr-p cr-p1">
                {members.map(({ p, i }) => (
                  <use key={i} href={ref(waves(i) ? 'flag' : POSES[g]![0])} x={p.x} className="cr-hand" style={paint(p)} />
                ))}
              </g>
              <g className="cr-p cr-p2">
                {members.map(({ p, i }) => (
                  <use key={i} href={ref(waves(i) ? 'down' : POSES[g]![1])} x={p.x} className="cr-hand" style={paint(p)} />
                ))}
              </g>
            </g>
          </g>
        ))}
      </g>
    </svg>
  );
}

/**
 * The stands and the sponsor boards. Track.tsx slides crowdRef / boardsRef with the race (parallax). Memoised: its props never change
 * during a race, so the hundreds of figures are built once instead of on every update of the race screen.
 */
export const Crowd = memo(function Crowd({ crowdRef, boardsRef }: { crowdRef: RefObject<HTMLDivElement | null>; boardsRef: RefObject<HTMLDivElement | null> }) {
  return (
    <>
      <CrowdDefs />
      <div className="crowd" aria-hidden>
        <div className="crowd-pan" ref={crowdRef}>
          {Array.from({ length: TILES }, (_, i) => (
            <CrowdTile key={i} index={i} />
          ))}
        </div>
      </div>
      <div className="boards" aria-hidden>
        <div className="boards-pan" ref={boardsRef}>
          {Array.from({ length: BOARDS }, (_, i) => (
            <span key={i} className={`sb sb${i % BOARD_TEXT.length}`}>
              {BOARD_TEXT[i % BOARD_TEXT.length]}
            </span>
          ))}
        </div>
      </div>
    </>
  );
});
