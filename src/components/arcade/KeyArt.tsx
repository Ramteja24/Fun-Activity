import { useId, type CSSProperties } from 'react';
import { CardBack, JokerFace } from '../cards/CardArt';
import type { ActivityId } from '../../../shared/activities';

// The games' key art on the dashboard cards: a road and a racer for TypeDrive, a lit stage with a performer for the Funny Pose
// Challenge, a card table with the joker for Playing Cards, a quiz screen for Tech Trivia. Pure SVG on one 320 × 200 canvas; the motion lives in src/ui/home.css (ka-*) and is off under
// reduced motion. Gradient / clip ids come from useId, so two copies on one page never clash.

export function KeyArt({ id }: { id: ActivityId }) {
  const u = useId();
  return (
    <div className={`ka ka-${id}`} aria-hidden>
      {id === 'typedrive' ? <TypeDriveArt u={u} /> : id === 'pose' ? <PoseArt u={u} /> : id === 'cards' ? <CardsArt u={u} /> : <TriviaArt u={u} />}
    </div>
  );
}

function TypeDriveArt({ u }: { u: string }) {
  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${u}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#070824" />
          <stop offset="0.5" stopColor="#3b1b63" />
          <stop offset="0.9" stopColor="#ff7a2f" />
          <stop offset="1" stopColor="#ffb25a" />
        </linearGradient>
        <linearGradient id={`${u}r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#35364b" />
          <stop offset="1" stopColor="#0b0c16" />
        </linearGradient>
        <linearGradient id={`${u}c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a6bff" />
          <stop offset="0.55" stopColor="#2a3fd0" />
          <stop offset="1" stopColor="#141a55" />
        </linearGradient>
        <radialGradient id={`${u}g`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffe3a0" stopOpacity="1" />
          <stop offset="0.35" stopColor="#ffa83f" stopOpacity="0.7" />
          <stop offset="1" stopColor="#ff7a2f" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${u}m`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6cf" stopOpacity="0.5" />
          <stop offset="1" stopColor="#fff6cf" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${u}f`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffd9a0" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff2d6" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffd9a0" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${u}t`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ff3d33" stopOpacity="0.7" />
          <stop offset="1" stopColor="#ff3d33" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${u}x`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfe9ff" />
          <stop offset="0.4" stopColor="#ffb02e" />
          <stop offset="1" stopColor="#ff5a1f" stopOpacity="0" />
        </linearGradient>
        <filter id={`${u}b`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <filter id={`${u}n`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
      </defs>
      <rect width="320" height="200" fill={`url(#${u}s)`} />
      <g fill="#fff" opacity="0.7">
        <circle cx="30" cy="16" r="0.8" />
        <circle cx="96" cy="26" r="0.6" />
        <circle cx="206" cy="14" r="0.8" />
        <circle cx="290" cy="30" r="0.7" />
        <circle cx="246" cy="40" r="0.5" />
      </g>
      <circle className="ka-sun" cx="160" cy="98" r="64" fill={`url(#${u}g)`} />
      <path d="M58 98 V84 h8 V78 h6 V88 h5 V82 h8 V98 Z M244 98 V86 h7 V80 h8 V90 h6 V84 h7 V98 Z" fill="#0f1034" />
      <g fill="#ffd27a" opacity="0.7">
        <rect x="61" y="86" width="1.6" height="1.6" />
        <rect x="68" y="90" width="1.6" height="1.6" />
        <rect x="76" y="86" width="1.6" height="1.6" />
        <rect x="249" y="88" width="1.6" height="1.6" />
        <rect x="257" y="84" width="1.6" height="1.6" />
        <rect x="264" y="90" width="1.6" height="1.6" />
      </g>
      <path d="M0 98 L0 84 L38 84 L38 78 L96 78 L96 98 Z M224 98 L224 78 L282 78 L282 84 L320 84 L320 98 Z" fill="#0a0b22" />
      <path className="ka-led" d="M0 96.6 H96 M224 96.6 H320" stroke="#4aa3ff" strokeWidth="1.3" strokeDasharray="5 3" opacity="0.9" />
      <path d="M52 98 V54 M268 98 V54" stroke="#1a1c40" strokeWidth="3" />
      <path className="ka-beam" d="M52 54 L8 130 L96 130 Z" fill={`url(#${u}m)`} />
      <path className="ka-beam ka-beam-b" d="M268 54 L224 130 L312 130 Z" fill={`url(#${u}m)`} />
      <g>
        <circle cx="46" cy="52" r="2.2" fill="#fff6cf" />
        <circle cx="262" cy="52" r="2.2" fill="#fff6cf" />
      </g>
      <g>
        <circle cx="52" cy="52" r="2.2" fill="#fff6cf" />
        <circle cx="268" cy="52" r="2.2" fill="#fff6cf" />
      </g>
      <g>
        <circle cx="58" cy="52" r="2.2" fill="#fff6cf" />
        <circle cx="274" cy="52" r="2.2" fill="#fff6cf" />
      </g>
      <path d="M150 98 L170 98 L350 200 L-30 200 Z" fill={`url(#${u}r)`} />
      <path d="M150 98 L-30 200 M170 98 L350 200" stroke="#ffa83f" strokeWidth="2.4" opacity="0.9" />
      <path d="M150 98 L-30 200 M170 98 L350 200" stroke="#ffd27a" strokeWidth="0.8" opacity="0.8" />
      <g className="ka-dash-still">
        <path d="M150.0 98.0 L149.0 98.0 L146.0 99.6 L147.2 99.6 Z" fill="#ff3d33" opacity="0.9" />
        <path d="M147.2 99.6 L146.0 99.6 L136.9 104.4 L138.8 104.4 Z" fill="#fff" opacity="0.9" />
        <path d="M138.8 104.4 L136.9 104.4 L121.9 112.3 L124.7 112.3 Z" fill="#ff3d33" opacity="0.9" />
        <path d="M124.7 112.3 L121.9 112.3 L100.8 123.5 L105.0 123.5 Z" fill="#fff" opacity="0.9" />
        <path d="M105.0 123.5 L100.8 123.5 L73.6 137.8 L79.7 137.8 Z" fill="#ff3d33" opacity="0.9" />
        <path d="M79.7 137.8 L73.6 137.8 L40.4 155.4 L48.8 155.4 Z" fill="#fff" opacity="0.9" />
        <path d="M48.8 155.4 L40.4 155.4 L1.2 176.1 L12.2 176.1 Z" fill="#ff3d33" opacity="0.9" />
        <path d="M12.2 176.1 L1.2 176.1 L-44.0 200.0 L-30.0 200.0 Z" fill="#fff" opacity="0.9" />
        <path d="M170.0 98.0 L171.0 98.0 L174.0 99.6 L172.8 99.6 Z" fill="#ff3d33" opacity="0.9" />
        <path d="M172.8 99.6 L174.0 99.6 L183.1 104.4 L181.2 104.4 Z" fill="#fff" opacity="0.9" />
        <path d="M181.2 104.4 L183.1 104.4 L198.1 112.3 L195.3 112.3 Z" fill="#ff3d33" opacity="0.9" />
        <path d="M195.3 112.3 L198.1 112.3 L219.2 123.5 L215.0 123.5 Z" fill="#fff" opacity="0.9" />
        <path d="M215.0 123.5 L219.2 123.5 L246.4 137.8 L240.3 137.8 Z" fill="#ff3d33" opacity="0.9" />
        <path d="M240.3 137.8 L246.4 137.8 L279.6 155.4 L271.2 155.4 Z" fill="#fff" opacity="0.9" />
        <path d="M271.2 155.4 L279.6 155.4 L318.8 176.1 L307.8 176.1 Z" fill="#ff3d33" opacity="0.9" />
        <path d="M307.8 176.1 L318.8 176.1 L364.0 200.0 L350.0 200.0 Z" fill="#fff" opacity="0.9" />
      </g>
      <g className="ka-dash-flow">
        <g className="ka-kerb ka-kerb-l" style={{ "--i": "0" } as CSSProperties}>
          <rect x="-1" y="0" width="1" height="1" fill="#ff3d33" />
        </g>
        <g className="ka-kerb ka-kerb-l" style={{ "--i": "1" } as CSSProperties}>
          <rect x="-1" y="0" width="1" height="1" fill="#fff" />
        </g>
        <g className="ka-kerb ka-kerb-l" style={{ "--i": "2" } as CSSProperties}>
          <rect x="-1" y="0" width="1" height="1" fill="#ff3d33" />
        </g>
        <g className="ka-kerb ka-kerb-l" style={{ "--i": "3" } as CSSProperties}>
          <rect x="-1" y="0" width="1" height="1" fill="#fff" />
        </g>
        <g className="ka-kerb ka-kerb-l" style={{ "--i": "4" } as CSSProperties}>
          <rect x="-1" y="0" width="1" height="1" fill="#ff3d33" />
        </g>
        <g className="ka-kerb ka-kerb-l" style={{ "--i": "5" } as CSSProperties}>
          <rect x="-1" y="0" width="1" height="1" fill="#fff" />
        </g>
        <g className="ka-kerb ka-kerb-l" style={{ "--i": "6" } as CSSProperties}>
          <rect x="-1" y="0" width="1" height="1" fill="#ff3d33" />
        </g>
        <g className="ka-kerb ka-kerb-l" style={{ "--i": "7" } as CSSProperties}>
          <rect x="-1" y="0" width="1" height="1" fill="#fff" />
        </g>
        <g className="ka-kerb ka-kerb-r" style={{ "--i": "0" } as CSSProperties}>
          <rect x="0" y="0" width="1" height="1" fill="#ff3d33" />
        </g>
        <g className="ka-kerb ka-kerb-r" style={{ "--i": "1" } as CSSProperties}>
          <rect x="0" y="0" width="1" height="1" fill="#fff" />
        </g>
        <g className="ka-kerb ka-kerb-r" style={{ "--i": "2" } as CSSProperties}>
          <rect x="0" y="0" width="1" height="1" fill="#ff3d33" />
        </g>
        <g className="ka-kerb ka-kerb-r" style={{ "--i": "3" } as CSSProperties}>
          <rect x="0" y="0" width="1" height="1" fill="#fff" />
        </g>
        <g className="ka-kerb ka-kerb-r" style={{ "--i": "4" } as CSSProperties}>
          <rect x="0" y="0" width="1" height="1" fill="#ff3d33" />
        </g>
        <g className="ka-kerb ka-kerb-r" style={{ "--i": "5" } as CSSProperties}>
          <rect x="0" y="0" width="1" height="1" fill="#fff" />
        </g>
        <g className="ka-kerb ka-kerb-r" style={{ "--i": "6" } as CSSProperties}>
          <rect x="0" y="0" width="1" height="1" fill="#ff3d33" />
        </g>
        <g className="ka-kerb ka-kerb-r" style={{ "--i": "7" } as CSSProperties}>
          <rect x="0" y="0" width="1" height="1" fill="#fff" />
        </g>
      </g>
      <g className="ka-dash-still">
        <path d="M159.4 98 L160.6 98 L160.6405 98.8262 L159.3595 98.8262 Z" fill="#f4f5ff" opacity="0.85" />
        <path d="M159.26111111111112 100.83333333333333 L160.73888888888888 100.83333333333333 L160.9609088888889 105.36254133333334 L159.0390911111111 105.36254133333334 Z" fill="#f4f5ff" opacity="0.85" />
        <path d="M158.84444444444443 109.33333333333333 L161.15555555555557 109.33333333333333 L161.60053555555555 118.41092533333334 L158.39946444444445 118.41092533333334 Z" fill="#f4f5ff" opacity="0.85" />
        <path d="M158.15 123.5 L161.85 123.5 L162.55938 137.971352 L157.44062 137.971352 Z" fill="#f4f5ff" opacity="0.85" />
        <path d="M157.17777777777778 143.33333333333331 L162.82222222222222 143.33333333333331 L163.83744222222222 164.0438213333333 L156.16255777777778 164.0438213333333 Z" fill="#f4f5ff" opacity="0.85" />
        <path d="M155.92777777777778 168.83333333333334 L164.07222222222222 168.83333333333334 L165.43472222222223 196.62833333333333 L154.56527777777777 196.62833333333333 Z" fill="#f4f5ff" opacity="0.85" />
      </g>
      <g className="ka-dash-flow">
        <g className="ka-dash" style={{ "--i": "0" } as CSSProperties}>
          <rect x="-0.5" y="0" width="1" height="1" fill="#f4f5ff" />
        </g>
        <g className="ka-dash" style={{ "--i": "1" } as CSSProperties}>
          <rect x="-0.5" y="0" width="1" height="1" fill="#f4f5ff" />
        </g>
        <g className="ka-dash" style={{ "--i": "2" } as CSSProperties}>
          <rect x="-0.5" y="0" width="1" height="1" fill="#f4f5ff" />
        </g>
        <g className="ka-dash" style={{ "--i": "3" } as CSSProperties}>
          <rect x="-0.5" y="0" width="1" height="1" fill="#f4f5ff" />
        </g>
        <g className="ka-dash" style={{ "--i": "4" } as CSSProperties}>
          <rect x="-0.5" y="0" width="1" height="1" fill="#f4f5ff" />
        </g>
        <g className="ka-dash" style={{ "--i": "5" } as CSSProperties}>
          <rect x="-0.5" y="0" width="1" height="1" fill="#f4f5ff" />
        </g>
        <g className="ka-dash" style={{ "--i": "6" } as CSSProperties}>
          <rect x="-0.5" y="0" width="1" height="1" fill="#f4f5ff" />
        </g>
        <g className="ka-dash" style={{ "--i": "7" } as CSSProperties}>
          <rect x="-0.5" y="0" width="1" height="1" fill="#f4f5ff" />
        </g>
      </g>
      <path d="M154 98 V90 H166 V98" stroke="#f4f5ff" strokeWidth="1.2" fill="none" />
      <path d="M154 90 H166 V93 H154 Z" fill="#f4f5ff" />
      <g fill="#4aa3ff">
        <circle cx="156" cy="88.6" r="0.9" />
        <circle cx="160" cy="88.6" r="0.9" />
        <circle cx="164" cy="88.6" r="0.9" />
      </g>
      <g stroke="#fff" strokeWidth="0.9" strokeLinecap="round" opacity="0.4">
        <path className="ka-wind ka-wind-l" d="M8 124 h24 M18 142 h16 M4 158 h20" />
        <path className="ka-wind ka-wind-r" d="M296 126 h22 M288 146 h18 M298 162 h20" />
      </g>
      <g className="ka-streaks" stroke="#fff" strokeWidth="1" opacity="0.24" fill="none">
        <path d="M160 98 L20 150" pathLength="100" />
        <path d="M160 98 L300 150" pathLength="100" />
        <path d="M160 98 L60 196" pathLength="100" />
        <path d="M160 98 L270 196" pathLength="100" />
      </g>
      <g className="ka-trail">
        <path d="M122 162 L152 99 L155 99 L146 162 Z" fill={`url(#${u}t)`} />
        <path d="M174 162 L165 99 L168 99 L198 162 Z" fill={`url(#${u}t)`} />
      </g>
      <g className="ka-car">
        <ellipse cx="160" cy="189" rx="62" ry="7" fill="#ff7a2f" opacity="0.45" filter={`url(#${u}b)`} />
        <ellipse cx="160" cy="190" rx="50" ry="4" fill="#35e6d8" opacity="0.4" filter={`url(#${u}n)`} />
        <path d="M116 184 L121 160 Q123 152 134 150 L186 150 Q197 152 199 160 L204 184 Z" fill={`url(#${u}c)`} />
        <path d="M118 176 L121 160 Q123 152 134 150 L160 150 L160 176 Z" fill="#fff" opacity="0.07" />
        <path d="M134 150 L142 133 Q144 129 150 129 L170 129 Q176 129 178 133 L186 150 Z" fill="#0b0f33" />
        <path d="M144 148 L149 134 H156 L152 148 Z" fill="#8fb4ff" opacity="0.38" />
        <path d="M150 131 H170" stroke="#8fb4ff" strokeWidth="0.8" opacity="0.4" />
        <path d="M121 160 Q123 152 134 150 L186 150 Q197 152 199 160" fill="none" stroke="#a9ceff" strokeWidth="1" opacity="0.85" />
        <path d="M142 133 Q144 129 150 129 L170 129 Q176 129 178 133" fill="none" stroke="#cfe6ff" strokeWidth="0.8" opacity="0.75" />
        <path d="M116 184 L121 160 M204 184 L199 160" stroke="#4aa3ff" strokeWidth="1.2" opacity="0.8" />
        <rect x="124" y="145" width="72" height="5" rx="1.5" fill="#101645" />
        <rect x="121" y="160" width="26" height="9" rx="3" fill="#ff3d33" filter={`url(#${u}b)`} />
        <rect x="173" y="160" width="26" height="9" rx="3" fill="#ff3d33" filter={`url(#${u}b)`} />
        <g className="ka-tail">
          <rect x="122" y="161" width="24" height="7" rx="2.5" fill="#ff6a55" />
          <rect x="174" y="161" width="24" height="7" rx="2.5" fill="#ff6a55" />
          <rect x="124" y="163" width="20" height="2" rx="1" fill="#ffd0c8" opacity="0.8" />
          <rect x="176" y="163" width="20" height="2" rx="1" fill="#ffd0c8" opacity="0.8" />
        </g>
        <rect x="148" y="170" width="24" height="9" rx="1.5" fill="#f4f5ff" />
        <path d="M152 174 h16" stroke="#222" strokeWidth="1.4" />
        <path d="M126 184 a8 8 0 0 1 16 0 M178 184 a8 8 0 0 1 16 0" fill="#06070f" />
        <path className="ka-flame" d="M133 181 Q137 198 141 181 Z" fill={`url(#${u}x)`} />
        <path className="ka-flame ka-flame-b" d="M179 181 Q183 198 187 181 Z" fill={`url(#${u}x)`} />
      </g>
      <rect className="ka-flare" x="0" y="96.8" width="320" height="2.6" fill={`url(#${u}f)`} />
      <ellipse cx="160" cy="98" rx="30" ry="2.6" fill="#fff" opacity="0.55" filter={`url(#${u}n)`} />
      <defs>
        <radialGradient id={`${u}v`} cx="0.5" cy="0.48" r="0.75">
          <stop offset="0.55" stopColor="#02030f" stopOpacity="0" />
          <stop offset="1" stopColor="#02030f" stopOpacity="0.62" />
        </radialGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#${u}v)`} />
    </svg>
  );
}

function PoseArt({ u }: { u: string }) {
  return (
    <>
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${u}k`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a8135f" />
          <stop offset="0.5" stopColor="#ff4f9a" />
          <stop offset="1" stopColor="#7b0f48" />
        </linearGradient>
        <linearGradient id={`${u}l`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="1" stopColor="#ff9ccd" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${u}j`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff7ac8" stopOpacity="0.42" />
          <stop offset="1" stopColor="#ff7ac8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${u}m`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a98bff" stopOpacity="0.46" />
          <stop offset="1" stopColor="#a98bff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${u}d`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ff5fa8" stopOpacity="0.5" />
          <stop offset="0.6" stopColor="#9a3cff" stopOpacity="0.2" />
          <stop offset="1" stopColor="#9a3cff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${u}e`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b0f4d" />
          <stop offset="1" stopColor="#12051f" />
        </linearGradient>
        <linearGradient id={`${u}h`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff7ac8" stopOpacity="0" />
          <stop offset="0.7" stopColor="#ff7ac8" stopOpacity="0.2" />
          <stop offset="1" stopColor="#ff7ac8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${u}a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a0a2c" />
          <stop offset="1" stopColor="#2c0f48" />
        </linearGradient>
        <radialGradient id={`${u}f`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ff7ab8" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ff4f9a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="200" fill="#12061f" />
      <rect y="150" width="320" height="50" fill={`url(#${u}a)`} />
      <g stroke="#6b2a9a" strokeWidth="0.8" opacity="0.5" fill="none">
        <path d="M160 150 L10 200 M160 150 L66 200 M160 150 L118 200 M160 150 L202 200 M160 150 L254 200 M160 150 L310 200" />
        <path d="M0 162 H320 M0 176 H320 M0 190 H320" opacity="0.6" />
      </g>
      <rect y="148.5" width="320" height="3" fill="#ff5fa8" opacity="0.7" />
      <rect x="62" y="12" width="196" height="138" fill={`url(#${u}e)`} />
      <circle cx="160" cy="86" r="86" fill={`url(#${u}d)`} />
      <circle cx="160" cy="86" r="60" fill="none" stroke="#ff5fa8" strokeWidth="1.2" opacity="0.5" />
      <circle className="ka-ring" cx="160" cy="86" r="68" fill="none" stroke="#c9a2ff" strokeWidth="1" strokeDasharray="2 6" opacity="0.7" />
      <g>
        <rect className="ka-eq" x="67" y="136" width="9" height="14" rx="1.5" fill="#ff5fa8" opacity="0.5" style={{ "animationDelay": "0s" } as CSSProperties} />
        <rect className="ka-eq" x="86.2" y="130" width="9" height="20" rx="1.5" fill="#a98bff" opacity="0.5" style={{ "animationDelay": "-0.23s" } as CSSProperties} />
        <rect className="ka-eq" x="105.4" y="124" width="9" height="26" rx="1.5" fill="#ff5fa8" opacity="0.5" style={{ "animationDelay": "-0.46s" } as CSSProperties} />
        <rect className="ka-eq" x="124.6" y="118" width="9" height="32" rx="1.5" fill="#a98bff" opacity="0.5" style={{ "animationDelay": "-0.69s" } as CSSProperties} />
        <rect className="ka-eq" x="143.8" y="112" width="9" height="38" rx="1.5" fill="#ff5fa8" opacity="0.5" style={{ "animationDelay": "-0.92s" } as CSSProperties} />
        <rect className="ka-eq" x="163" y="106" width="9" height="44" rx="1.5" fill="#a98bff" opacity="0.5" style={{ "animationDelay": "-1.15s" } as CSSProperties} />
        <rect className="ka-eq" x="182.2" y="131" width="9" height="19" rx="1.5" fill="#ff5fa8" opacity="0.5" style={{ "animationDelay": "-1.38s" } as CSSProperties} />
        <rect className="ka-eq" x="201.4" y="125" width="9" height="25" rx="1.5" fill="#a98bff" opacity="0.5" style={{ "animationDelay": "-1.61s" } as CSSProperties} />
        <rect className="ka-eq" x="220.6" y="119" width="9" height="31" rx="1.5" fill="#ff5fa8" opacity="0.5" style={{ "animationDelay": "-1.84s" } as CSSProperties} />
        <rect className="ka-eq" x="239.79999999999998" y="113" width="9" height="37" rx="1.5" fill="#a98bff" opacity="0.5" style={{ "animationDelay": "-2.07s" } as CSSProperties} />
      </g>
      <path d="M62 12 V150 M258 12 V150" stroke="#ff9ccd" strokeWidth="1" opacity="0.5" />
      <rect y="112" width="320" height="38" fill={`url(#${u}h)`} />
      <path className="ka-beam" d="M70 -6 L110 170 L230 170 Z" fill={`url(#${u}m)`} />
      <path className="ka-beam ka-beam-b" d="M250 -6 L90 170 L210 170 Z" fill={`url(#${u}j)`} />
      <path d="M160 -6 L70 170 L250 170 Z" fill={`url(#${u}l)`} />
      <ellipse cx="160" cy="172" rx="96" ry="15" fill={`url(#${u}f)`} />
      <ellipse cx="160" cy="172" rx="70" ry="8" fill="none" stroke="#ffd0e6" strokeWidth="1.4" opacity="0.7" />
      <path d="M0 0 H62 Q46 60 56 120 Q44 160 54 200 H0 Z" fill={`url(#${u}k)`} />
      <path d="M320 0 H258 Q274 60 264 120 Q276 160 266 200 H320 Z" fill={`url(#${u}k)`} />
      <g stroke="#000" strokeWidth="1" opacity="0.22">
        <path d="M14 0 V200 M28 0 V200 M42 0 V200 M306 0 V200 M292 0 V200 M278 0 V200" />
      </g>
      <rect x="58" y="0" width="204" height="4.4" fill="#2c1f4e" />
      <rect x="58" y="3.6" width="204" height="0.8" fill="#a98bff" opacity="0.6" />
      <g>
        <path d="M65 4 h10 l-2 6 h-6 z" fill="#8a78b6" />
        <circle cx="70" cy="10.6" r="2.4" fill="#c9a2ff" />
      </g>
      <g>
        <path d="M155 4 h10 l-2 6 h-6 z" fill="#8a78b6" />
        <circle cx="160" cy="10.6" r="2.4" fill="#fff" />
      </g>
      <g>
        <path d="M245 4 h10 l-2 6 h-6 z" fill="#8a78b6" />
        <circle cx="250" cy="10.6" r="2.4" fill="#ff9ccd" />
      </g>
      <circle className="ka-bulb" cx="66" cy="10" r="2.4" fill="#fff" opacity="0.9" />
      <circle className="ka-bulb ka-bulb-b" cx="81.5" cy="10" r="2.4" fill="#ffe27a" opacity="0.9" />
      <circle className="ka-bulb" cx="97" cy="10" r="2.4" fill="#fff" opacity="0.9" />
      <circle className="ka-bulb ka-bulb-b" cx="112.5" cy="10" r="2.4" fill="#ffe27a" opacity="0.9" />
      <circle className="ka-bulb" cx="128" cy="10" r="2.4" fill="#fff" opacity="0.9" />
      <circle className="ka-bulb ka-bulb-b" cx="143.5" cy="10" r="2.4" fill="#ffe27a" opacity="0.9" />
      <circle className="ka-bulb" cx="159" cy="10" r="2.4" fill="#fff" opacity="0.9" />
      <circle className="ka-bulb ka-bulb-b" cx="174.5" cy="10" r="2.4" fill="#ffe27a" opacity="0.9" />
      <circle className="ka-bulb" cx="190" cy="10" r="2.4" fill="#fff" opacity="0.9" />
      <circle className="ka-bulb ka-bulb-b" cx="205.5" cy="10" r="2.4" fill="#ffe27a" opacity="0.9" />
      <circle className="ka-bulb" cx="221" cy="10" r="2.4" fill="#fff" opacity="0.9" />
      <circle className="ka-bulb ka-bulb-b" cx="236.5" cy="10" r="2.4" fill="#ffe27a" opacity="0.9" />
      <circle className="ka-bulb" cx="252" cy="10" r="2.4" fill="#fff" opacity="0.9" />
      <g fill="#fff3a6">
        <path className="ka-spark" d="M96 62 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z" />
        <path className="ka-spark ka-spark-b" d="M232 46 l1.6 4.6 4.6 1.6 -4.6 1.6 -1.6 4.6 -1.6 -4.6 -4.6 -1.6 4.6 -1.6z" />
        <path className="ka-spark ka-spark-c" d="M214 112 l1.4 4 4 1.4 -4 1.4 -1.4 4 -1.4 -4 -4 -1.4 4 -1.4z" />
      </g>
    </svg>
    <svg viewBox="0 0 240 300" className="ka-figure" aria-hidden="true">
      <ellipse cx="120" cy="288" rx="72" ry="6" fill="rgba(0,0,0,.35)" />
      <path d="M102.7057708123485 106.5636978672772 L132.68749562292138 105.51671296620216 Q186.4 178 174.4 238 Q124.4 220 74.4 242 Q64.4 180 102.7057708123485 106.5636978672772 Z" fill="#ff4d6d" stroke="#b01837" strokeWidth="3" strokeLinejoin="round" opacity="0.95" />
      <g fill="none" stroke="var(--pf-body, #eef0ff)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="9">
        <path d="M102.7 106.6 L68.1 126.6 L92.5 155.7" />
        <path d="M132.7 105.5 L167.3 125.5 L142.9 154.6" />
        <path d="M110.0 172.0 L88.1 216.9 L79.4 266.2" />
        <path d="M130.0 172.0 L151.9 216.9 L160.6 266.2" />
      </g>
      <path d="M120.0 172.0 L117.4 98.0" fill="none" stroke="var(--pf-body, #eef0ff)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="13" />
      <path d="M102.7 106.6 L132.7 105.5" fill="none" stroke="var(--pf-body, #eef0ff)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="11" />
      <circle cx="92.49068382905945" cy="155.67338670579835" r="7.5" fill="#ffd58a" stroke="#2a1608" strokeWidth="2" />
      <circle cx="142.90258260621044" cy="154.62640180472334" r="7.5" fill="#ffd58a" stroke="#2a1608" strokeWidth="2" />
      <ellipse cx="74.39903377719962" cy="269.18008996556875" rx="9" ry="5" fill="var(--pf-body, #eef0ff)" stroke="#2a1608" strokeWidth="2" />
      <ellipse cx="165.60096622280037" cy="269.18008996556875" rx="9" ry="5" fill="var(--pf-body, #eef0ff)" stroke="#2a1608" strokeWidth="2" />
      <circle cx="116.3704523429399" cy="68.06335399001404" r="26" fill="#ffd58a" stroke="#2a1608" strokeWidth="3" />
      <g transform="translate(116.4 68.1) rotate(-2)">
        <circle cx="-9" cy="-5" r="3.2" fill="#2a1608" />
        <circle cx="9" cy="-5" r="3.2" fill="#2a1608" />
        <path d="M-16 -13 l11 3" fill="none" stroke="#2a1608" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 -10 l11 -3" fill="none" stroke="#2a1608" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M-8 12 q8 5 16 -1" fill="none" stroke="#2a1608" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
    <svg className="ka-crowd" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id={`${u}v`} cx="0.5" cy="0.48" r="0.75">
          <stop offset="0.55" stopColor="#02030f" stopOpacity="0" />
          <stop offset="1" stopColor="#02030f" stopOpacity="0.62" />
        </radialGradient>
      </defs>
      <g fill="#0a0314">
        <g>
          <circle cx="12" cy="188" r="9" />
          <path d="M-3 204 Q-1 196 12 196 Q25 196 27 204 Z" />
        </g>
        <g>
          <circle cx="46" cy="191" r="9" />
          <path d="M31 204 Q33 199 46 199 Q59 199 61 204 Z" />
        </g>
        <g>
          <circle cx="84" cy="188" r="9" />
          <path d="M69 204 Q71 196 84 196 Q97 196 99 204 Z" />
        </g>
        <g>
          <circle cx="122" cy="191" r="9" />
          <path d="M107 204 Q109 199 122 199 Q135 199 137 204 Z" />
        </g>
        <g>
          <circle cx="160" cy="188" r="9" />
          <path d="M145 204 Q147 196 160 196 Q173 196 175 204 Z" />
        </g>
        <g>
          <circle cx="198" cy="191" r="9" />
          <path d="M183 204 Q185 199 198 199 Q211 199 213 204 Z" />
        </g>
        <g>
          <circle cx="236" cy="188" r="9" />
          <path d="M221 204 Q223 196 236 196 Q249 196 251 204 Z" />
        </g>
        <g>
          <circle cx="274" cy="191" r="9" />
          <path d="M259 204 Q261 199 274 199 Q287 199 289 204 Z" />
        </g>
        <g>
          <circle cx="308" cy="188" r="9" />
          <path d="M293 204 Q295 196 308 196 Q321 196 323 204 Z" />
        </g>
        <path d="M84 184 L81 168 L85 168 L88 184 Z M236 184 L240 166 L244 167 L240 184 Z" />
      </g>
      <g>
        <rect className="ka-confetti" x="46" y="-8" width="2.6" height="4" fill="#ff5fa8" style={{ "animationDelay": "0s", "animationDuration": "7s" } as CSSProperties} />
        <rect className="ka-confetti" x="99" y="-37" width="3.4000000000000004" height="5.6" fill="#ffe27a" style={{ "animationDelay": "-1.1s", "animationDuration": "8s" } as CSSProperties} />
        <rect className="ka-confetti" x="152" y="-26" width="4.2" height="4" fill="#c9a2ff" style={{ "animationDelay": "-2.2s", "animationDuration": "9s" } as CSSProperties} />
        <rect className="ka-confetti" x="205" y="-15" width="2.6" height="5.6" fill="#ffffff" style={{ "animationDelay": "-3.3s", "animationDuration": "10s" } as CSSProperties} />
        <rect className="ka-confetti" x="258" y="-44" width="3.4000000000000004" height="4" fill="#ff9ccd" style={{ "animationDelay": "-4.4s", "animationDuration": "7s" } as CSSProperties} />
        <rect className="ka-confetti" x="81" y="-33" width="4.2" height="5.6" fill="#35e6d8" style={{ "animationDelay": "-5.5s", "animationDuration": "8s" } as CSSProperties} />
        <rect className="ka-confetti" x="134" y="-22" width="2.6" height="4" fill="#ff5fa8" style={{ "animationDelay": "-6.6s", "animationDuration": "9s" } as CSSProperties} />
        <rect className="ka-confetti" x="187" y="-11" width="3.4000000000000004" height="5.6" fill="#ffe27a" style={{ "animationDelay": "-7.7s", "animationDuration": "10s" } as CSSProperties} />
        <rect className="ka-confetti" x="240" y="-40" width="4.2" height="4" fill="#c9a2ff" style={{ "animationDelay": "-8.8s", "animationDuration": "7s" } as CSSProperties} />
      </g>
      <rect width="320" height="200" fill={`url(#${u}v)`} />
    </svg>
    </>
  );
}

function TriviaArt({ u }: { u: string }) {
  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${u}w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0c1d58" />
          <stop offset="1" stopColor="#050826" />
        </linearGradient>
        <linearGradient id={`${u}q`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.38" stopColor="#d6f4ff" />
          <stop offset="0.72" stopColor="#4aa3ff" />
          <stop offset="1" stopColor="#1f6fd6" />
        </linearGradient>
        <linearGradient id={`${u}a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#35e6d8" />
          <stop offset="0.5" stopColor="#4aa3ff" />
          <stop offset="1" stopColor="#7c8cff" />
        </linearGradient>
        <radialGradient id={`${u}o`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#35e6d8" stopOpacity="0.34" />
          <stop offset="0.6" stopColor="#4aa3ff" stopOpacity="0.14" />
          <stop offset="1" stopColor="#4aa3ff" stopOpacity="0" />
        </radialGradient>
        <pattern id={`${u}z`} width="4" height="3" patternUnits="userSpaceOnUse">
          <rect width="4" height="1" fill="#9fd0ff" opacity="0.07" />
        </pattern>
        <radialGradient id={`${u}h`} cx="0.5" cy="0.4" r="0.6">
          <stop offset="0" stopColor="#4aa3ff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#4aa3ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${u}j`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9fd0ff" stopOpacity="0.38" />
          <stop offset="1" stopColor="#9fd0ff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${u}g`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <pattern id={`${u}x`} width="24" height="20.8" patternUnits="userSpaceOnUse" patternTransform="translate(0 -3)">
          <path d="M12 0 L24 6.9 V20.8 M12 0 L0 6.9 V20.8 M0 20.8 L12 13.9 L24 20.8" fill="none" stroke="#4aa3ff" strokeWidth="0.6" opacity="0.28" />
        </pattern>
        <clipPath id={`${u}s`}>
          <rect x="44" y="22" width="232" height="104" rx="10" />
        </clipPath>
      </defs>
      <rect width="320" height="200" fill={`url(#${u}w)`} />
      <rect width="320" height="200" fill={`url(#${u}x)`} />
      <rect width="320" height="200" fill={`url(#${u}h)`} />
      <g fill="none" stroke="#35e6d8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M44 56 H30 V36 H10" strokeWidth="0.9" opacity="0.32" />
        <path className="ka-trace" d="M44 56 H30 V36 H10" pathLength="100" strokeWidth="1.5" opacity="0.9" style={{ "animationDelay": "0s" } as CSSProperties} />
        <circle cx="10" cy="36" r="1.8" fill="#35e6d8" stroke="none" opacity="0.7" />
      </g>
      <g fill="none" stroke="#35e6d8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M44 92 H22 V134 H6" strokeWidth="0.9" opacity="0.32" />
        <path className="ka-trace" d="M44 92 H22 V134 H6" pathLength="100" strokeWidth="1.5" opacity="0.9" style={{ "animationDelay": "-1.1s" } as CSSProperties} />
        <circle cx="6" cy="134" r="1.8" fill="#35e6d8" stroke="none" opacity="0.7" />
      </g>
      <g fill="none" stroke="#35e6d8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M276 56 H290 V36 H310" strokeWidth="0.9" opacity="0.32" />
        <path className="ka-trace" d="M276 56 H290 V36 H310" pathLength="100" strokeWidth="1.5" opacity="0.9" style={{ "animationDelay": "-2.2s" } as CSSProperties} />
        <circle cx="310" cy="36" r="1.8" fill="#35e6d8" stroke="none" opacity="0.7" />
      </g>
      <g fill="none" stroke="#35e6d8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M276 124 H298 V150 H314" strokeWidth="0.9" opacity="0.32" />
        <path className="ka-trace" d="M276 124 H298 V150 H314" pathLength="100" strokeWidth="1.5" opacity="0.9" style={{ "animationDelay": "-3.3s" } as CSSProperties} />
        <circle cx="314" cy="150" r="1.8" fill="#35e6d8" stroke="none" opacity="0.7" />
      </g>
      <path className="ka-beam" d="M20 -6 L-10 130 L120 130 Z" fill={`url(#${u}j)`} />
      <path className="ka-beam ka-beam-b" d="M300 -6 L210 130 L330 130 Z" fill={`url(#${u}j)`} />
      <circle className="ka-bulb" cx="14" cy="9" r="2.3" fill="#ffe27a" opacity="0.9" />
      <circle className="ka-bulb ka-bulb-b" cx="28.6" cy="9" r="2.3" fill="#9fd0ff" opacity="0.9" />
      <circle className="ka-bulb" cx="43.2" cy="9" r="2.3" fill="#9fd0ff" opacity="0.9" />
      <circle className="ka-bulb ka-bulb-b" cx="57.8" cy="9" r="2.3" fill="#ffe27a" opacity="0.9" />
      <circle className="ka-bulb" cx="72.4" cy="9" r="2.3" fill="#9fd0ff" opacity="0.9" />
      <circle className="ka-bulb ka-bulb-b" cx="87" cy="9" r="2.3" fill="#9fd0ff" opacity="0.9" />
      <circle className="ka-bulb" cx="101.6" cy="9" r="2.3" fill="#ffe27a" opacity="0.9" />
      <circle className="ka-bulb ka-bulb-b" cx="116.2" cy="9" r="2.3" fill="#9fd0ff" opacity="0.9" />
      <circle className="ka-bulb" cx="130.8" cy="9" r="2.3" fill="#9fd0ff" opacity="0.9" />
      <circle className="ka-bulb ka-bulb-b" cx="145.4" cy="9" r="2.3" fill="#ffe27a" opacity="0.9" />
      <circle className="ka-bulb" cx="160" cy="9" r="2.3" fill="#9fd0ff" opacity="0.9" />
      <circle className="ka-bulb ka-bulb-b" cx="174.6" cy="9" r="2.3" fill="#9fd0ff" opacity="0.9" />
      <circle className="ka-bulb" cx="189.2" cy="9" r="2.3" fill="#ffe27a" opacity="0.9" />
      <circle className="ka-bulb ka-bulb-b" cx="203.79999999999998" cy="9" r="2.3" fill="#9fd0ff" opacity="0.9" />
      <circle className="ka-bulb" cx="218.4" cy="9" r="2.3" fill="#9fd0ff" opacity="0.9" />
      <circle className="ka-bulb ka-bulb-b" cx="233" cy="9" r="2.3" fill="#ffe27a" opacity="0.9" />
      <circle className="ka-bulb" cx="247.6" cy="9" r="2.3" fill="#9fd0ff" opacity="0.9" />
      <circle className="ka-bulb ka-bulb-b" cx="262.2" cy="9" r="2.3" fill="#9fd0ff" opacity="0.9" />
      <circle className="ka-bulb" cx="276.8" cy="9" r="2.3" fill="#ffe27a" opacity="0.9" />
      <circle className="ka-bulb ka-bulb-b" cx="291.4" cy="9" r="2.3" fill="#9fd0ff" opacity="0.9" />
      <circle className="ka-bulb" cx="306" cy="9" r="2.3" fill="#9fd0ff" opacity="0.9" />
      <rect x="44" y="22" width="232" height="104" rx="10" fill="#050a26" stroke={`url(#${u}a)`} strokeWidth="2.4" />
      <rect x="50" y="28" width="220" height="92" rx="6" fill="none" stroke="#7cbcff" strokeWidth="0.8" opacity="0.5" />
      <rect x="50" y="28" width="220" height="92" rx="6" fill={`url(#${u}z)`} />
      <path d="M54 40 V32 H62 M266 40 V32 H258 M54 108 V116 H62 M266 108 V116 H258" fill="none" stroke="#35e6d8" strokeWidth="1.4" strokeLinecap="round" opacity="0.85" />
      <circle cx="160" cy="72" r="52" fill={`url(#${u}o)`} />
      <circle cx="160" cy="72" r="35" fill="none" stroke="#35e6d8" strokeWidth="0.8" opacity="0.4" />
      <circle className="ka-ring" cx="160" cy="72" r="42" fill="none" stroke="#35e6d8" strokeWidth="1.2" strokeDasharray="3 6" opacity="0.8" />
      <g fontFamily="JetBrains Mono Variable, monospace" fontWeight="800" fill="#35e6d8">
        <text className="ka-glyph" x="60" y="52" fontSize="12">
          {"</>"}
        </text>
        <text className="ka-glyph ka-glyph-b" x="62" y="112" fontSize="13">
          {"{ }"}
        </text>
        <text className="ka-glyph ka-glyph-b" x="212" y="52" fontSize="11">
          {"01"}
        </text>
        <text className="ka-glyph" x="214" y="116" fontSize="11">
          {"AI"}
        </text>
      </g>
      <g fill="none" stroke="#35e6d8" strokeWidth="1" opacity="0.7" strokeLinecap="round">
        <rect x="62" y="68" width="16" height="16" rx="2" />
        <rect x="67" y="73" width="6" height="6" rx="1" fill="#35e6d8" opacity="0.5" />
        <path d="M66 68 v-4 M72 68 v-4 M66 84 v4 M72 84 v4 M62 72 h-4 M62 80 h-4 M78 72 h4 M78 80 h4" />
      </g>
      <g className="ka-q">
        <text x="160" y="104" textAnchor="middle" fontSize="92" fontWeight="900" fontStyle="italic" fill={`url(#${u}q)`} fontFamily="Outfit Variable, Outfit, system-ui, sans-serif">
          {"?"}
        </text>
      </g>
      <g clipPath={`url(#${u}s)`}>
        <rect className="ka-glint" x="-60" y="14" width="46" height="120" fill={`url(#${u}g)`} transform="skewX(-18)" />
      </g>
      <circle cx="248" cy="98" r="12" fill="none" stroke="#173a2a" strokeWidth="3" />
      <circle className="ka-timer" cx="248" cy="98" r="12" fill="none" stroke="#2ee86b" strokeWidth="3" strokeDasharray="56 76" transform="rotate(-90 248 98)" />
      <text x="248" y="102" textAnchor="middle" fontSize="11" fontWeight="900" fill="#c9ffe0" fontFamily="JetBrains Mono Variable, monospace">
        {"20"}
      </text>
      <g>
        <rect x="30" y="140" width="60" height="34" rx="8" fill="#0a1236" stroke="#4aa3ff" strokeWidth="1.4" />
        <rect x="37" y="148" width="18" height="18" rx="5" fill="#4aa3ff" opacity="0.8" />
        <text x="46" y="161" textAnchor="middle" fontSize="12" fontWeight="900" fill="#05102e" fontFamily="JetBrains Mono Variable, monospace">
          {"A"}
        </text>
        <rect x="61" y="152" width="22" height="3" rx="1.5" fill="#4aa3ff" opacity="0.55" />
        <rect x="61" y="160" width="14" height="3" rx="1.5" fill="#4aa3ff" opacity="0.35" />
      </g>
      <g>
        <rect x="100" y="140" width="60" height="34" rx="8" fill="#0a1236" stroke="#35e6d8" strokeWidth="1.4" />
        <rect x="107" y="148" width="18" height="18" rx="5" fill="#35e6d8" opacity="0.8" />
        <text x="116" y="161" textAnchor="middle" fontSize="12" fontWeight="900" fill="#05102e" fontFamily="JetBrains Mono Variable, monospace">
          {"B"}
        </text>
        <rect x="131" y="152" width="22" height="3" rx="1.5" fill="#35e6d8" opacity="0.55" />
        <rect x="131" y="160" width="14" height="3" rx="1.5" fill="#35e6d8" opacity="0.35" />
      </g>
      <g className="ka-hot">
        <rect x="170" y="140" width="60" height="34" rx="8" fill="#0e3b22" stroke="#2ee86b" strokeWidth="2.6" />
        <rect x="177" y="148" width="18" height="18" rx="5" fill="#2ee86b" opacity="1" />
        <text x="186" y="161" textAnchor="middle" fontSize="12" fontWeight="900" fill="#05102e" fontFamily="JetBrains Mono Variable, monospace">
          {"C"}
        </text>
        <rect x="201" y="152" width="22" height="3" rx="1.5" fill="#2ee86b" opacity="0.55" />
        <rect x="201" y="160" width="14" height="3" rx="1.5" fill="#2ee86b" opacity="0.35" />
      </g>
      <g>
        <rect x="240" y="140" width="60" height="34" rx="8" fill="#0a1236" stroke="#ffcf4a" strokeWidth="1.4" />
        <rect x="247" y="148" width="18" height="18" rx="5" fill="#ffcf4a" opacity="0.8" />
        <text x="256" y="161" textAnchor="middle" fontSize="12" fontWeight="900" fill="#05102e" fontFamily="JetBrains Mono Variable, monospace">
          {"D"}
        </text>
        <rect x="271" y="152" width="22" height="3" rx="1.5" fill="#ffcf4a" opacity="0.55" />
        <rect x="271" y="160" width="14" height="3" rx="1.5" fill="#ffcf4a" opacity="0.35" />
      </g>
      <g>
        <rect x="30" y="180" width="270" height="4.4" rx="2.2" fill="#fff" opacity="0.06" />
        <rect className="ka-bar" x="30" y="180" width="118" height="4.4" rx="2.2" fill="#ffb02e" style={{ "animationDelay": "0s" } as CSSProperties} />
      </g>
      <g>
        <rect x="30" y="187" width="270" height="4.4" rx="2.2" fill="#fff" opacity="0.06" />
        <rect className="ka-bar" x="30" y="187" width="84" height="4.4" rx="2.2" fill="#b98cff" style={{ "animationDelay": "0.15s" } as CSSProperties} />
      </g>
      <g>
        <rect x="30" y="194" width="270" height="4.4" rx="2.2" fill="#fff" opacity="0.06" />
        <rect className="ka-bar" x="30" y="194" width="52" height="4.4" rx="2.2" fill="#35e6d8" style={{ "animationDelay": "0.3s" } as CSSProperties} />
      </g>
      <defs>
        <radialGradient id={`${u}v`} cx="0.5" cy="0.48" r="0.75">
          <stop offset="0.55" stopColor="#02030f" stopOpacity="0" />
          <stop offset="1" stopColor="#02030f" stopOpacity="0.62" />
        </radialGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#${u}v)`} />
    </svg>
  );
}

function CardsArt({ u }: { u: string }) {
  return (
    <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id={`${u}felt`} cx="0.5" cy="0.45" r="0.75">
          <stop offset="0" stopColor="#13a06f" />
          <stop offset="0.6" stopColor="#0b6e4d" />
          <stop offset="1" stopColor="#053a29" />
        </radialGradient>
        <radialGradient id={`${u}glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff3c4" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff3c4" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#${u}felt)`} />
      <ellipse cx="160" cy="100" rx="150" ry="86" fill="none" stroke="#f3c969" strokeOpacity="0.35" strokeWidth="2" />
      <ellipse cx="160" cy="104" rx="96" ry="72" fill={`url(#${u}glow)`} className="ka-cards-glow" />
      <g className="ka-cards-fan">
        <g transform="rotate(-16 160 170)">
          <CardBack x={112} y={34} width={66} height={92} />
        </g>
        <g transform="rotate(16 160 170)">
          <CardBack x={142} y={34} width={66} height={92} />
        </g>
        <g className="ka-cards-joker">
          <JokerFace x={127} y={26} width={66} height={92} />
        </g>
      </g>
      <g className="ka-cards-spark" fill="#fff7d6">
        <path d="M86 52l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" />
        <path d="M236 132l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
        <path d="M244 46l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
      </g>
      <g fontFamily="Georgia, serif" fontWeight="700" fontSize="22" fill="#f3c969" fillOpacity="0.55">
        <text x="30" y="178">♠</text>
        <text x="62" y="186">♥</text>
        <text x="262" y="182">♦</text>
        <text x="288" y="172">♣</text>
      </g>
    </svg>
  );
}
