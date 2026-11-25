// The "full field" view of the race: when the grid is big every driver has an actual car on the road, in ten lanes with several cars
// each. This file is the pure arithmetic of it — how many lanes and sub-rows, where each car sits, how a lane's cars take turns on the
// sub-rows as they pass each other. It reads and decides nothing about the race itself: positions, WPM and places come from the server.

/** From this many racers up, every one of them is drawn (below it the road shows you and your four closest rivals, or the five leaders). */
export const FIELD_FROM = 13;
/** The road is cut into at most this many lanes. */
export const FIELD_ROWS = 10;

export interface FieldGeometry {
  /** Lanes for the other racers (my own lane, when there is one, is on top of these). */
  rows: number;
  /** The most cars that share one lane. */
  perRow: number;
  /** A lane is cut into this many sub-rows; cars in different sub-rows never overlap, whatever their progress. */
  subs: number;
  /** A car's size in the full field, as a share of a lane's height (a normal lane holds one full-size car). */
  scale: number;
  /** A driver has a lane of their own, in the middle of the road: only their car is in it, and it is drawn `ME_SCALE` times the size. */
  mine: boolean;
  /** Lanes on the whole road: the others' lanes plus mine. */
  total: number;
  /** Which lane (0 = top) is mine; −1 when the viewer has no car (the host). */
  myRow: number;
}

/** My car is this much bigger than the others'. */
export const ME_SCALE = 1.4;
/** "Driver focus" shows about this many lanes of the road at once, with mine in the middle; "Overview" shows them all. */
export const FOCUS_LANES = 5.6;

/**
 * The layout for `n` racers: 10 lanes (fewer if there are fewer racers), the cars spread over them, 2–3 sub-rows to a lane. 40 racers →
 * 10 lanes × 4 cars. A viewer who is a driver (`mine`) is taken out of that count and given a lane of their own in the middle of the
 * road, so their bigger car never has to share space: 40 racers → 39 cars in 10 lanes (5 above, 5 below) and mine.
 */
export function fieldGeometry(n: number, mine = false): FieldGeometry {
  const others = Math.max(0, n - (mine ? 1 : 0));
  const rows = Math.max(1, Math.min(FIELD_ROWS, others));
  const perRow = Math.max(1, Math.ceil(others / rows));
  const subs = perRow >= 5 ? 3 : perRow >= 2 ? 2 : 1;
  const scale = subs === 3 ? 0.46 : subs === 2 ? 0.6 : 0.82;
  return { rows, perRow, subs, scale, mine, total: rows + (mine ? 1 : 0), myRow: mine ? Math.floor(rows / 2) : -1 };
}

/** The lane on the road (0 = top) of the other racers' lane `row`: the lanes below my own are pushed down one to make room for it. */
export function visualRow(row: number, g: FieldGeometry): number {
  return g.mine && row >= g.myRow ? row + 1 : row;
}

/** Which lane a car is in, and which of the lane's places (0 = front of the grid): the cars are dealt round the lanes, so every lane has a mix. */
export function cellOf(carIndex: number, rows: number): { row: number; slot: number } {
  return { row: carIndex % rows, slot: Math.floor(carIndex / rows) };
}

/** How far behind the start line a car waits on the grid, in car lengths: the places of a lane are staggered, and the lanes alternate. */
export function gridStagger(slot: number, row: number): number {
  return slot * 0.62 + (row % 2) * 0.3;
}

/** A car of one lane, as the sub-row assignment sees it: where it is along the road (px) and which sub-row it is in now. */
export interface LaneCar {
  id: string;
  x: number;
  sub: number;
}

/**
 * Keep the cars of one lane from overlapping by moving them between the lane's sub-rows. A car stays where it is for as long as nothing
 * is within `width` (a car's length, px) of it in its own sub-row; the moment something is, it takes another sub-row that is clear —
 * and if none is clear it stays put, so cars never flicker between rows. Returns the new sub-row of every car that moved.
 * Cars are looked at front first and only the cars ahead of one count against it, so the car ahead keeps its row and the one behind steps aside.
 */
