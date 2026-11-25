import { memo } from 'react';
import { VEHICLE_TYPES } from '../../shared/protocol';

// Side-view vehicles facing right, modelled on the five in the reel:
// 0 green hatchback ("You" in the reel), 1 pink pickup, 2 orange sport bike, 3 blue supercar, 4 silver coupe.
// 50 distinct looks = 5 types × 10 colour variants (variants hue-rotate the base art and nudge the brightness),
// enough for a full room. Variant 0 keeps the reel's original colours.
// Every vehicle is the same layers: a soft ground shadow and neon underglow, the body (with a glossy sheen, a shaded lower half and
// panel lines clipped to its outline), glass, lights that glow, and wheels whose spokes turn (CSS, see ui/race.css, while it is rolling).

const VARIANT_FILTER = [
  'none',
  'hue-rotate(36deg) saturate(1.15) brightness(0.95)',
  'hue-rotate(72deg) saturate(1.15) brightness(1.05)',
  'hue-rotate(108deg) saturate(1.1) brightness(0.9)',
  'hue-rotate(144deg) saturate(1.15) brightness(1.08)',
  'hue-rotate(180deg) saturate(1.1) brightness(0.92)',
  'hue-rotate(216deg) saturate(1.15) brightness(1.05)',
  'hue-rotate(252deg) saturate(1.1) brightness(0.88)',
  'hue-rotate(288deg) saturate(1.15) brightness(1.1)',
  'hue-rotate(324deg) saturate(1.1) brightness(0.85)',
];

/** Gradients shared by every vehicle (the same definition in each svg, so a repeated id is harmless). */
function Defs() {
  return (
    <defs>
      <linearGradient id="vx-gloss" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
        <stop offset="0.3" stopColor="#fff" stopOpacity="0.14" />
        <stop offset="0.58" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="vx-shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.42" />
      </linearGradient>
      <radialGradient id="vx-shadow">
        <stop offset="0" stopColor="#000" stopOpacity="0.62" />
        <stop offset="0.65" stopColor="#000" stopOpacity="0.26" />
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="vx-under">
        <stop offset="0" stopColor="#35e6d8" stopOpacity="0.55" />
        <stop offset="0.7" stopColor="#35e6d8" stopOpacity="0.14" />
        <stop offset="1" stopColor="#35e6d8" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="vx-head">
        <stop offset="0" stopColor="#fff6c2" stopOpacity="0.95" />
        <stop offset="0.45" stopColor="#ffe58a" stopOpacity="0.4" />
        <stop offset="1" stopColor="#ffe58a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="vx-tail">
        <stop offset="0" stopColor="#ff6666" stopOpacity="0.9" />
        <stop offset="0.5" stopColor="#ff3030" stopOpacity="0.3" />
        <stop offset="1" stopColor="#ff3030" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="vx-rim" cx="0.38" cy="0.32" r="0.8">
        <stop offset="0" stopColor="#f3f6fb" />
        <stop offset="0.6" stopColor="#aab4c4" />
        <stop offset="1" stopColor="#6c778a" />
      </radialGradient>
      <linearGradient id="vx-glass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#9fe3ff" stopOpacity="0.55" />
        <stop offset="1" stopColor="#0d2f3d" stopOpacity="0.2" />
      </linearGradient>
    </defs>
  );
}

function Wheel({ cx, cy = 49, r = 11 }: { cx: number; cy?: number; r?: number }) {
  const s = r * 0.56;
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <circle r={r} fill="#0a0c11" />
      <circle r={r * 0.9} fill="none" stroke="#2a2f3b" strokeWidth={r * 0.13} />
      <circle r={r * 0.62} fill="url(#vx-rim)" />
      <circle r={r * 0.62} fill="none" stroke="#5d687c" strokeWidth="0.9" />
      <g className="spokes">
        {[0, 60, 120].map((a) => (
          <path key={a} d={`M${-s} 0H${s}`} stroke="#566074" strokeWidth={r * 0.17} strokeLinecap="round" transform={`rotate(${a})`} />
        ))}
      </g>
      <circle r={r * 0.17} fill="#1d222c" />
      <circle r={r * 0.07} fill="#c4cddb" />
    </g>
  );
}

/** Ground shadow + neon underglow: first, so everything sits on them. */
function Ground({ w = 54, cx = 65 }: { w?: number; cx?: number }) {
  return (
    <>
      <ellipse cx={cx} cy="58.5" rx={w + 6} ry="4.6" fill="url(#vx-shadow)" />
      <ellipse cx={cx} cy="56.4" rx={w} ry="3.4" fill="url(#vx-under)" />
    </>
  );
}

