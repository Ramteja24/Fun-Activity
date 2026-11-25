import { useId, type CSSProperties } from 'react';

// TypeDrive's racing wordmark: "TYPE FAST. DRIVE FASTER." drawn so that the words ARE a right-facing sports coupé.
//
//  • Two rows of custom italic vector letters. The upper row ("TYPE FAST.") is the greenhouse: every letter's top edge is cut along one
//    smooth roofline — a short fastback rising to the roof crown, then a raked windshield down to the cowl. The lower row
//    ("DRIVE FASTER.") is the body: its top edge is the beltline, which drops into a low rear deck at the tail and a long, gently
//    falling bonnet at the nose, and its bottom edge lifts into the rear underbody line.
//  • The wheels sit under the two narrowest letters — the "I" of DRIVE (rear) and the second "T" of FASTER (front) — and the wheel
//    arches are cut out of the lettering with a mask, so no word is hidden behind a wheel. Each wheel is tucked into its arch, with a
//    wheel-house liner behind it and a flared lip over it, so it is physically part of the body.
//  • Only what a car needs besides letters is drawn: tinted glass behind the cabin letters, a roof rail, a nose cone behind the final
//    "R." with its intakes, headlight and splitter, a rear wing on two pylons, a tail-lamp, a rocker sill, and two booster nozzles set
//    into the tail. Everything else is the lettering itself.
//  • The motion is all CSS (src/brand.css): the whole car arrives at speed, the wheels spin down, the boosters ignite and burn back to
//    a small idle flame, and the body settles into a faint suspension bob. Nothing here is an image.

const ITALIC_SHEAR = 0.245; // ~13.8° forward lean
const SHEAR_REF_Y = 164;

const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Upright chassis coordinates (u, y) → forward-leaning screen coordinates (x, y). */
function pt(u: number, y: number): [number, number] {
  return [r1(u + ITALIC_SHEAR * (SHEAR_REF_Y - y)), r1(y)];
}

/** A closed polygon from chassis coordinates (leaned). */
function poly(points: ReadonlyArray<readonly [number, number]>): string {
  return (
    points
      .map(([u, y], idx) => {
        const [x, py] = pt(u, y);
        return `${idx === 0 ? 'M' : 'L'}${x} ${py}`;
      })
      .join(' ') + ' Z'
  );
}

/** A closed polygon from screen coordinates (for the round arches and flares, which must not lean). */
function screenPoly(points: ReadonlyArray<readonly [number, number]>): string {
  return points.map(([x, y], idx) => `${idx === 0 ? 'M' : 'L'}${r1(x)} ${r1(y)}`).join(' ') + ' Z';
}

// ------------------------------------------------------------------------------------------------ the profile of the car
const CABIN_BOT_Y = 111; // the upper row stands on the belt line
const BODY_BELT_Y = 114; // the lower row's flat top (the door tops)
const BODY_SILL_Y = 240; // the lower row's bottom edge (the sill)
const WHEEL_CY = 236;
const TYRE_R = 45; // 28% larger than the first version's 35
const ARCH_R = 50;
const REAR_U = 229; // the "I" of DRIVE
const FRONT_U = 714; // the second "T" of FASTER

/** The roofline y(u) over "TYPE FAST.": fastback → roof crown → raked windshield (u = 196 .. 632). */
function cabinTopY(u: number): number {
  if (u <= 330) {
    const t = clamp01((u - 196) / 134);
    return 70 - 36 * Math.sin(t * Math.PI * 0.5);
  }
  if (u <= 440) {
    const t = (u - 330) / 110;
    return 34 + 3 * t * t;
  }
  const t = clamp01((u - 440) / 192);
  return 37 + 45 * Math.pow(t, 1.25);
}

/** The beltline y(u) over "DRIVE FASTER.": a low rear deck, flat doors, a long bonnet falling toward the nose. */
function bodyTopY(u: number): number {
  if (u < 130) return BODY_BELT_Y + 10 * Math.pow(clamp01((130 - u) / 90), 1.3);
  if (u <= 660) return BODY_BELT_Y;
  return BODY_BELT_Y + 34 * Math.pow(clamp01((u - 660) / 290), 1.15);
}

/** The lower edge y(u): flat sill, lifting into the rear underbody line at the tail. */
function bodyBotY(u: number): number {
  if (u < 84) return BODY_SILL_Y - 12 * Math.pow(clamp01((84 - u) / 44), 1.2);
  return BODY_SILL_Y;
}

type EdgeFn = (u: number) => number;

interface GlyphBox {
  ch: string;
  u0: number;
  u1: number;
  top: EdgeFn;
  bot: EdgeFn;
  fastbackLead?: boolean;
  windshieldTrail?: boolean;
}

