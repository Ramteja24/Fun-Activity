import type { ReactNode } from 'react';
import { figureJoints, FIGURE_VIEW, type PoseFace, type PoseFigure, type Pt } from '../../shared/poses';

const INK = '#2a1608';
const SKIN = '#ffd58a';

const line = (d: string, w = 2.6) => <path d={d} fill="none" stroke={INK} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />;
const dot = (x: number, y = -5, r = 3.2) => <circle cx={x} cy={y} r={r} fill={INK} />;
const wideEye = (x: number, pupil = 0) => (
  <g>
    <circle cx={x} cy={-5} r={6.6} fill="#fff" stroke={INK} strokeWidth={2} />
    <circle cx={x + pupil} cy={-5} r={2.5} fill={INK} />
  </g>
);

/** The expression, drawn in a local frame centred on the head (radius 26). */
function Face({ kind }: { kind: PoseFace }): ReactNode {
  switch (kind) {
    case 'confused':
      return (
        <>
          {dot(-9)}
          {dot(9)}
          {line('M-16 -14 q6 -6 12 -2')}
          {line('M4 -15 l11 4')}
          {line('M-9 12 q4 -5 9 0 t9 0')}
        </>
      );
    case 'shocked':
      return (
        <>
          {wideEye(-9)}
          {wideEye(9)}
          {line('M-17 -17 q7 -5 13 0')}
          {line('M4 -17 q7 -5 13 0')}
          <ellipse cx={0} cy={12} rx={5} ry={7} fill={INK} />
        </>
      );
    case 'laugh':
      return (
        <>
          {line('M-15 -3 q6 -8 12 0')}
          {line('M3 -3 q6 -8 12 0')}
          <path d="M-12 5 q12 20 24 0 z" fill={INK} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
          <path d="M-6 13 q6 5 12 0 q-6 -3 -12 0 z" fill="#ff6b8a" />
        </>
      );
    case 'cry':
      return (
        <>
          {line('M-15 -4 q6 6 12 0')}
          {line('M3 -4 q6 6 12 0')}
          {line('M-16 -12 l11 -4')}
          {line('M5 -16 l11 4')}
          <path d="M-8 14 q8 -9 16 0 q-8 3 -16 0 z" fill={INK} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
        </>
      );
    case 'scared':
      return (
        <>
          {wideEye(-9, 1.5)}
          {wideEye(9, -1.5)}
          {line('M-16 -12 l11 -5')}
          {line('M5 -17 l11 5')}
          {line('M-10 13 q2.5 -4 5 0 t5 0 t5 0 t5 0')}
        </>
      );
    case 'angry':
      return (
        <>
          {dot(-8)}
          {dot(8)}
          {line('M-17 -15 l11 6', 3.2)}
          {line('M6 -9 l11 -6', 3.2)}
          {line('M-10 15 q10 -9 20 0')}
        </>
      );
    case 'determined':
      return (
        <>
          {dot(-9)}
          {dot(9)}
          {line('M-16 -13 l11 3', 3)}
          {line('M5 -10 l11 -3', 3)}
          {line('M-8 12 q8 5 16 -1')}
        </>
      );
    case 'sleep':
      return (
        <>
          {line('M-15 -4 h10')}
          {line('M5 -4 h10')}
          <ellipse cx={0} cy={12} rx={3} ry={3.6} fill="none" stroke={INK} strokeWidth={2.4} />
        </>
      );
    case 'yawn':
      return (
        <>
          {line('M-15 -5 q6 5 12 0')}
          {line('M3 -5 q6 5 12 0')}
          <ellipse cx={0} cy={13} rx={7} ry={10} fill={INK} />
        </>
      );
    case 'think':
      return (
        <>
          {dot(-9, -6)}
          {dot(9, -6)}
          {line('M-16 -15 q6 -6 12 -1')}
          {line('M4 -14 h11')}
          {line('M-3 13 q5 -4 11 -1')}
        </>
      );
    case 'smug':
      return (
        <>
          {line('M-15 -4 h10')}
          {line('M5 -4 h10')}
          {line('M-15 -9 q5 -3 10 0')}
          {line('M5 -9 q5 -3 10 0')}
          {line('M-9 10 q9 7 18 -1')}
        </>
      );
    case 'cool':
      return (
        <>
          <rect x={-18} y={-11} width={15} height={10} rx={3} fill={INK} />
          <rect x={3} y={-11} width={15} height={10} rx={3} fill={INK} />
          {line('M-3 -7 h6', 3)}
          {line('M-9 11 q9 8 18 0')}
        </>
      );
    case 'silly':
      return (
        <>
          {wideEye(-9, 3.5)}
          {wideEye(9, -3.5)}
          {line('M-9 10 q9 7 18 0')}
          <path d="M-3 15 q3 10 6 0 z" fill="#ff6b8a" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
        </>
      );
    case 'dizzy':
      return (
        <>
          {line('M-15 -10 l9 9 m0 -9 l-9 9')}
          {line('M6 -10 l9 9 m0 -9 l-9 9')}
          {line('M-9 13 q3 -4 6 0 t6 0 t6 0')}
        </>
      );
    case 'wink':
      return (
        <>
          {line('M-15 -4 h10')}
          {dot(9)}
          {line('M-9 11 q9 8 18 -1')}
        </>
      );
    case 'grin':
      return (
        <>
          {dot(-9)}
          {dot(9)}
          <path d="M-12 6 q12 14 24 0 z" fill="#fff" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" />
        </>
      );
    case 'roar':
      return (
        <>
          {dot(-8)}
          {dot(8)}
          {line('M-16 -14 l10 4', 3)}
          {line('M6 -10 l10 -4', 3)}
          <path d="M-13 7 q13 -5 26 0 q-3 16 -13 16 q-10 0 -13 -16 z" fill={INK} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
          <path d="M-9 8 h18" stroke="#fff" strokeWidth={3} strokeDasharray="3 2" fill="none" />
        </>
      );
    case 'robot':
      return (
        <>
          <rect x={-15} y={-10} width={9} height={9} fill={INK} />
          <rect x={6} y={-10} width={9} height={9} fill={INK} />
          {line('M-9 12 h18 M-4 9 v6 M0 9 v6 M4 9 v6', 2.2)}
        </>
      );
    case 'meh':
      return (
        <>
          {dot(-9)}
          {dot(9)}
          {line('M-16 -14 q6 -3 12 0')}
          {line('M4 -14 q6 -3 12 0')}
          {line('M-7 12 h14')}
        </>
      );
  }
}

