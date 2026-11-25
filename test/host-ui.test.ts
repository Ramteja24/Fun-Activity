import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { RaceEngine } from '../src/game/engine';
import type { RaceInfo, ServerMsg } from '../shared/protocol';

// The host spectates. Source-level guards for the screens (there is no DOM test environment here — the real thing was also
// checked in a browser) and the client engine's spectator mode, which is pure logic.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('screens', () => {
  test('during a race drivers get the race screen; the host (and anyone who joined late) gets the spectator screen', () => {
    const app = read('src/App.tsx');
    assert.match(app, /import \{ SpectatorScreen \} from '\.\/screens\/Spectator'/);
    assert.match(app, /screen = !racing \? <SpectatorScreen \/> : showResults \? <ResultsScreen \/> : <RaceScreen \/>/);
  });

  test('the spectator screen shows the track, countdown and every driver in the live standings — and has no typing field, speedometer, WPM, position or finish card of its own', () => {
    const s = read('src/screens/Spectator.tsx');
    assert.match(s, /<Track\b/);
    assert.match(s, /<Countdown stage=\{stage\} \/>/);
    assert.match(s, /<Standings /, 'the standings list every driver with their car');
    assert.match(s, /countdownAudio\.begin\(/, 'the host hears the same race-start sounds');
    for (const forbidden of [/<TypingBar/, /<Speedometer/, /<FinishCard/, /<Hud\b/, /ghost-input/, /hud\.rank/, /handleChar/, /mePos/]) {
      assert.doesNotMatch(s, forbidden, `a spectator has no ${forbidden}`);
    }
    assert.match(s, /SPECTATING/);
    // the host manages the race from here; a late joiner does not
    assert.match(s, /isHost &&/);
    assert.match(s, /End race now/);
    assert.match(s, /Confirm end race/, 'ending everyone\'s race asks first');
    // the speaker stays the last item of the header, like on every other screen
    assert.match(s, /<MusicToggle variant="hud" \/>\s*<\/div>\s*<\/header>/);
  });

  test('the lobby lists the host as a spectator (no seat, no car) and only drivers on the grid; Start waits for a driver', () => {
    const lobby = read('src/screens/Lobby.tsx');
    assert.match(lobby, /const drivers = room\.players\.filter\(\(p\) => !p\.host\)/);
    assert.match(lobby, /const online = drivers\.filter\(\(p\) => p\.connected && p\.team !== null\)\.length/, 'only drivers on a team race');
    assert.match(lobby, /const taken = drivers\.length/, 'the seat counter counts drivers only');
    // the lobby shows no panel for the host at all (the host is still a spectator everywhere else: no seat, no car, never in a bay)
    assert.doesNotMatch(lobby, /lb-hostcard|lb-hosticon|Race host · Spectator|Spectating · hosts and watches/);
    assert.match(lobby, /You host and watch the race/, 'the lead line still says the host watches');
    assert.match(lobby, /<TeamBoard /, 'the roster is the three teams');
    const board = read('src/components/lobby/TeamBoard.tsx');
    assert.match(board, /const drivers = room\.players\.filter\(\(p\) => !p\.host\)/, 'the host is never drawn as a driver');
    assert.doesNotMatch(board, /room\.players\.map\(/);
    assert.match(lobby, /disabled=\{online === 0\}/, 'no driver, no race');
    assert.doesNotMatch(lobby, /start alone/i);
  });

  test('the results page: the host is not ranked, gets a "race complete" headline, and Race again needs a driver', () => {
    const r = read('src/screens/Results.tsx');
    assert.match(r, /race complete/i);
    assert.match(r, /\.filter\(\(p\) => !\(p\.host && p\.trophies === 0\)\)/, 'the championship leaves out a host who never earned anything');
    assert.match(r, /disabled=\{driversOnline === 0\}/);
  });

  test('host rights never pass to a driver: nobody is told they inherited them, and only the admin can create a room', () => {
    const store = read('src/store.ts');
    assert.doesNotMatch(store, /you are the host now/i);
    assert.match(store, /Only the admin can create a room/);
  });

  test('the landing page tells the host they host and watch', () => {
    assert.match(read('src/screens/Landing.tsx'), /You host and watch the race/);
  });

  test('the host sees no driver car: the track draws cars only for engine lanes, and the lanes never contain a spectator', () => {
    const track = read('src/components/race/Track.tsx');
    assert.match(track, /engine\.cameraPos\(\)/, 'the camera follows the leader for a spectator');
    assert.match(track, /if \(engine\.fitting\) ppc = /, 'only a camera that frames the whole field zooms out — a spectator’s always does');
    assert.match(track, /engine\.fieldSpan\(\)/);
    assert.match(track, /isMe \? \(\s*<div className="you-tag">/, 'only a driver ever gets the You tag');
  });
});

// ------------------------------------------------------------------------------------------------ engine
describe('the client engine as a spectator', () => {
  const race: RaceInfo = { id: 1, text: 'x'.repeat(300), goAt: 1000 };
  const mk = () => {
    const clock = { t: 0 };
    const engine = new RaceEngine({ send: () => true, now: () => clock.t });
    return { engine, clock };
  };
  const state = (racers: [string, number, number, number][]): Extract<ServerMsg, { t: 'state' }> => ({ t: 'state', race: 1, racers, ack: 0 });
  const drivers = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ id, name: id.toUpperCase() }));

  test('someone who is not among the racers is spectating: no car, cannot type, no rank, no banner', () => {
    const { engine, clock } = mk();
    engine.setIdentity('host', 0);
    engine.startRace(race, drivers);
    assert.equal(engine.spectating, true);
    clock.t = 1500;
    assert.equal(engine.racing, false);
    assert.equal(engine.handleChar('x'), 'ignored');
    assert.equal(engine.mePos, 0);
    for (let i = 0; i < 20; i++) engine.tick();
    assert.equal(engine.hud.rank, 0);
    assert.equal(engine.hud.total, 7);
    assert.equal(engine.banner, null);
    assert.ok(!engine.lanes.includes('host'));
  });

  test('a driver is not spectating (even before the first state message)', () => {
    const { engine } = mk();
    engine.setIdentity('c', 0);
    engine.startRace(race, drivers);
    assert.equal(engine.spectating, false);
    assert.equal(engine.lanes[0], 'c', 'lane 0 is the driver themself');
  });

  test('the five lanes show the five leaders; a car keeps its lane while it stays in the top five (a driver dropping out frees theirs); the camera follows the leader', () => {
    const { engine, clock } = mk();
    engine.setIdentity('host', 0);
    engine.startRace(race, drivers);
    clock.t = 3000;
    engine.applyState(state([['a', 50, 60, 0], ['b', 40, 55, 0], ['c', 30, 50, 0], ['d', 20, 45, 0], ['e', 10, 40, 0], ['f', 5, 35, 0], ['g', 0, 30, 0]]));
    for (let i = 0; i < 3; i++) engine.tick(); // lanes refresh every third tick
    assert.deepEqual(engine.lanes, ['a', 'b', 'c', 'd', 'e'], 'the five leaders, best first');
    const before = [...engine.lanes];

    // f overtakes e and d: f is now 4th and e drops to 6th — e's lane goes to f, everyone still in the top five stays put
    clock.t = 3500;
    engine.applyState(state([['a', 80, 60, 0], ['b', 70, 55, 0], ['c', 60, 50, 0], ['f', 55, 49, 0], ['d', 50, 45, 0], ['e', 20, 40, 0], ['g', 5, 30, 0]]));
    for (let i = 0; i < 3; i++) engine.tick();
    assert.ok(engine.lanes.includes('f'), 'the new fourth-placed driver is on screen');
    assert.ok(!engine.lanes.includes('e'), 'the driver who fell to sixth is off screen');
    for (const id of ['a', 'b', 'c', 'd']) assert.equal(engine.lanes.indexOf(id), before.indexOf(id), `${id} stays in its lane`);
    assert.equal(engine.lanes.indexOf('f'), before.indexOf('e'), 'f takes e’s lane');
    assert.equal(new Set(engine.lanes).size, 5);

    // the camera sits on the leader once the cars have settled
    for (let i = 0; i < 200; i++) engine.frame(0.05);
    assert.ok(Math.abs(engine.cameraPos() - 80) < 0.1, `camera at ${engine.cameraPos()}`);
    assert.ok(engine.currentWpm() > 0, 'the road moves with the leader’s speed');
  });

  test('the spectator’s road zooms out to keep every car on screen: the field span follows the gap between the leader and the last visible car', () => {
    const { engine, clock } = mk();
    engine.setIdentity('host', 0);
    engine.startRace(race, drivers.slice(0, 3));
    clock.t = 3000;
    assert.equal(engine.fieldSpan(), 0, 'on the grid there is no spread');
    engine.applyState(state([['a', 120, 60, 0], ['b', 60, 55, 0], ['c', 20, 50, 0]]));
    for (let i = 0; i < 3; i++) engine.tick();
    for (let i = 0; i < 300; i++) engine.frame(0.05);
    assert.ok(Math.abs(engine.fieldSpan() - 100) < 0.5, `span ${engine.fieldSpan()} ≈ 120 − 20`);
    assert.ok(Math.abs(engine.anchor - 0.8) < 0.01, 'the leader sits near the right edge of the road');
    engine.spectatorAnchor = 0.55; // the standings panel opened
    for (let i = 0; i < 300; i++) engine.frame(0.05);
    assert.ok(Math.abs(engine.anchor - 0.55) < 0.01, 'and moves left to stay clear of the standings panel');
    engine.spectatorAnchor = 0.8;
    for (let i = 0; i < 300; i++) engine.frame(0.05);
    // a driver is never zoomed: only the spectator's road changes scale
    const racer = mk();
    racer.engine.setIdentity('a', 0);
    racer.engine.startRace(race, drivers.slice(0, 3));
    racer.engine.applyState(state([['a', 120, 60, 0], ['b', 60, 55, 0], ['c', 20, 50, 0]]));
    for (let i = 0; i < 100; i++) racer.engine.frame(0.05);
    assert.equal(racer.engine.fieldSpan(), 0);
  });

  test('a finished driver stays among the leaders; the live standings never include the spectator', () => {
    const { engine, clock } = mk();
    engine.setIdentity('host', 0);
    engine.startRace(race, drivers.slice(0, 3));
    clock.t = 4000;
    engine.applyState(state([['b', 300, 70, 3000], ['a', 120, 60, 0], ['c', 40, 50, 0]]));
    for (let i = 0; i < 3; i++) engine.tick();
    assert.equal(engine.standings()[0]!.id, 'b');
    assert.ok(engine.standings().every((r) => r.id !== 'host'));
    assert.deepEqual(engine.lanes.filter(Boolean).sort(), ['a', 'b', 'c'], 'all three drivers are on screen, the finished one included');
  });
});