/** One custom motorsport letter, sculpted between the top(u) and bottom(u) edges of the car. */
function buildGlyphPath(g: GlyphBox): string {
  const { ch, u0, u1, top, bot } = g;
  const W = u1 - u0;
  const uAt = (s: number) => u0 + s * W;
  const yAt = (u: number, t: number) => {
    const yt = top(u);
    const yb = bot(u);
    return yt + t * (yb - yt);
  };
  const p = (u: number, t: number): readonly [number, number] => [u, yAt(u, t)];

  const Hmid = bot((u0 + u1) / 2) - top((u0 + u1) / 2);
  const sw = Math.min(21.8, Math.max(14.5, W * 0.282));
  const bt = Math.min(0.24, Math.max(0.194, 16.6 / Hmid));

  switch (ch) {
    case 'T': {
      const um = (u0 + u1) * 0.5;
      const sl = um - sw * 0.5;
      const sr = um + sw * 0.5;
      if (g.fastbackLead) {
        return poly([p(u0 + 5, 0), p(u1, 0), p(u1 - 4, bt), p(sr, bt), p(sr, 1), p(sl, 1), p(sl, bt + 0.02), p(u0 - 6, bt + 0.06)]);
      }
      const rTop = g.windshieldTrail ? u1 - 2 : u1;
      const rBot = g.windshieldTrail ? u1 + 5 : u1 - 5;
      return poly([p(u0 + 3, 0), p(rTop, 0), p(rBot, bt), p(sr, bt), p(sr, 1), p(sl, 1), p(sl, bt), p(u0 - 2, bt)]);
    }

    case 'Y': {
      const um = (u0 + u1) * 0.5;
      const sl = um - sw * 0.5;
      const sr = um + sw * 0.5;
      return poly([p(u0, 0), p(u0 + sw * 1.04, 0), p(um, 0.36), p(u1 - sw * 1.04, 0), p(u1, 0), p(sr, 0.56), p(sr, 1), p(sl, 1), p(sl, 0.56)]);
    }

    case 'P': {
      const bowlB = 0.62;
      const outer = poly([p(u0 + 4, 0), p(u1 - 10, 0), p(u1, 0.14), p(u1, bowlB - 0.14), p(u1 - 11, bowlB), p(u0 + sw, bowlB), p(u0 + sw, 1), p(u0, 1), p(u0, 0.08)]);
      const inner = poly([p(u0 + sw, bt), p(u1 - sw * 0.94, bt), p(u1 - sw * 0.8, bt + 0.06), p(u1 - sw * 0.8, bowlB - bt - 0.05), p(u1 - sw * 0.94, bowlB - bt), p(u0 + sw, bowlB - bt)]);
      return `${outer} ${inner}`;
    }

    case 'E': {
      const midT = 0.5 - bt * 0.44;
      const midB = 0.5 + bt * 0.44;
      return poly([
        p(u0 + 5, 0),
        p(u1, 0),
        p(u1 - 5.5, bt),
        p(u0 + sw, bt),
        p(u0 + sw, midT),
        p(u1 - 6.5, midT),
        p(u1 - 12, midB),
        p(u0 + sw, midB),
        p(u0 + sw, 1 - bt),
        p(u1 - 2.5, 1 - bt),
        p(u1 + 1, 1),
        p(u0, 1),
        p(u0, 0.08),
      ]);
    }

    case 'F': {
      const midT = 0.44;
      const midB = midT + bt * 0.9;
      return poly([p(u0 + 5, 0), p(u1, 0), p(u1 - 5.5, bt), p(u0 + sw, bt), p(u0 + sw, midT), p(u1 - 7.5, midT), p(u1 - 13, midB), p(u0 + sw, midB), p(u0 + sw, 1), p(u0, 1), p(u0, 0.08)]);
    }

    case 'A': {
      const apexL = uAt(0.4);
      const apexR = u1 - 7;
      const barB = 0.74;
      const barT = barB - bt * 0.88;
      const outer = poly([p(apexL, 0), p(apexR, 0), p(u1, 0.12), p(u1, 1), p(u1 - sw * 0.95, 1), p(u1 - sw * 0.95, barB), p(uAt(0.3), barB), p(u0 + sw * 0.95, 1), p(u0 - 2, 1)]);
      const inner = poly([p(uAt(0.48), bt * 1.08), p(u1 - sw * 0.95, bt * 1.08), p(u1 - sw * 0.95, barT), p(uAt(0.37), barT)]);
      return `${outer} ${inner}`;
    }

    case 'S': {
      const c = 10.5;
      return poly([
        p(u0 + c, 0),
        p(u1, 0),
        p(u1 - 5, bt),
        p(u0 + sw * 0.92, bt),
        p(u0 + sw * 0.92, 0.39),
        p(u1 - c + 3, 0.44),
        p(u1, 0.55),
        p(u1, 0.86),
        p(u1 - c, 1),
        p(u0, 1),
        p(u0 + 5, 1 - bt),
        p(u1 - sw * 0.92, 1 - bt),
        p(u1 - sw * 0.92, 0.61),
        p(u0 + c - 3, 0.56),
        p(u0, 0.45),
        p(u0, 0.14),
      ]);
    }

    case 'D': {
      const outer = poly([p(u0 - 2, 0), p(u1 - 14, 0), p(u1, 0.19), p(u1, 0.81), p(u1 - 14, 1), p(u0 + 5, 1), p(u0 - 1, 0.86), p(u0 - 1, 0.46), p(u0 + 4.5, 0.4), p(u0 - 1, 0.34), p(u0 - 1, 0.1)]);
      const inner = poly([p(u0 + sw * 0.98, bt), p(u1 - sw * 1.02, bt), p(u1 - sw * 0.84, 0.26), p(u1 - sw * 0.84, 0.74), p(u1 - sw * 1.02, 1 - bt), p(u0 + sw * 0.98, 1 - bt)]);
      return `${outer} ${inner}`;
    }

    case 'R': {
      const bowlB = 0.54;
      const archMid = u0 + W * 0.48;
      const outer = poly([p(u0 + 4, 0), p(u1 - 11, 0), p(u1, 0.14), p(u1, bowlB - 0.13), p(u1 - 12, bowlB), p(u1 + 2, 1), p(u1 - sw, 1), p(archMid, bowlB), p(u0 + sw, bowlB), p(u0 + sw, 1), p(u0, 1), p(u0, 0.08)]);
      const inner = poly([p(u0 + sw, bt), p(u1 - sw * 0.95, bt), p(u1 - sw * 0.8, bt + 0.06), p(u1 - sw * 0.8, bowlB - bt - 0.04), p(u1 - sw * 0.95, bowlB - bt), p(u0 + sw, bowlB - bt)]);
      return `${outer} ${inner}`;
    }

    case 'I':
      return poly([p(u0 + 4, 0), p(u1, 0), p(u1, 1), p(u0, 1), p(u0, 0.08)]);

    case 'V': {
      const um = (u0 + u1) * 0.5;
      return poly([p(u0, 0), p(u0 + sw * 1.02, 0), p(um, 0.69), p(u1 - sw * 1.02, 0), p(u1, 0), p(um + sw * 0.53, 1), p(um - sw * 0.53, 1)]);
    }

    case '.': {
      const yb = bot((u0 + u1) * 0.5);
      return poly([
        [u0, yb - 20],
        [u1 - 2, yb - 17],
        [u1 + 2, yb],
        [u0, yb],
      ]);
    }

    default:
      return '';
  }
}