const bodyPath = (...pts: Pt[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

/**
 * The reference picture for a pose: a simple figure drawn from its joint angles (see `figureJoints`), with the expression on its
 * face and any props. Pure SVG, so it scales to any screen and needs no image files.
 */
export function PoseDrawing({ figure, label, className }: { figure: PoseFigure; label?: string; className?: string }) {
  const j = figureJoints(figure);
  const props = figure.props ?? [];
  const lean = figure.lean ?? 0;
  const headTurn = lean + (figure.tilt ?? 0);
  const limb = { fill: 'none', stroke: 'var(--pf-body, #3f4867)', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const flow = -lean * 2.2; // a cape streams away from the direction of travel
  return (
    <svg viewBox={`0 0 ${FIGURE_VIEW.width} ${FIGURE_VIEW.height}`} className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <ellipse cx={120} cy={288} rx={72} ry={6} fill="rgba(21,26,45,.12)" />
      {props.includes('cape') && (
        <path
          d={`M${j.shoulderL.x} ${j.shoulderL.y} L${j.shoulderR.x} ${j.shoulderR.y} Q${j.hip.x + 62 + flow} ${j.hip.y + 6} ${j.hip.x + 50 + flow} ${j.hip.y + 66} Q${j.hip.x + flow} ${j.hip.y + 48} ${j.hip.x - 50 + flow} ${j.hip.y + 70} Q${j.hip.x - 60 + flow} ${j.hip.y + 8} ${j.shoulderL.x} ${j.shoulderL.y} Z`}
          fill="#ff4d6d"
          stroke="#b01837"
          strokeWidth={3}
          strokeLinejoin="round"
          opacity={0.95}
        />
      )}
      <g {...limb} strokeWidth={9}>
        <path d={bodyPath(j.shoulderL, j.elbowL, j.handL)} />
        <path d={bodyPath(j.shoulderR, j.elbowR, j.handR)} />
        <path d={bodyPath(j.hipL, j.kneeL, j.footL)} />
        <path d={bodyPath(j.hipR, j.kneeR, j.footR)} />
      </g>
      <path d={bodyPath(j.hip, j.neck)} {...limb} strokeWidth={13} />
      <path d={bodyPath(j.shoulderL, j.shoulderR)} {...limb} strokeWidth={11} />
      {[j.handL, j.handR].map((h, i) => (
        <circle key={i} cx={h.x} cy={h.y} r={7.5} fill={SKIN} stroke={INK} strokeWidth={2} />
      ))}
      {[j.footL, j.footR].map((f, i) => (
        <ellipse key={i} cx={f.x + (i === 0 ? -5 : 5)} cy={f.y + 3} rx={9} ry={5} fill="var(--pf-body, #3f4867)" stroke={INK} strokeWidth={2} />
      ))}
      {props.includes('phone') && <rect x={j.handR.x - 3} y={j.handR.y - 26} width={15} height={26} rx={3} fill="#151a2d" stroke="#3f4867" strokeWidth={2} transform={`rotate(12 ${j.handR.x} ${j.handR.y})`} />}
      <circle cx={j.head.x} cy={j.head.y} r={26} fill={SKIN} stroke={INK} strokeWidth={3} />
      <g transform={`translate(${j.head.x.toFixed(1)} ${j.head.y.toFixed(1)}) rotate(${headTurn})`}>
        <Face kind={figure.face} />
      </g>
      {props.includes('zzz') && (
        <g fill="#5b8def" fontWeight={900} fontFamily="var(--font-display, sans-serif)">
          <text x={j.head.x + 30} y={j.head.y - 20} fontSize={22}>
            Z
          </text>
          <text x={j.head.x + 48} y={j.head.y - 38} fontSize={16}>
            z
          </text>
          <text x={j.head.x + 60} y={j.head.y - 52} fontSize={12}>
            z
          </text>
        </g>
      )}
      {props.includes('tears') && (
        <g fill="#6ec8ff" stroke="#2f86c4" strokeWidth={1.5}>
          <path d={`M${j.head.x - 15} ${j.head.y + 2} q-5 12 0 16 q5 -4 0 -16 z`} />
          <path d={`M${j.head.x + 15} ${j.head.y + 2} q-5 12 0 16 q5 -4 0 -16 z`} />
          <path d={`M${j.head.x - 26} ${j.head.y + 12} q-4 9 0 12 q4 -3 0 -12 z`} />
          <path d={`M${j.head.x + 26} ${j.head.y + 12} q-4 9 0 12 q4 -3 0 -12 z`} />
        </g>
      )}
      {props.includes('sweat') && <path d={`M${j.head.x + 32} ${j.head.y - 22} q-7 13 0 18 q7 -5 0 -18 z`} fill="#6ec8ff" stroke="#2f86c4" strokeWidth={1.5} />}
      {props.includes('anger') && (
        <g stroke="#ff4d6d" strokeWidth={4} strokeLinecap="round" fill="none">
          <path d={`M${j.head.x + 28} ${j.head.y - 36} l8 -8 M${j.head.x + 40} ${j.head.y - 34} l-8 8`} />
          <path d={`M${j.head.x + 30} ${j.head.y - 26} q6 4 10 0`} />
        </g>
      )}
      {props.includes('stars') && (
        <g fill="#f5b301" fontSize={20}>
          <text x={j.head.x - 52} y={j.head.y - 20}>
            ★
          </text>
          <text x={j.head.x + 34} y={j.head.y - 28}>
            ★
          </text>
          <text x={j.head.x - 8} y={j.head.y - 36}>
            ★
          </text>
        </g>
      )}
      {props.includes('sparkles') && (
        <g fill="#f5b301" fontSize={22}>
          <text x={j.head.x - 56} y={j.head.y - 4}>
            ✦
          </text>
          <text x={j.head.x + 38} y={j.head.y - 18}>
            ✦
          </text>
          <text x={j.head.x + 46} y={j.head.y + 26} fontSize={14}>
            ✦
          </text>
        </g>
      )}
      {props.includes('music') && (
        <g fill="#db2777" fontSize={26} fontWeight={900}>
          <text x={j.head.x - 64} y={j.head.y - 6}>
            ♪
          </text>
          <text x={j.head.x + 40} y={j.head.y - 26}>
            ♫
          </text>
        </g>
      )}
    </svg>
  );
}