export function clearSubRows(cars: readonly LaneCar[], subs: number, width: number): Map<string, number> {
  const moved = new Map<string, number>();
  if (subs < 2) return moved;
  const sub = new Map(cars.map((c) => [c.id, c.sub]));
  const done = new Set<string>();
  const clashes = (c: LaneCar, row: number) => cars.some((o) => done.has(o.id) && sub.get(o.id) === row && Math.abs(o.x - c.x) < width);
  for (const c of [...cars].sort((p, q) => q.x - p.x)) {
    const now = sub.get(c.id)!;
    if (clashes(c, now)) {
      for (let k = 1; k < subs; k++) {
        const row = (now + k) % subs;
        if (!clashes(c, row)) {
          sub.set(c.id, row);
          moved.set(c.id, row);
          break;
        }
      }
    }
    done.add(c.id);
  }
  return moved;
}

/** The sub-row a car starts in: the lane's places alternate, so the staggered cars of a lane are on different rows. */
export const startSubRow = (slot: number, subs: number): number => slot % subs;

/** The zoom steps of the camera. "Overview" (and the host) start at "fit everyone" (1) and can only go closer; "Driver focus" starts at 1 and can go either way. */
export const ZOOM_FIT = [1, 1.5, 2.2, 3.2, 4.5] as const;
export const ZOOM_FOCUS = [0.5, 0.7, 1, 1.4, 2] as const;

export type FieldView = 'overview' | 'focus';

/** How many characters of the passage fit across the road in "Driver focus" at zoom 1 (about the nearest ten cars either side). */
export const FOCUS_SPAN_CHARS = 85;

/** A car's label: the place on a plate, then the name. */
export function labelWidth(name: string, fontPx: number): number {
  return fontPx * 2.4 + name.length * fontPx * 0.6 + 12;
}

/** A car in one sub-row of one lane, for the label check: where its body starts (px) and how wide its label is. */
export interface LabelCar {
  id: string;
  x: number;
  label: number;
}

/**
 * Which cars must shorten their label to the place alone so that no label sits on another car. A car's label trails behind it (to the
 * left); if the car behind it in the same sub-row is close enough for its body to reach under that label, the label shrinks. The car
 * behind keeps its own label, so every name that stays is on clear road.
 */
export function tightLabels(cars: readonly LabelCar[], carWidth: number): Set<string> {
  const tight = new Set<string>();
  const front = [...cars].sort((p, q) => q.x - p.x);
  for (let i = 0; i < front.length - 1; i++) {
    const f = front[i]!;
    for (let j = i + 1; j < front.length; j++) {
      const t = front[j]!;
      if (t.x + carWidth + 3 > f.x - f.label) {
        tight.add(f.id);
        break;
      }
      if (t.x + carWidth < f.x - f.label - carWidth * 2) break;
    }
  }
  return tight;
}

/** Which cars are drawn with their full effects (wheels turning, a live flame): the `limit` nearest to `focus` (a position along the passage), and always `always`. */
export function litCars(cars: readonly { id: string; at: number }[], focus: number, limit: number, always: string | null): Set<string> {
  const near = [...cars].sort((p, q) => Math.abs(p.at - focus) - Math.abs(q.at - focus)).slice(0, limit);
  const lit = new Set(near.map((c) => c.id));
  if (always) lit.add(always);
  return lit;
}

/**
 * "Driver focus" scale (pixels per character of the passage): as close as the stretch of road allows, but zoomed out just enough that
 * the `near` cars closest to mine are all on screen — the ones ahead in the room in front of my car and the ones behind in the room
 * behind it. `deltas` are the other racers' positions minus mine (characters); `w` the road's width, `anchor` where my car sits on it
 * (0–1), `carWidth` a car's length in px. Never smaller than a fifth of the close-up scale, so the view never turns into the overview.
 */
export function focusPpc(deltas: readonly number[], w: number, anchor: number, carWidth: number, near = 6): number {
  const base = w / FOCUS_SPAN_CHARS;
  const nearest = [...deltas].sort((a, b) => Math.abs(a) - Math.abs(b)).slice(0, near);
  const ahead = Math.max(0, ...nearest);
  const behind = Math.max(0, ...nearest.map((d) => -d));
  let ppc = base;
  if (ahead > 0) ppc = Math.min(ppc, Math.max(10, w * (1 - anchor) - carWidth * 0.5) / ahead);
  if (behind > 0) ppc = Math.min(ppc, Math.max(10, w * anchor - 40) / behind);
  return Math.max(base * 0.2, ppc);
}