// ------------------------------------------------------------------------------------------------ the two rows
// Upper row — the greenhouse, standing on the belt line between the rear wheel arch and the cowl.
const UPPER_SPECS: ReadonlyArray<{ ch: string; u0: number; u1: number; fastbackLead?: boolean; windshieldTrail?: boolean }> = [
  { ch: 'T', u0: 196, u1: 240, fastbackLead: true },
  { ch: 'Y', u0: 246, u1: 296 },
  { ch: 'P', u0: 302, u1: 346 },
  { ch: 'E', u0: 352, u1: 392 },
  { ch: 'F', u0: 412, u1: 452 },
  { ch: 'A', u0: 458, u1: 510 },
  { ch: 'S', u0: 516, u1: 560 },
  { ch: 'T', u0: 566, u1: 610, windshieldTrail: true },
  { ch: '.', u0: 616, u1: 630 },
];

// Lower row — the body. The two narrowest letters, "I" (rear) and the second "T" (front), are the ones the wheels sit under.
const LOWER_SPECS: ReadonlyArray<{ ch: string; u0: number; u1: number }> = [
  { ch: 'D', u0: 40, u1: 122 },
  { ch: 'R', u0: 130, u1: 208 },
  { ch: 'I', u0: 216, u1: 242 },
  { ch: 'V', u0: 250, u1: 328 },
  { ch: 'E', u0: 336, u1: 400 },
  { ch: 'F', u0: 452, u1: 516 },
  { ch: 'A', u0: 524, u1: 602 },
  { ch: 'S', u0: 610, u1: 674 },
  { ch: 'T', u0: 682, u1: 746 },
  { ch: 'E', u0: 754, u1: 818 },
  { ch: 'R', u0: 826, u1: 904 },
  { ch: '.', u0: 912, u1: 938 },
];

const UPPER_GLYPHS = UPPER_SPECS.map((s) => buildGlyphPath({ ...s, top: cabinTopY, bot: () => CABIN_BOT_Y }));
const LOWER_GLYPHS = LOWER_SPECS.map((s) => buildGlyphPath({ ...s, top: bodyTopY, bot: bodyBotY }));

// ------------------------------------------------------------------------------------------------ wheels and arches
const REAR_WHEEL = pt(REAR_U, WHEEL_CY);
const FRONT_WHEEL = pt(FRONT_U, WHEEL_CY);
const WHEEL_SCALE = TYRE_R / 43.2; // the wheel below is drawn at 43.2 and scaled to its arch

/** A ring segment of the round fender lip over an arch (screen coordinates: round, not leaned). */
function arcBand(cx: number, cy: number, rIn: number, rOut: number, deg0: number, deg1: number): string {
  const outer: Array<readonly [number, number]> = [];
  const inner: Array<readonly [number, number]> = [];
  for (let i = 0; i <= 20; i++) {
    const rad = ((deg0 + ((deg1 - deg0) * i) / 20) * Math.PI) / 180;
    outer.push([cx + Math.cos(rad) * rOut, cy - Math.sin(rad) * rOut]);
    inner.unshift([cx + Math.cos(rad) * rIn, cy - Math.sin(rad) * rIn]);
  }
  return screenPoly([...outer, ...inner]);
}

const REAR_LIP = arcBand(REAR_WHEEL[0], REAR_WHEEL[1], ARCH_R - 0.4, ARCH_R + 3.4, 12, 168);
const FRONT_LIP = arcBand(FRONT_WHEEL[0], FRONT_WHEEL[1], ARCH_R - 0.4, ARCH_R + 3.4, 12, 168);
const REAR_LIP_BLUE = arcBand(REAR_WHEEL[0], REAR_WHEEL[1], ARCH_R + 0.6, ARCH_R + 1.8, 20, 160);
const FRONT_LIP_BLUE = arcBand(FRONT_WHEEL[0], FRONT_WHEEL[1], ARCH_R + 0.6, ARCH_R + 1.8, 20, 160);