/** The paint finish, clipped to the body outline: sheen on the upper half, shade on the lower, one broad diagonal reflection. */
function Finish({ id, d, belt }: { id: string; d: string; belt: number }) {
  return (
    <>
      <clipPath id={`vx-cp${id}`}>
        <path d={d} />
      </clipPath>
      <g clipPath={`url(#vx-cp${id})`}>
        <path d={d} fill="url(#vx-gloss)" />
        <rect x="0" y={belt} width="130" height={62 - belt} fill="url(#vx-shade)" />
        <path d="M-6 36L34 10H52L10 44Z" fill="#fff" opacity="0.08" />
        <path d="M0 46.5H130" stroke="#000" strokeWidth="0.8" opacity="0.18" />
      </g>
    </>
  );
}

function Hatchback() {
  const body = 'M8 47C6 39 12 35 24 32C31 20 50 11 70 12C90 13 100 24 108 31C121 33 127 39 125 47L125 52H8Z';
  return (
    <>
      <defs>
        <linearGradient id="v0" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4fe08e" />
          <stop offset="0.45" stopColor="#1fa85c" />
          <stop offset="1" stopColor="#0f6d3a" />
        </linearGradient>
      </defs>
      <Ground />
      <path d={body} fill="url(#v0)" />
      <Finish id="0" d={body} belt={30} />
      <path d="M36 32C41 22 53 17 67 17.5C80 18 88 24 94 32Z" fill="#cdeaf2" />
      <path d="M36 32C41 22 53 17 67 17.5C80 18 88 24 94 32Z" fill="url(#vx-glass)" />
      <path d="M40 31L51 20.5L57 19.5L45 31Z" fill="#fff" opacity="0.32" />
      <path d="M66.5 17.5V32" stroke="#1c8d4e" strokeWidth="2.4" />
      <path d="M30 27C42 14 62 9.5 78 13" stroke="#fff" strokeWidth="1.6" fill="none" opacity="0.38" strokeLinecap="round" />
      <path d="M52 33V46M84 33V46" stroke="#05200f" strokeWidth="0.9" opacity="0.4" />
      <rect x="56" y="36" width="7" height="1.7" rx="0.8" fill="#bff3d2" opacity="0.85" />
      <path d="M95 31L102 29.5L103 32.5Z" fill="#127a41" />
      <rect x="8" y="48" width="117" height="3.4" rx="1.7" fill="#06140c" opacity="0.55" />
      <ellipse cx="9" cy="41" rx="7" ry="5" fill="url(#vx-tail)" />
      <rect x="6" y="41" width="4.5" height="5" rx="1" fill="#ff4d4d" />
      <ellipse cx="119" cy="41" rx="10" ry="7" fill="url(#vx-head)" />
      <ellipse cx="117" cy="41" rx="4.2" ry="3.6" fill="#fff3b0" />
      <circle cx="36" cy="49" r="12.4" fill="#07130c" />
      <circle cx="100" cy="49" r="12.4" fill="#07130c" />
      <Wheel cx={36} r={10.6} />
      <Wheel cx={100} r={10.6} />
    </>
  );
}

