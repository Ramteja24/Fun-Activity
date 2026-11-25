const MAX = 150; // WPM at the end of the dial
const CX = 50;
const CY = 50;
const R = 39; // radius of the colour arc

function polar(r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const;
}
function arc(r: number, from: number, to: number) {
  const [x1, y1] = polar(r, from);
  const [x2, y2] = polar(r, to);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

// Dial sweeps 270°, from bottom-left (-135°) round the top to bottom-right (+135°), like the reel's gauge.
const START = -135;
const SWEEP = 270;
const at = (wpm: number) => START + SWEEP * (wpm / MAX);

// Minor ticks every 5 WPM, major ticks every 25 WPM, numerals at 50 and 100 (the ends of the dial stay clear of the readout).
const TICKS = Array.from({ length: MAX / 5 + 1 }, (_, i) => ({ deg: at(i * 5), major: (i * 5) % 25 === 0 }));
const NUMERALS = [50, 100];
const ARC = arc(R, START, START + SWEEP);

/** Colour of the readout: ink while warming up, green at a good pace, brand orange when flying. */
const readout = (wpm: number) => (wpm >= 100 ? '#e06d00' : wpm >= 50 ? '#16a34a' : '#151a2d');

/**
 * The gauge. The needle and the lit arc follow the live WPM; the number and label sit in the open bottom of the dial.
 * It is drawn on a 100×100 grid and scales with the stage (see `.gauge` in ui/race.css).
 */
export function Speedometer({ wpm }: { wpm: number }) {
  const value = Math.min(MAX, Math.max(0, wpm));
  const angle = at(value);
  return (
    <div className="gauge" role="img" aria-label={`${Math.round(wpm)} words per minute`}>
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <defs>
          <linearGradient id="gg-arc" gradientUnits="userSpaceOnUse" x1="10" y1="80" x2="90" y2="80">
            <stop offset="0" stopColor="#ffb25c" />
            <stop offset="1" stopColor="#f67c01" />
          </linearGradient>
        </defs>

        <circle cx={CX} cy={CY} r="48.5" fill="#ffffff" stroke="#e4e7ef" strokeWidth="1.5" />

        {/* the dial's track, the fast zone, then the lit arc up to the current speed */}
        <path d={ARC} pathLength={100} stroke="#eef0f6" strokeWidth="5.2" fill="none" strokeLinecap="round" />
        <path d={arc(R, at(120), at(MAX))} stroke="#fde2c3" strokeWidth="5.2" fill="none" />
        <path className="gauge-lit" d={ARC} pathLength={100} stroke="url(#gg-arc)" strokeWidth="5.2" fill="none" strokeLinecap="round" strokeDasharray={`${(value / MAX) * 100} 101`} />

        {TICKS.map((t, i) => {
          const [x1, y1] = polar(t.major ? 28.2 : 31.2, t.deg);
          const [x2, y2] = polar(34.2, t.deg);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={t.major ? '#4b5370' : '#c3c8d6'} strokeWidth={t.major ? 1.4 : 0.8} strokeLinecap="round" />;
        })}
        {NUMERALS.map((n) => {
          const [x, y] = polar(21.5, at(n));
          return (
            <text key={n} className="gauge-num" x={x} y={y + 2} textAnchor="middle" fontSize="6.4" fontWeight="600" fill="#7c849e" fontFamily="inherit">
              {n}
            </text>
          );
        })}

        <g className="needle" style={{ transform: `rotate(${angle}deg)` }}>
          <path d={`M${CX - 2.2} ${CY + 8} L${CX + 2.2} ${CY + 8} L${CX + 0.7} ${CY - 35} L${CX - 0.7} ${CY - 35} Z`} fill="#151a2d" />
        </g>
        <circle cx={CX} cy={CY} r="4.6" fill="#151a2d" />
        <circle cx={CX} cy={CY} r="1.7" fill="#f67c01" />

        <text x={CX} y="71" textAnchor="middle" fontSize="18" fontWeight="700" fill={readout(wpm)} fontFamily="inherit" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(wpm)}
        </text>
        <text x={CX} y="81" textAnchor="middle" fontSize="6.6" fontWeight="600" fill="#7c849e" fontFamily="inherit" letterSpacing="1.2">
          WPM
        </text>
      </svg>
    </div>
  );
}