/** Racing wheel: slick tyre, forged twin-spoke rim, drilled disc and caliper. Only the spokes turn (CSS, `.rwm-spokes`). */
function WheelDetail({ cx, cy, idPrefix, idx }: { cx: number; cy: number; idPrefix: string; idx: number }) {
  const rOuter = 43.2;
  const rSidewallArc = 36.2;
  const rRimOuter = 29.5;
  const rRimInner = 26.0;
  const rRotor = 20.8;
  const spokeAngles = [18, 90, 162, 234, 306];
  const treadAngles = Array.from({ length: 28 }, (_, k) => (k * 360) / 28);

  return (
    <g className="rwm-wheel" transform={`translate(${cx} ${cy}) scale(${r1(WHEEL_SCALE * 100) / 100})`} data-wheel={idx}>
      <circle r={rOuter} fill={`url(#${idPrefix}-tire)`} stroke="#263875" strokeWidth="1.8" />
      <circle r={rOuter - 3.6} fill="none" stroke="#1d2854" strokeWidth="1.1" opacity="0.7" />
      <g opacity="0.58">
        {treadAngles.map((deg) => (
          <line key={`tr-${deg}`} x1="0" y1={-rOuter + 0.7} x2="0" y2={-rOuter + 4.1} stroke="#42589e" strokeWidth="1.75" transform={`rotate(${deg})`} />
        ))}
      </g>
      <path
        d={`M ${r1(-rSidewallArc * 0.866)} ${r1(-rSidewallArc * 0.5)} A ${rSidewallArc} ${rSidewallArc} 0 0 1 ${r1(rSidewallArc * 0.866)} ${r1(-rSidewallArc * 0.5)}`}
        fill="none"
        stroke={`url(#${idPrefix}-blue)`}
        strokeWidth="2.1"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d={`M ${r1(rSidewallArc * 0.82)} ${r1(rSidewallArc * 0.57)} A ${rSidewallArc} ${rSidewallArc} 0 0 1 ${r1(-rSidewallArc * 0.82)} ${r1(rSidewallArc * 0.57)}`}
        fill="none"
        stroke="#ff8224"
        strokeWidth="1.9"
        strokeLinecap="round"
        opacity="0.85"
      />
      <circle r={rRimOuter} fill="#060a1f" stroke={`url(#${idPrefix}-silver)`} strokeWidth="2.7" />
      <circle r={rRimInner + 1.5} fill="none" stroke={`url(#${idPrefix}-blue)`} strokeWidth="1.9" />
      <circle r={rRimInner} fill="#050819" />
      <circle r={rRotor} fill="#162046" stroke="#586fab" strokeWidth="1.35" />
      <circle r={rRotor - 3.6} fill="none" stroke="#364a87" strokeWidth="1.7" strokeDasharray="4.2 3.1" />
      <circle r={rRotor - 7.2} fill="none" stroke="#28396e" strokeWidth="1.3" strokeDasharray="2.8 3.4" />
      <circle r="10.8" fill="#080d26" stroke="#334685" strokeWidth="1.1" />
      <path
        d={
          idx === 0
            ? 'M -23.6 -7.4 A 24.8 24.8 0 0 1 -7.2 -23.7 L -3.8 -14.2 A 14.8 14.8 0 0 0 -14.1 -4.4 Z'
            : 'M 7.2 -23.7 A 24.8 24.8 0 0 1 23.6 -7.4 L 14.1 -4.4 A 14.8 14.8 0 0 0 3.8 -14.2 Z'
        }
        fill={`url(#${idPrefix}-orange)`}
        stroke="#fff3c8"
        strokeWidth="0.9"
      />
      <g className="rwm-spokes">
        {spokeAngles.map((deg) => (
          <g key={deg} transform={`rotate(${deg})`}>
            <path d="M -3.9 -6.6 L -7.9 -25.8 L -3.6 -25.8 L 0 -12.4 L 3.6 -25.8 L 7.9 -25.8 L 3.9 -6.6 Z" fill="#1a295c" />
            <path d="M -2.9 -6.6 L -6.5 -25.8 L -3.3 -25.8 L 0 -13.4 L 3.3 -25.8 L 6.5 -25.8 L 2.9 -6.6 Z" fill={`url(#${idPrefix}-silver)`} />
          </g>
        ))}
        <circle r={rRimInner} fill="none" stroke={`url(#${idPrefix}-silver)`} strokeWidth="2.1" />
        {spokeAngles.map((deg) => (
          <circle key={`lug-${deg}`} cx="0" cy="-6.2" r="1.1" fill="#dceaff" transform={`rotate(${deg + 36})`} />
        ))}
      </g>
      {/* while the wheel is spinning fast the spokes blur into a pale disc, which fades as it slows */}
      <circle className="rwm-motion" r={rRimOuter - 2} fill="#a9cbff" />
      <circle r="8.4" fill="#0b1336" stroke={`url(#${idPrefix}-silver)`} strokeWidth="1.5" />
      <circle r="4.2" fill={`url(#${idPrefix}-orange)`} stroke="#fff4cc" strokeWidth="0.9" />
      <circle r="1.6" fill="#09102e" />
      {/* fixed glints: they do not turn with the wheel */}
      <path d="M -26.8 -9.7 A 28.5 28.5 0 0 1 -9.7 -26.8" fill="none" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" opacity="0.72" />
      <path d="M -35.3 -16.5 A 39 39 0 0 1 -16.5 -35.3" fill="none" stroke="#9fb6ee" strokeWidth="3" strokeLinecap="round" opacity="0.28" />
    </g>
  );
}

// ------------------------------------------------------------------------------------------------ the few non-letter parts
/** Tinted glass behind the cabin letters, from the rear deck to the cowl, so the row reads as one greenhouse. */
const CABIN_GLASS = (() => {
  const pts: Array<readonly [number, number]> = [[186, BODY_BELT_Y + 1]];
  for (let u = 196; u <= 632; u += 18) pts.push([u, cabinTopY(u) - 1.5]);
  pts.push([648, 98], [658, BODY_BELT_Y + 1]);
  return poly(pts);
})();

/** A thin bright rail along the roof and down the windshield pillar. */
const ROOF_RAIL = (() => {
  const outer: Array<readonly [number, number]> = [];
  const inner: Array<readonly [number, number]> = [];
  for (let u = 190; u <= 640; u += 14) {
    outer.push([u, cabinTopY(Math.min(u, 632)) - 5.2 + (u > 632 ? (u - 632) * 1.6 : 0)]);
    inner.unshift([u, cabinTopY(Math.min(u, 632)) - 1.8 + (u > 632 ? (u - 632) * 1.6 : 0)]);
  }
  return poly([...outer, ...inner]);
})();