function Pickup() {
  const cab = 'M50 52V19L78 15C88 15 93 22 99 31L117 34C124 35 126 41 126 47V52Z';
  const bed = 'M5 52V27H50V52Z';
  return (
    <>
      <defs>
        <linearGradient id="v1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8ac4" />
          <stop offset="0.5" stopColor="#ff3f9d" />
          <stop offset="1" stopColor="#bd1f72" />
        </linearGradient>
      </defs>
      <Ground />
      <path d={bed} fill="url(#v1)" />
      <Finish id="1b" d={bed} belt={36} />
      <path d="M8 31H47" stroke="#8a1352" strokeWidth="2.4" opacity="0.7" />
      <path d="M8 37H47" stroke="#8a1352" strokeWidth="1.2" opacity="0.5" />
      <path d={cab} fill="url(#v1)" />
      <Finish id="1c" d={cab} belt={32} />
      <path d="M57 21L77 18.5C84 18.5 88 24 93 31H57Z" fill="#d6edf5" />
      <path d="M57 21L77 18.5C84 18.5 88 24 93 31H57Z" fill="url(#vx-glass)" />
      <path d="M60 30L68 20.5L73 19.8L65 30Z" fill="#fff" opacity="0.32" />
      <path d="M50 31V52" stroke="#8a1352" strokeWidth="1.6" opacity="0.7" />
      <path d="M72 33V47" stroke="#4a0a2c" strokeWidth="0.9" opacity="0.4" />
      <rect x="76" y="36" width="7" height="1.7" rx="0.8" fill="#ffd0e6" opacity="0.85" />
      <rect x="5" y="49" width="121" height="3.4" rx="1.7" fill="#1d0613" opacity="0.55" />
      <ellipse cx="6" cy="32" rx="7" ry="5.5" fill="url(#vx-tail)" />
      <rect x="4" y="29" width="4" height="6" rx="1" fill="#ff4d4d" />
      <ellipse cx="121" cy="41" rx="10" ry="7" fill="url(#vx-head)" />
      <ellipse cx="120" cy="41" rx="4" ry="3.4" fill="#fff3b0" />
      <circle cx="26" cy="49" r="12.4" fill="#2a0a1c" />
      <circle cx="98" cy="49" r="12.4" fill="#2a0a1c" />
      <Wheel cx={26} r={10.8} />
      <Wheel cx={98} r={10.8} />
    </>
  );
}

function Bike() {
  const tank = 'M50 38C54 28 66 24 79 26L95 31L104 37L98 42L56 42Z';
  return (
    <>
      <defs>
        <linearGradient id="v2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffb25a" />
          <stop offset="0.5" stopColor="#ff7a1a" />
          <stop offset="1" stopColor="#c2480a" />
        </linearGradient>
      </defs>
      <Ground w={46} />
      {/* rider */}
      <path d="M44 33L54 17L68 15L80 26L74 30L66 24L58 28L52 36Z" fill="#232733" />
      <path d="M54 18L67 16L72 20L58 22Z" fill="#fff" opacity="0.1" />
      <circle cx="64" cy="9.5" r="6.6" fill="#ff8a1f" />
      <path d="M62.5 6.5H70.8V12H62.5Z" fill="#1b1f2b" opacity="0.88" />
      <path d="M64 5.5C66 4.4 69 4.8 70 6.6" stroke="#fff" strokeWidth="1.3" fill="none" opacity="0.55" strokeLinecap="round" />
      {/* bodywork */}
      <path d={tank} fill="url(#v2)" />
      <Finish id="2" d={tank} belt={36} />
      <path d="M32 34L52 32L56 39L34 41Z" fill="#202430" />
      <path d="M100 51L89 25" stroke="#c9d1db" strokeWidth="3" strokeLinecap="round" />
      <path d="M86 24L96 23" stroke="#222733" strokeWidth="3" strokeLinecap="round" />
      <path d="M36 50L52 44L60 48" stroke="#2c303d" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M44 44H64" stroke="#8a93a4" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
      <ellipse cx="29" cy="33" rx="6" ry="4.4" fill="url(#vx-tail)" />
      <path d="M28 33L38 31" stroke="#ff4d4d" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="104" cy="33" rx="9" ry="7" fill="url(#vx-head)" />
      <ellipse cx="102" cy="33" rx="3.2" ry="2.8" fill="#fff3b0" />
      <Wheel cx={28} cy={48} r={11.8} />
      <Wheel cx={101} cy={48} r={11.8} />
    </>
  );
}

