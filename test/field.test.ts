import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { RaceEngine } from '../src/game/engine';
import { cellOf, clearSubRows, fieldGeometry, FIELD_FROM, FIELD_ROWS, focusPpc, FOCUS_LANES, FOCUS_SPAN_CHARS, gridStagger, labelWidth, litCars, ME_SCALE, startSubRow, tightLabels, visualRow, ZOOM_FIT, ZOOM_FOCUS, type LabelCar, type LaneCar } from '../src/game/field';
import type { RacerTuple, ServerMsg } from '../shared/protocol';

// The full field: when the grid is big every racer has an actual car on the road (ten lanes, up to a few cars each). The arithmetic is
// tested as arithmetic, the engine's lane list against real racers, and the sources for what must stay true: every car is a real racer,
// nothing is decorative, and the normal five-lane road is untouched.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n');

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${String(i + 1).padStart(2, '0')}`);

function engineWith(n: number, me = 'host') {
  const clock = { t: 0 };
  const e = new RaceEngine({ send: () => true, now: () => clock.t });
  e.setIdentity(me, 0);
  e.startRace({ id: 1, text: 'x'.repeat(300), goAt: 1000 }, ids(n).map((id) => ({ id, name: id.toUpperCase() })));
  return { e, clock };
}
const state = (racers: RacerTuple[]): Extract<ServerMsg, { t: 'state' }> => ({ t: 'state', race: 1, racers, ack: 0 });

describe('the geometry: ten lanes, a few cars to a lane', () => {
  test('40 racers → 10 lanes × 4 cars, each lane cut into two sub-rows; 13 racers → 10 lanes of 1–2; 50 → 10 × 5 in three sub-rows', () => {
    assert.deepEqual(fieldGeometry(40), { rows: 10, perRow: 4, subs: 2, scale: 0.6, mine: false, total: 10, myRow: -1 });
    assert.equal(fieldGeometry(13).rows, FIELD_ROWS);
    assert.equal(fieldGeometry(13).perRow, 2);
    assert.deepEqual(fieldGeometry(50), { rows: 10, perRow: 5, subs: 3, scale: 0.46, mine: false, total: 10, myRow: -1 });
    assert.deepEqual(fieldGeometry(8), { rows: 8, perRow: 1, subs: 1, scale: 0.82, mine: false, total: 8, myRow: -1 }, 'a smaller field: a lane each, and bigger cars');
  });

  test('every car has its own cell: 40 cars fill 10 lanes with exactly 4 each, no two cars in the same place', () => {
    const cells = Array.from({ length: 40 }, (_, c) => cellOf(c, 10));
    assert.equal(new Set(cells.map((x) => `${x.row}:${x.slot}`)).size, 40);
    for (let row = 0; row < 10; row++) assert.equal(cells.filter((x) => x.row === row).length, 4, `lane ${row}`);
    assert.deepEqual([...new Set(cells.map((x) => x.slot))].sort(), [0, 1, 2, 3]);
  });

  test('the starting grid is staggered: cars that start in the same sub-row of a lane are more than a car length apart', () => {
    for (let row = 0; row < 10; row++) {
      assert.ok(gridStagger(2, row) - gridStagger(0, row) > 1.1, 'slots 0 and 2 share a sub-row');
      assert.ok(gridStagger(3, row) - gridStagger(1, row) > 1.1, 'slots 1 and 3 share a sub-row');
    }
    assert.equal(startSubRow(0, 2) + startSubRow(1, 2), 1, 'neighbouring places start in different sub-rows');
  });

  test('zoom steps: a host starts at "fit everyone" and can only go closer; a driver starts at the normal view and can go either way', () => {
    assert.equal(ZOOM_FIT[0], 1);
    assert.ok(ZOOM_FIT.every((z, i) => i === 0 || z > ZOOM_FIT[i - 1]!));
    assert.ok(ZOOM_FOCUS.includes(1) && Math.min(...ZOOM_FOCUS) < 1 && Math.max(...ZOOM_FOCUS) > 1);
  });
});

describe('cars that come close take another sub-row instead of overlapping', () => {
  const car = (id: string, x: number, sub: number): LaneCar => ({ id, x, sub });

  test('nothing moves while no two cars of a sub-row are within a car length', () => {
    assert.equal(clearSubRows([car('a', 500, 0), car('b', 300, 0), car('c', 400, 1), car('d', 100, 1)], 2, 50).size, 0);
  });

  test('the car behind steps aside when it comes within a car length of the one ahead in its sub-row', () => {
    const moved = clearSubRows([car('ahead', 500, 0), car('behind', 470, 0), car('other', 100, 1)], 2, 50);
    assert.deepEqual([...moved], [['behind', 1]]);
  });

  test('if no sub-row is clear nobody flickers: the car stays where it is', () => {
    const moved = clearSubRows([car('a', 500, 0), car('b', 490, 0), car('c', 495, 1)], 2, 50);
    assert.equal(moved.size, 0);
  });

  test('three sub-rows give a crowded lane more room, and a single row never moves anything', () => {
    assert.deepEqual([...clearSubRows([car('a', 500, 0), car('b', 480, 0), car('c', 490, 1)], 3, 50)], [['b', 2]]);
    assert.equal(clearSubRows([car('a', 500, 0), car('b', 480, 0)], 1, 50).size, 0);
  });
});

describe('the engine gives every racer a lane once the field is big', () => {
  test('40 racers: forty lanes entries, one per racer, no gaps and no duplicates — a spectating host has none', () => {
    const { e } = engineWith(40);
    assert.equal(e.field, true);
    assert.equal(e.spectating, true);
    assert.equal(e.lanes.length, 40);
    assert.deepEqual([...e.lanes].sort(), ids(40));
    assert.ok(!e.lanes.includes('host'));
  });

  test('a driver among the forty is in the list like everyone else, and the list is the same race-long order for every client', () => {
    const { e, clock } = engineWith(40, 'p17');
    assert.equal(e.spectating, false);
    assert.equal(e.lanes.length, 40);
    assert.ok(e.lanes.includes('p17'));
    const before = [...e.lanes];
    clock.t = 1500;
    // everyone moves and the order of the race changes completely: nobody changes place on the road
    e.applyState(state(ids(40).map((id, i): RacerTuple => [id, (40 - i) * 5, 60, 0])));
    for (let i = 0; i < 6; i++) e.tick();
    assert.deepEqual(e.lanes, before, 'cars keep their lane for the whole race');
  });

  test('every car is a real racer: a racer who turns up later gets a car, and every car is in the standings', () => {
    const { e } = engineWith(20);
    e.applyState(state([...ids(20).map((id): RacerTuple => [id, 10, 50, 0]), ['late', 3, 40, 0]]));
    for (let i = 0; i < 6; i++) e.tick();
    assert.equal(e.lanes.length, 21);
    assert.ok(e.lanes.includes('late'));
    assert.deepEqual(new Set(e.lanes), new Set(e.standings().map((r) => r.id)), 'the cars and the standings are the same racers');
  });

  test('progress is the server’s: a car’s place on the road comes only from its racer’s position, and stops when the racer stops', () => {
    const { e, clock } = engineWith(16);
    clock.t = 1500;
    e.applyState(state(ids(16).map((id, i): RacerTuple => [id, i === 3 ? 40 : 10, 50, 0])));
    for (let i = 0; i < 40; i++) e.frame(0.05);
    assert.ok(Math.abs(e.racers.get('p04')!.disp - 40) < 0.01);
    // p04 stops typing: the server keeps sending 40, and its car stays exactly there
    e.applyState(state(ids(16).map((id, i): RacerTuple => [id, i === 3 ? 40 : 25, 50, 0])));
    for (let i = 0; i < 40; i++) e.frame(0.05);
    assert.ok(Math.abs(e.racers.get('p04')!.disp - 40) < 0.01, 'a car that is not typing does not move');
    assert.ok(Math.abs(e.racers.get('p01')!.disp - 25) < 0.01, 'the others kept going');
  });

  test('a smaller field is untouched: up to 12 racers the road is the normal five lanes (you + 4 rivals, or the 5 leaders)', () => {
    assert.equal(FIELD_FROM, 13);
    for (const n of [5, 8, 12]) {
      const { e } = engineWith(n);
      assert.equal(e.field, false, `${n} racers`);
      assert.equal(e.lanes.length, 5);
    }
    assert.equal(engineWith(13).e.field, true);
    assert.equal(engineWith(13).e.lanes.length, 13);
  });

  test('the zoom is the viewer’s own and is put back to normal for every new race', () => {
    const { e } = engineWith(40);
    e.zoom = 3.2;
    e.startRace({ id: 2, text: 'y'.repeat(200), goAt: 5000 }, ids(40).map((id) => ({ id, name: id })));
    assert.equal(e.zoom, 1);
  });
});

describe('my own lane and my own car', () => {
  test('a driver is taken out of the ten lanes and given an eleventh of their own in the middle: 40 racers → 39 cars in 10 lanes (5 above, 5 below) and mine', () => {
    const g = fieldGeometry(40, true);
    assert.deepEqual([g.rows, g.perRow, g.subs, g.total, g.myRow, g.mine], [10, 4, 2, 11, 5, true]);
    const lanes = Array.from({ length: 39 }, (_, j) => visualRow(cellOf(j, g.rows).row, g));
    assert.ok(!lanes.includes(g.myRow), 'no other car is ever in my lane');
    assert.equal(new Set(lanes).size, 10);
    assert.equal(Math.max(...lanes), 10);
    assert.equal([...new Set(lanes)].filter((r) => r < g.myRow).length, 5, 'five lanes above me');
    // the host has no car and so no lane of its own
    assert.deepEqual([fieldGeometry(40).total, fieldGeometry(40).myRow], [10, -1]);
  });

  test('my car is 1.4× the others’ and fits its lane with room for the label above it', () => {
    assert.equal(ME_SCALE, 1.4);
    const g = fieldGeometry(40, true);
    const carHeight = (mult: number) => 0.8 * g.scale * mult; // as a share of a lane
    assert.ok(Math.abs(carHeight(ME_SCALE) / carHeight(1) - 1.4) < 1e-9);
    assert.ok(carHeight(ME_SCALE) <= 0.75, 'my car leaves at least a quarter of its lane free');
    assert.ok(carHeight(1) <= 1 / g.subs, 'every other car fits its sub-row');
    assert.ok(FOCUS_LANES > 5 && FOCUS_LANES < g.total, '"Driver focus" shows about half the lanes, so the cars are about twice the size');
  });
});

describe('labels never lie on another car', () => {
  const car = (id: string, x: number, name = 'Sandeep Gowda'): LabelCar => ({ id, x, label: labelWidth(name, 12) });

  test('a label is longer for a longer name', () => {
    assert.ok(labelWidth('Kailashnath Sharma', 12) > labelWidth('Ram', 12));
  });

  test('a car whose label would be printed on the car behind it shrinks to the place alone; the car behind keeps its name', () => {
    assert.deepEqual([...tightLabels([car('front', 600), car('behind', 560)], 70)], ['front']);
  });

  test('cars that are far apart keep their names, and so does a single car', () => {
    assert.equal(tightLabels([car('front', 900), car('behind', 300)], 70).size, 0);
    assert.equal(tightLabels([car('only', 500)], 70).size, 0);
  });

  test('in a run of close cars every car but the last one shrinks, so every name that stays is on clear road', () => {
    assert.deepEqual([...tightLabels([car('a', 600), car('b', 550), car('c', 500)], 70)].sort(), ['a', 'b']);
  });
});

describe('the effects go where the eye is', () => {
  test('the nearest cars to the focus are lit, up to the limit, and my car always is', () => {
    const cars = Array.from({ length: 40 }, (_, i) => ({ id: 'c' + i, at: i * 3 }));
    const lit = litCars(cars, 60, 12, 'c39');
    assert.equal(lit.size, 13);
    assert.ok(lit.has('c20') && lit.has('c39'), 'the car at the focus, and mine');
    assert.ok(!lit.has('c0') && !lit.has('c38'));
    assert.equal(litCars(cars, 0, 5, null).size, 5);
  });
});

describe('the camera: whole field or my car', () => {
  const mk = () => {
    const e = engineWith(40, 'p17').e;
    e.applyState(state(ids(40).map((id, i): RacerTuple => [id, 10 + i * 5, 60, 0])));
    for (let i = 0; i < 60; i++) e.frame(0.05);
    return e;
  };

  test('"Overview" (the default) frames the whole field, led by the leader; "Driver focus" follows my own car; the host always has the whole field', () => {
    const e = mk();
    assert.equal(e.overview, true);
    assert.equal(e.fitting, true);
    assert.ok(Math.abs(e.cameraPos() - 205) < 0.5, 'the leader (p40) is at 205');
    e.overview = false;
    assert.equal(e.fitting, false);
    assert.ok(Math.abs(e.cameraPos() - 90) < 0.5, 'my car (p17) is at 90');
    const host = engineWith(40).e;
    assert.equal(host.fitting, true, 'the host');
    host.overview = false;
    assert.equal(host.fitting, true, 'a host has no car to follow');
  });

  test('a small field is untouched: no whole-field camera for a driver, whatever the switch says', () => {
    const e = engineWith(8, 'p03').e;
    assert.equal(e.overview, true);
    assert.equal(e.fitting, false);
  });

  test('switching the view is only a camera: the racers, their positions and the places do not change', () => {
    const e = mk();
    const before = JSON.stringify(e.standings());
    e.overview = false;
    for (let i = 0; i < 20; i++) e.frame(0.05);
    assert.equal(JSON.stringify(e.standings()), before);
  });
});

describe('"Driver focus" keeps my nearest rivals on screen', () => {
  const W = 1386;

  test('with rivals close by it is as close-up as the road allows', () => {
    assert.equal(focusPpc([5, -8, 12, -3, 20, -15], W, 0.5, 100), W / FOCUS_SPAN_CHARS);
  });

  test('when the nearest rivals are far ahead it zooms out until the sixth nearest is in the room in front of my car', () => {
    const ppc = focusPpc([160, 170, 180, 190, 200, 210, 400], W, 0.5, 100);
    assert.ok(ppc < W / FOCUS_SPAN_CHARS);
    assert.ok(210 * ppc <= W * 0.5, 'the sixth nearest (210 characters ahead) fits in the half of the road ahead of my car');
  });

  test('rivals behind count too, in the room behind my car; and it never zooms out further than a fifth of the close-up scale', () => {
    const behind = focusPpc([-40, -45, -50, -55, -60, -65], W, 0.3, 100);
    assert.ok(behind < W / FOCUS_SPAN_CHARS && 65 * behind <= W * 0.3, 'the sixth nearest (65 characters behind) fits in the room behind my car');
    assert.equal(focusPpc([5000, 6000], W, 0.5, 100), (W / FOCUS_SPAN_CHARS) * 0.2);
  });
});

describe('what the screens do with it (source guards)', () => {
  const track = read('src/components/race/Track.tsx');
  const raceCss = read('src/ui/race.css');
  /** The full field's part of ui/race.css (between its @field markers). */
  const css = raceCss.slice(raceCss.indexOf('/* @field-start'), raceCss.indexOf('/* @field-end */'));

  test('the road renders one car for each entry of the engine’s lane list — nothing decorative, no fixed count', () => {
    assert.match(track, /\{lanes\.map\(\(id, i\) => \{\s*if \(!id\) return null;\s*const p = byId\.get\(id\);/);
    assert.doesNotMatch(track, /slice\(0, 5\)|Array\.from\(\{ length: 40/);
    assert.doesNotMatch(track, /Math\.random/);
    assert.match(track, /const hasMe = !engine\.spectating && lanes\.includes\(meId\);/);
    assert.match(track, /const geo: FieldGeometry \| null = engine\.field \? fieldGeometry\(lanes\.length, hasMe\) : null;/);
    // each car shows its place, its name and its team (a memoised CarView, fed from the engine's ranks and the room's players)
    assert.match(track, /rank=\{geo \? ranks\?\.get\(id\) : undefined\}/);
    assert.match(track, /<b className="rk">\{rank \?\? '·'\}<\/b>/);
    assert.match(track, /team=\{geo \? \(p\?\.team \?\? null\) : null\}/);
    assert.match(track, /\$\{team \? ` tm-\$\{team\}` : ''\}/);
    // the cars' places on the road come from the engine's racers, and the camera zoom is the engine's
    assert.match(track, /const disp = r \? r\.disp : 0;/);
    assert.match(track, /if \(g\) ppc \*= engine\.zoom;/);
  });

  test('both race screens switch to the full field with the engine, and the dot map no longer exists', () => {
    assert.match(read('src/screens/Race.tsx'), /className=\{`stage\$\{engine\.field \? ' field' : ''\}`\}/);
    assert.match(read('src/screens/Spectator.tsx'), /className=\{`stage\$\{engine\.field \? ' field spectator' : ''\}`\}/);
    assert.doesNotMatch(raceCss, /fmap/);
  });

  test('the full-field part of ui/race.css only styles the full field; the zoom control, the team colours and the reduced-motion rule are there', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    const selectors = [...rules.matchAll(/(?:^|[{}])\s*([^{}@]+)\{/g)].map((m) => m[1]!.trim()).filter(Boolean);
    assert.ok(selectors.length > 20);
    for (const sel of selectors) for (const part of sel.replace(/:is\([^)]*\)/g, ':is').split(',')) assert.match(part.trim(), /^(\.stage\.field|\.road\.field|\.lanes-plain)/, part.trim());
    assert.match(css, /\.road\.field \.car \{\s*--lane-h: calc\(var\(--fl, 40px\) \* var\(--s, 0\.6\) \* var\(--mult, 1\)\);/);
    for (const team of ['--tm']) assert.ok(css.includes(`var(${team}`), team);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.road\.field \.car \{\s*transition: none;/);
    assert.doesNotMatch(css, /@import|url\(['"]?https?:/);
  });

  test('forty cars stay cheap: the scrolling decoration is written onto the few elements that show it, not onto the road the cars inherit from', () => {
    assert.match(track, /if \(g\) \{[\s\S]*?road\.style\.backgroundPosition =[\s\S]*?for \(const el of stripes\.current\) el\.style\.backgroundPosition/);
    assert.match(track, /const flares = !field \|\| id === engine\.meId \|\| classOf\.current\.lit\.has\(id\);/);
    assert.match(track, /const LIT_CARS = 12;/);
    assert.match(css, /\.road\.field \.car\.rolling \.spokes \{\s*animation: none;/);
    // and the big standings list redraws on a timer, not on every engine update
    const st = read('src/components/race/Standings.tsx');
    assert.match(st, /window\.setInterval\(redraw, BIG_REFRESH_MS\)/);
    assert.match(st, /return engine\.subscribe\(redraw\);/, 'a normal field still follows every update');
  });
});