/** The nose cone behind the last "R.": the bonnet's end and the bumper, in the body's own orange. */
const NOSE_CONE = poly([
  [884, 136],
  [950, 164],
  [962, 192],
  [958, 226],
  [946, 240],
  [884, 240],
]);
/** Two low air intakes cut into the nose, beyond the last letter and above the splitter. */
const NOSE_INTAKE_A = poly([
  [936, 198],
  [959, 203],
  [957, 214],
  [936, 209],
]);
const NOSE_INTAKE_B = poly([
  [939, 220],
  [955, 224],
  [953, 231],
  [939, 227],
]);
const HEADLIGHT = poly([
  [924, 158],
  [952, 168],
  [955, 180],
  [928, 176],
]);
const HEADLIGHT_CORE = poly([
  [930, 162],
  [949, 169.5],
  [950, 176],
  [932, 173],
]);
const HEADLIGHT_DRL = poly([
  [929, 184],
  [954, 190],
  [953.5, 192.8],
  [929, 186.8],
]);
const TAIL_LAMP = poly([
  [27, 134],
  [47, 132],
  [47, 162],
  [27, 156],
]);
const TAIL_LAMP_CORE = poly([
  [31, 138],
  [45, 136.5],
  [45, 156],
  [31, 152],
]);
const TAIL_GLOW = pt(30, 147);
const HEAD_GLOW = pt(950, 176);
/** A thin bright strip in the 3-unit gap between the two rows, so the beltline reads as one continuous line. */
const BELT_STRIP = poly([
  [126, 110.6],
  [652, 110.6],
  [652, 114.6],
  [126, 114.6],
]);

/** Rocker sill between the wheels and the front splitter: the car's lower edge. */
const SILL_BODY = poly([
  [292, 240],
  [670, 240],
  [664, 248.5],
  [298, 248.5],
]);
const SILL_TOP = poly([
  [292, 240],
  [670, 240],
  [669, 242.6],
  [293, 242.6],
]);
const SILL_BLADE = poly([
  [304, 244.4],
  [658, 244.4],
  [656, 247],
  [306, 247],
]);
const SPLITTER = poly([
  [884, 244],
  [972, 244],
  [958, 252.5],
  [878, 252.5],
]);
const SPLITTER_BLADE = poly([
  [892, 247.6],
  [962, 247.6],
  [955, 250.6],
  [890, 250.6],
]);

/** The rear wing: a thin blade on two pylons standing on the tail deck above the "D". */
const WING_BLADE = poly([
  [26, 100],
  [132, 94],
  [138, 99.5],
  [30, 106.5],
]);
const WING_UNDER = poly([
  [30, 106.5],
  [138, 99.5],
  [137, 102.4],
  [32, 109],
]);
const WING_PYLON_A = poly([
  [56, 108],
  [64, 107.6],
  [66, 124],
  [58, 124.4],
]);
const WING_PYLON_B = poly([
  [106, 105.4],
  [114, 105],
  [116, 119],
  [108, 119.4],
]);
const WING_END = poly([
  [22, 97],
  [30, 99],
  [32, 110],
  [24, 108],
]);

/** The twin boosters: two bell-shaped nozzles set into the tail, one above the other, flush with the back of the body. */
const BOOSTER_Y = [178, 212] as const;
const BOOSTER_EXIT_U = 8;
const BOOSTERS = BOOSTER_Y.map((y) => ({
  bell: poly([
    [42, y - 8],
    [BOOSTER_EXIT_U + 4, y - 13],
    [BOOSTER_EXIT_U + 4, y + 13],
    [42, y + 8],
  ]),
  ring: poly([
    [BOOSTER_EXIT_U + 4, y - 13],
    [BOOSTER_EXIT_U - 1, y - 14.5],
    [BOOSTER_EXIT_U - 1, y + 14.5],
    [BOOSTER_EXIT_U + 4, y + 13],
  ]),
  core: poly([
    [BOOSTER_EXIT_U + 3, y - 8],
    [BOOSTER_EXIT_U - 0.5, y - 9],
    [BOOSTER_EXIT_U - 0.5, y + 9],
    [BOOSTER_EXIT_U + 3, y + 8],
  ]),
  exit: pt(BOOSTER_EXIT_U - 1, y),
}));

/** The burn behind each nozzle, drawn at full power (the CSS scales it down to the idle burn). Local coordinates: x = 0 is the nozzle. */
const PLUME_LEN = 70;
const PLUME_OUTER = `M 2 -12.5 C -14 -13.5 -40 -8.5 ${-PLUME_LEN} 0 C -40 8.5 -14 13.5 2 12.5 Z`;
const PLUME_CORE = `M 2 -6.8 C -10 -7.4 -28 -4.2 ${r1(-PLUME_LEN * 0.66)} 0 C -28 4.2 -10 7.4 2 6.8 Z`;
const PLUME_HOT = `M 2 -3.6 C -5 -3.8 -14 -2.2 ${r1(-PLUME_LEN * 0.3)} 0 C -14 2.2 -5 3.8 2 3.6 Z`;
/** Sparks thrown back from each nozzle, one after another for as long as the boosters burn. */
const SPARKS = Array.from({ length: 8 }, (_, k) => ({ k, dx: -46 - ((k * 37) % 62), dy: ((k * 7) % 9) * 3 - 12, r: 1.2 + (k % 3) * 0.45 }));
/** Soft puffs of exhaust that swell and drift back behind each nozzle. */
const SMOKE = Array.from({ length: 3 }, (_, k) => ({ k, dx: -64 - k * 16, dy: (k - 1) * 9, r: 4 + k }));
/** The air streaming past the car: thin streaks behind it that slide away to the left, nearest the tail first (`y` is the screen height, `len` the streak's length). */
const WIND = [
  { y: 74, len: 120, tone: 'b', dur: 0.82, delay: 0 },
  { y: 98, len: 84, tone: 'w', dur: 0.66, delay: 0.31 },
  { y: 122, len: 132, tone: 'b', dur: 0.94, delay: 0.52 },
  { y: 146, len: 76, tone: 'w', dur: 0.7, delay: 0.12 },
  { y: 244, len: 118, tone: 'o', dur: 0.78, delay: 0.4 },
  { y: 262, len: 96, tone: 'o', dur: 0.62, delay: 0.19 },
] as const;