function Supercar() {
  const body = 'M6 52V42C6 39 10 38 16 37L40 31C48 23 61 19 76 19C88 19 96 23 102 29L120 34C125 36 127 41 126 46V52Z';
  return (
    <>
      <defs>
        <linearGradient id="v3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6d8dff" />
          <stop offset="0.5" stopColor="#2c52e6" />
          <stop offset="1" stopColor="#16288f" />
        </linearGradient>
      </defs>
      <Ground />
      <path d={body} fill="url(#v3)" />
      <Finish id="3" d={body} belt={34} />
      {/* racing stripe + side intake */}
      <path d="M40 31C48 23 61 19 76 19C88 19 96 23 102 29" stroke="#fff" strokeWidth="1.6" fill="none" opacity="0.22" />
      <path d="M58 38H80L87 45H52Z" fill="#0a1450" opacity="0.7" />
      <path d="M49 30C55 24 63 21.5 74 21.5C84 21.5 90 25 95 30Z" fill="#12293b" />
      <path d="M49 30C55 24 63 21.5 74 21.5C84 21.5 90 25 95 30Z" fill="url(#vx-glass)" />
      <path d="M53 29C58 25 64 23.5 72 23.5" stroke="#8ad8ff" strokeWidth="1.6" fill="none" opacity="0.75" strokeLinecap="round" />
      {/* rear wing on end plates */}
      <path d="M3 31L22 29.5V34L3 36.5Z" fill="#101a55" />
      <path d="M3 31L22 29.5" stroke="#8aa4ff" strokeWidth="1" opacity="0.7" />
      <path d="M12 36V40M20 34V38" stroke="#0a1146" strokeWidth="2" />
      <path d="M60 36H94" stroke="#0d1a6b" strokeWidth="1.6" opacity="0.7" />
      <rect x="6" y="49" width="120" height="3" rx="1.5" fill="#050827" opacity="0.55" />
      <ellipse cx="8" cy="42" rx="7" ry="4.5" fill="url(#vx-tail)" />
      <rect x="6" y="41" width="5" height="4" rx="1" fill="#ff4d4d" />
      <ellipse cx="121" cy="38" rx="10" ry="6.5" fill="url(#vx-head)" />
      <path d="M118 38L126 40" stroke="#fff3b0" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="34" cy="49" r="12.2" fill="#070a24" />
      <circle cx="98" cy="49" r="12.2" fill="#070a24" />
      <Wheel cx={34} r={10.6} />
      <Wheel cx={98} r={10.6} />
    </>
  );
}

function Coupe() {
  const body = 'M6 52V41C6 38 10 37 16 36L30 34C38 23 50 17 66 17H84C94 17 100 22 106 30L120 34C125 35 126 41 126 47V52Z';
  return (
    <>
      <defs>
        <linearGradient id="v4" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e7f6f4" />
          <stop offset="0.5" stopColor="#a9ccc9" />
          <stop offset="1" stopColor="#6d9a98" />
        </linearGradient>
      </defs>
      <Ground />
      <path d={body} fill="url(#v4)" />
      <Finish id="4" d={body} belt={32} />
      <path d="M41 32C47 24 55 20 66 20H82C90 20 94 25 99 32Z" fill="#17323d" />
      <path d="M41 32C47 24 55 20 66 20H82C90 20 94 25 99 32Z" fill="url(#vx-glass)" />
      <path d="M46 29C51 24 57 22 64 22" stroke="#9fe3ff" strokeWidth="1.5" fill="none" opacity="0.7" strokeLinecap="round" />
      <path d="M70 20V32" stroke="#6d9a98" strokeWidth="2.4" />
      <path d="M52 33V46M88 33V46" stroke="#254240" strokeWidth="0.9" opacity="0.4" />
      <rect x="56" y="36" width="7" height="1.7" rx="0.8" fill="#34605e" opacity="0.8" />
      <path d="M20 44H116" stroke="#4d7a78" strokeWidth="1.3" opacity="0.7" />
      <rect x="6" y="49" width="120" height="3" rx="1.5" fill="#0b1b1b" opacity="0.45" />
      <ellipse cx="8" cy="42" rx="7" ry="5" fill="url(#vx-tail)" />
      <rect x="6" y="40" width="5" height="4.5" rx="1" fill="#ff4d4d" />
      <ellipse cx="121" cy="41" rx="10" ry="7" fill="url(#vx-head)" />
      <ellipse cx="119" cy="41" rx="4" ry="3.3" fill="#fff3b0" />
      <circle cx="34" cy="49" r="12.2" fill="#0b1b1b" />
      <circle cx="98" cy="49" r="12.2" fill="#0b1b1b" />
      <Wheel cx={34} r={10.6} />
      <Wheel cx={98} r={10.6} />
    </>
  );
}

const ART = [Hatchback, Pickup, Bike, Supercar, Coupe];

export const Vehicle = memo(function Vehicle({ index, className }: { index: number; className?: string }) {
  const type = ((index % VEHICLE_TYPES) + VEHICLE_TYPES) % VEHICLE_TYPES;
  const variant = Math.floor(index / VEHICLE_TYPES) % VARIANT_FILTER.length;
  const Art = ART[type]!;
  return (
    <svg
      className={className}
      viewBox="0 0 130 62"
      preserveAspectRatio="xMaxYMid meet"
      style={{ filter: VARIANT_FILTER[variant] }}
      aria-hidden
    >
      <Defs />
      <Art />
    </svg>
  );
});