/** The measurements the tests hold the design to: where the wheels sit, how deep the arches bite, the shape of the roof and bonnet. */
export const WORDMARK_GEOMETRY = {
  upper: UPPER_SPECS,
  lower: LOWER_SPECS,
  rearU: REAR_U,
  frontU: FRONT_U,
  archR: ARCH_R,
  tyreR: TYRE_R,
  wheelCy: WHEEL_CY,
  beltY: BODY_BELT_Y,
  sillY: BODY_SILL_Y,
  roofY: cabinTopY,
  beltlineY: bodyTopY,
  boosters: BOOSTER_Y.length,
  plumeLen: PLUME_LEN,
  wind: WIND.length,
} as const;

const glyphDelay = (idx: number): CSSProperties => ({ '--gi': idx }) as CSSProperties;

export function RacingWordmark() {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = `rwm-${rawId || 'td'}`;

  return (
    <span className="rwm" aria-hidden="true">
      {/* wind trails behind the car while it enters; they fade to nothing so the finished mark stays clean */}
      <span className="rwm-trails">
        <i className="rwm-t1" />
        <i className="rwm-t2" />
        <i className="rwm-t3" />
        <i className="rwm-t4" />
      </span>

      <svg className="rwm-svg" viewBox="0 0 1080 304" role="presentation" focusable="false">
        <defs>
          {/* Cabin letters: platinum with a racing-blue horizon reflection */}
          <linearGradient id={`${id}-silver-blue`} x1="0" y1="34" x2="0" y2="111" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.22" stopColor="#f0f6ff" />
            <stop offset="0.44" stopColor="#adc7f7" />
            <stop offset="0.5" stopColor="#1250e8" />
            <stop offset="0.58" stopColor="#388bff" />
            <stop offset="0.76" stopColor="#d4e5ff" />
            <stop offset="1" stopColor="#ffffff" />
          </linearGradient>
          <linearGradient id={`${id}-ext-top`} x1="0" y1="34" x2="0" y2="118" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#2563eb" />
            <stop offset="0.5" stopColor="#123694" />
            <stop offset="1" stopColor="#071647" />
          </linearGradient>

          {/* Body letters: deep papaya orange with a bright horizon line */}
          <linearGradient id={`${id}-orange`} x1="0" y1="114" x2="0" y2="240" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff9e0" />
            <stop offset="0.19" stopColor="#ffd561" />
            <stop offset="0.43" stopColor="#ff7e14" />
            <stop offset="0.5" stopColor="#d13404" />
            <stop offset="0.6" stopColor="#ff570a" />
            <stop offset="0.84" stopColor="#ff9b26" />
            <stop offset="1" stopColor="#ffe79c" />
          </linearGradient>
          <linearGradient id={`${id}-ext-bot`} x1="0" y1="114" x2="0" y2="248" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#bd3a06" />
            <stop offset="0.52" stopColor="#751e03" />
            <stop offset="1" stopColor="#2b0801" />
          </linearGradient>

          <linearGradient id={`${id}-glass`} x1="0" y1="34" x2="0" y2="114" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#173585" stopOpacity="0.9" />
            <stop offset="0.5" stopColor="#0a1747" stopOpacity="0.94" />
            <stop offset="1" stopColor="#050a24" stopOpacity="0.98" />
          </linearGradient>
          <linearGradient id={`${id}-silver`} x1="0" y1="0" x2="1" y2="0.35">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.34" stopColor="#e2ecff" />
            <stop offset="0.66" stopColor="#89a2d4" />
            <stop offset="1" stopColor="#f5f9ff" />
          </linearGradient>
          <linearGradient id={`${id}-blue`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#1a5cff" />
            <stop offset="0.52" stopColor="#46a0ff" />
            <stop offset="1" stopColor="#94e4ff" />
          </linearGradient>
          <radialGradient id={`${id}-tire`} cx="0.42" cy="0.34" r="0.68">
            <stop offset="0" stopColor="#384575" />
            <stop offset="0.52" stopColor="#151c3d" />
            <stop offset="0.84" stopColor="#080c1f" />
            <stop offset="1" stopColor="#030510" />
          </radialGradient>
          <radialGradient id={`${id}-ground`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#02030f" stopOpacity="0.94" />
            <stop offset="0.72" stopColor="#040720" stopOpacity="0.52" />
            <stop offset="1" stopColor="#040720" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}-underglow`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ff6a1a" stopOpacity="0.4" />
            <stop offset="0.5" stopColor="#2979ff" stopOpacity="0.5" />
            <stop offset="1" stopColor="#ff8c24" stopOpacity="0.44" />
          </linearGradient>
          {/* the booster exhaust: hot white at the nozzle, orange outside, a blue-white core inside; both fade to nothing behind the car */}
          <linearGradient id={`${id}-plume-o`} x1="1" y1="0" x2="0" y2="0">
            <stop offset="0" stopColor="#fff6d0" />
            <stop offset="0.16" stopColor="#ffc247" />
            <stop offset="0.5" stopColor="#ff6a14" stopOpacity="0.85" />
            <stop offset="1" stopColor="#ff3d10" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-plume-b`} x1="1" y1="0" x2="0" y2="0">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.2" stopColor="#bfe6ff" />
            <stop offset="0.6" stopColor="#3b8cff" stopOpacity="0.8" />
            <stop offset="1" stopColor="#1f5cff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ff9a3c" stopOpacity="0.7" />
            <stop offset="0.5" stopColor="#3b8cff" stopOpacity="0.22" />
            <stop offset="1" stopColor="#3b8cff" stopOpacity="0" />
          </radialGradient>
          {/* wind streaks fade out toward the tail end (left) and are brightest at the head (right) */}
          <linearGradient id={`${id}-wind-b`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8fc2ff" stopOpacity="0" />
            <stop offset="1" stopColor="#d8ebff" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id={`${id}-wind-w`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id={`${id}-wind-o`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ff7a1a" stopOpacity="0" />
            <stop offset="1" stopColor="#ffd08a" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id={`${id}-steel`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6683bb" />
            <stop offset="0.42" stopColor="#25346a" />
            <stop offset="1" stopColor="#080e2c" />
          </linearGradient>
          <linearGradient id={`${id}-gloss`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`${id}-tailglow`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ff3b14" stopOpacity="0.65" />
            <stop offset="1" stopColor="#ff3b14" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-headglow`} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#d6efff" stopOpacity="0.7" />
            <stop offset="0.5" stopColor="#4aa0ff" stopOpacity="0.22" />
            <stop offset="1" stopColor="#4aa0ff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="0.22">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="0.42" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="0.58" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          {/* the wheel arches: round bites out of the lower letters */}
          <mask id={`${id}-arches`} maskUnits="userSpaceOnUse" x="-20" y="0" width="1100" height="320">
            <rect x="-20" y="0" width="1100" height="320" fill="#fff" />
            <circle cx={REAR_WHEEL[0]} cy={REAR_WHEEL[1]} r={ARCH_R} fill="#000" />
            <circle cx={FRONT_WHEEL[0]} cy={FRONT_WHEEL[1]} r={ARCH_R} fill="#000" />
          </mask>

          <clipPath id={`${id}-letters-clip`}>
            {UPPER_GLYPHS.map((d, i) => (
              <path key={`cu-${i}`} d={d} clipRule="evenodd" />
            ))}
            {LOWER_GLYPHS.map((d, i) => (
              <path key={`cl-${i}`} d={d} clipRule="evenodd" />
            ))}
          </clipPath>
        </defs>

        {/* the car is drawn from the tail (left of the boosters' burn) to the splitter; this offset leaves room for the burn inside the box */}
        <g transform="translate(78 0)">
          <g className="rwm-car">
            {/* the air rushing past, behind the car: the car stays where it is, the streaks run away from it */}
            <g className="rwm-wind" pointerEvents="none">
              {WIND.map((w, i) => (
                <rect
                  key={`wind-${i}`}
                  className="rwm-streak"
                  x={34 - w.len}
                  y={w.y}
                  width={w.len}
                  height={w.tone === 'w' ? 1.5 : 2}
                  rx="1"
                  fill={`url(#${id}-wind-${w.tone})`}
                  style={{ animationDuration: `${w.dur}s`, animationDelay: `${w.delay}s` }}
                />
              ))}
            </g>
            {/* the ground: a contact shadow, a faint reflection of the colours above it, and a dark patch under each tyre */}
            <ellipse cx="500" cy="284" rx="500" ry="13" fill={`url(#${id}-ground)`} />
            <ellipse cx="500" cy="279.5" rx="430" ry="4.4" fill={`url(#${id}-underglow)`} />
            <ellipse cx={REAR_WHEEL[0]} cy={WHEEL_CY + TYRE_R} rx="52" ry="5" fill="#02030c" opacity="0.8" />
            <ellipse cx={FRONT_WHEEL[0]} cy={WHEEL_CY + TYRE_R} rx="52" ry="5" fill="#02030c" opacity="0.8" />

            {/* the whole car pitches a little as the boosters fire; the body then rides on its suspension (the wheels stay put) */}
            <g className="rwm-pitch">
              <g className="rwm-bob">
                {/* parts of the car that are not letters, behind the letters: the glass, the wing, the boosters, the nose and the lamps */}
                <g className="rwm-chassis">
                  <path d={CABIN_GLASS} fill={`url(#${id}-glass)`} />
                  <path d={BELT_STRIP} fill={`url(#${id}-silver-blue)`} opacity="0.9" />

                  {/* rear wing: two pylons, a blade, an end plate */}
                  <path d={WING_PYLON_A} fill={`url(#${id}-steel)`} stroke="#6f94e6" strokeWidth="0.9" />
                  <path d={WING_PYLON_B} fill={`url(#${id}-steel)`} stroke="#6f94e6" strokeWidth="0.9" />
                  <path d={WING_UNDER} fill={`url(#${id}-blue)`} />
                  <path d={WING_BLADE} fill={`url(#${id}-silver)`} stroke="#0a1c58" strokeWidth="0.9" strokeLinejoin="bevel" />
                  <path d={WING_END} fill="#ff7a1a" stroke="#421002" strokeWidth="0.9" strokeLinejoin="bevel" />

                  {/* twin boosters: a glow, the burn, then the steel nozzle with its silver rim and hot throat */}
                  {BOOSTERS.map((b, i) => (
                    <g key={`bo-${i}`} className="rwm-booster">
                      <circle className="rwm-glow" cx={b.exit[0]} cy={b.exit[1]} r="30" fill={`url(#${id}-glow)`} />
                      <g transform={`translate(${b.exit[0]} ${b.exit[1]})`}>
                        <g className="rwm-plume">
                          <path className="rwm-lick" d={PLUME_OUTER} fill={`url(#${id}-plume-o)`} />
                          <path className="rwm-flick" d={PLUME_CORE} fill={`url(#${id}-plume-b)`} />
                          <path d={PLUME_HOT} fill="#ffffff" opacity="0.92" />
                        </g>
                        {SMOKE.map((s) => (
                          <circle
                            key={`sm-${s.k}`}
                            className="rwm-puff"
                            cx="-6"
                            cy="0"
                            r={s.r}
                            fill="#9db4e6"
                            style={{ '--k': s.k + i * 2, '--dx': `${s.dx}px`, '--dy': `${s.dy}px` } as CSSProperties}
                          />
                        ))}
                        {SPARKS.map((s) => (
                          <circle
                            key={s.k}
                            className="rwm-spark"
                            cx="-2"
                            cy="0"
                            r={s.r}
                            fill={s.k % 2 ? '#9ed2ff' : '#ffb347'}
                            style={{ '--k': s.k + i * 3, '--dx': `${s.dx}px`, '--dy': `${s.dy}px` } as CSSProperties}
                          />
                        ))}
                      </g>
                      <path d={b.bell} fill={`url(#${id}-steel)`} stroke="#2c4d9e" strokeWidth="0.9" strokeLinejoin="bevel" />
                      <path d={b.ring} fill={`url(#${id}-silver)`} />
                      <path d={b.core} fill={`url(#${id}-plume-b)`} />
                    </g>
                  ))}

                  {/* nose, intakes, headlight; tail-lamp */}
                  <path d={NOSE_CONE} fill={`url(#${id}-ext-bot)`} stroke="#8a2d05" strokeWidth="1.2" strokeLinejoin="bevel" />
                  <path d={NOSE_INTAKE_A} fill="#050a1f" stroke="#ff9a3c" strokeWidth="0.8" strokeLinejoin="bevel" />
                  <path d={NOSE_INTAKE_B} fill="#050a1f" stroke="#4aa0ff" strokeWidth="0.8" strokeLinejoin="bevel" />
                  <circle className="rwm-hl-glow" cx={HEAD_GLOW[0]} cy={HEAD_GLOW[1]} r="26" fill={`url(#${id}-headglow)`} />
                  <path d={HEADLIGHT} fill={`url(#${id}-blue)`} />
                  <path d={HEADLIGHT_CORE} fill="#f4fbff" />
                  <path d={HEADLIGHT_DRL} fill="#bfe6ff" />
                  <circle className="rwm-tail-glow" cx={TAIL_GLOW[0]} cy={TAIL_GLOW[1]} r="22" fill={`url(#${id}-tailglow)`} />
                  <path d={TAIL_LAMP} fill="#ff3b14" />
                  <path d={TAIL_LAMP_CORE} fill="#ffd5a3" />
                </g>

                {/* the greenhouse: "TYPE FAST." */}
                <g className="rwm-tier rwm-tier-top">
                  {UPPER_GLYPHS.map((d, i) => (
                    <g key={`u-${i}`} className="rwm-glyph rwm-glyph-top" style={glyphDelay(i)}>
                      <path d={d} fillRule="evenodd" transform="translate(4.6 5.8)" fill="#050b29" opacity="0.7" />
                      <path d={d} fillRule="evenodd" transform="translate(2.6 3.4)" fill={`url(#${id}-ext-top)`} />
                      <path d={d} fillRule="evenodd" fill={`url(#${id}-silver-blue)`} stroke="#0a1c58" strokeWidth="1.2" strokeLinejoin="bevel" />
                      <path d={d} fillRule="evenodd" fill="none" stroke="#ffffff" strokeWidth="0.7" opacity="0.75" />
                    </g>
                  ))}
                </g>

                {/* the body: "DRIVE FASTER.", with the two wheel arches bitten out of it */}
                <g className="rwm-tier rwm-tier-bot" mask={`url(#${id}-arches)`}>
                  {LOWER_GLYPHS.map((d, i) => (
                    <g key={`l-${i}`} className="rwm-glyph rwm-glyph-bot" style={glyphDelay(i + 2)}>
                      <path d={d} fillRule="evenodd" transform="translate(5 6.4)" fill="#160401" opacity="0.8" />
                      <path d={d} fillRule="evenodd" transform="translate(2.9 3.8)" fill={`url(#${id}-ext-bot)`} />
                      <path d={d} fillRule="evenodd" fill={`url(#${id}-orange)`} stroke="#421002" strokeWidth="1.25" strokeLinejoin="bevel" />
                      <path d={d} fillRule="evenodd" fill="none" stroke="#fff7d4" strokeWidth="0.7" opacity="0.72" />
                    </g>
                  ))}
                </g>

                {/* trim that holds the shape together: the roof rail, the rocker sill and the front splitter */}
                <g className="rwm-fenders">
                  <path d={ROOF_RAIL} fill={`url(#${id}-silver)`} />
                  <path d={SILL_BODY} fill="#091133" stroke="#2c4d9e" strokeWidth="0.8" />
                  <path d={SILL_TOP} fill={`url(#${id}-silver)`} />
                  <path d={SILL_BLADE} fill={`url(#${id}-blue)`} />
                  <path d={SPLITTER} fill={`url(#${id}-silver)`} />
                  <path d={SPLITTER_BLADE} fill={`url(#${id}-blue)`} />
                  <circle cx={REAR_WHEEL[0]} cy={REAR_WHEEL[1]} r={ARCH_R - 0.4} fill="#030614" />
                  <circle cx={FRONT_WHEEL[0]} cy={FRONT_WHEEL[1]} r={ARCH_R - 0.4} fill="#030614" />
                </g>
              </g>

              {/* the wheels sit in their arches, with the fender lip crossing over the top of each tyre */}
              <WheelDetail cx={REAR_WHEEL[0]} cy={REAR_WHEEL[1]} idPrefix={id} idx={0} />
              <WheelDetail cx={FRONT_WHEEL[0]} cy={FRONT_WHEEL[1]} idPrefix={id} idx={1} />
              <g className="rwm-bob rwm-lips">
                <path d={REAR_LIP} fill={`url(#${id}-silver)`} opacity="0.95" />
                <path d={FRONT_LIP} fill={`url(#${id}-silver)`} opacity="0.95" />
                <path d={REAR_LIP_BLUE} fill={`url(#${id}-blue)`} />
                <path d={FRONT_LIP_BLUE} fill={`url(#${id}-blue)`} />
              </g>

              {/* a fixed gloss along the top of each row, and a light sweep across the letters as the car arrives */}
              <g clipPath={`url(#${id}-letters-clip)`} pointerEvents="none">
                <rect x="150" y="30" width="520" height="30" fill={`url(#${id}-gloss)`} opacity="0.42" />
                <rect x="30" y="112" width="930" height="26" fill={`url(#${id}-gloss)`} opacity="0.4" />
                <rect className="rwm-sheen" x="-440" y="0" width="380" height="300" fill={`url(#${id}-sheen)`} />
              </g>
            </g>
          </g>
        </g>
      </svg>
    </span>
  );
}
