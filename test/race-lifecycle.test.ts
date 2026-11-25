import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { defaultConfig } from '../server/config';
import { PASSAGES } from '../server/passages';
import type { ResultRow } from '../shared/protocol';
import { Sim, Typist } from './helpers/room-sim';

// All times below are *virtual* (node:test mock timers) so a multi-minute race runs in milliseconds and the
// timing rules are deterministic. The passage is pinned to the shipped "Fresh snow covered…" text (index 8, ~345
// characters), and every duration is derived from its real length, so these tests follow the content that ships.

const LEN = PASSAGES[8]!.length;
/** Seconds to type the whole passage at `msPerChar` (no typos). */
const sec = (msPerChar: number) => (LEN * msPerChar) / 1000;
const near = (actual: number, expected: number, tol: number, msg?: string) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? 'value'}: expected ${expected} ± ${tol}, got ${actual}`);

describe('race lifecycle (default production rules unless a test overrides them)', () => {
  let sim: Sim;
  afterEach(() => sim?.destroy());

  test('the pinned passage is a shipped, long passage (300–350 characters)', () => {
    assert.ok(LEN >= 300 && LEN <= 350, `${LEN} characters`);
    sim = new Sim();
    sim.join('Asha');
    sim.start('Asha');
    assert.equal(sim.text, PASSAGES[8]);
    assert.equal(sim.text.length, LEN);
  });

  // ------------------------------------------------------------------------------------------------ the reported bug
  test('REGRESSION — winner finishes at 57 WPM; slower typists (98% / 72% when the old 45 s grace expired) keep racing and finish — nobody is DNF', () => {
    sim = new Sim(); // exactly the shipped defaults
    sim.join('Asha');
    sim.join('Ben');
    sim.join('Chitra');
    sim.start('Asha');
    assert.equal(sim.text.length, LEN);
    // Asha types the whole passage at 57 WPM. The old code gave up on everybody else 45 s after her win ("grace end");
    // Ben is then at 98% and Chitra at 72% — they must keep going and finish.
    const winS = (LEN / 5 / 57) * 60;
    const graceEndS = winS + 45;
    const benS = graceEndS / 0.98;
    const chitraS = graceEndS / 0.72;
    const asha = new Typist(sim, 'Asha', { msPerChar: (winS * 1000) / LEN });
    const ben = new Typist(sim, 'Ben', { msPerChar: (benS * 1000) / LEN });
    const chitra = new Typist(sim, 'Chitra', { msPerChar: (chitraS * 1000) / LEN });
    assert.ok(chitraS < defaultConfig.raceMaxMs / 1000, 'even the slowest of the three is inside the race deadline');
    sim.advanceToGo();
    const all = [asha, ben, chitra];

    sim.runUntil(winS + 0.1, all);
    const w = sim.finishRow('Asha')!;
    assert.ok(w, 'winner got a finish message');
    assert.equal(w.rank, 1);
    near(w.timeMs!, winS * 1000, 30, 'winner time');
    near(w.wpm, 57, 0.6, 'winner WPM');
    assert.equal(sim.phase, 'racing', 'race is NOT over just because somebody won');

    sim.runUntil(graceEndS + 0.1, all); // the moment the old code finalised the results
    assert.equal(sim.phase, 'racing', 'still racing 45 s after the winner — slower players must be allowed to continue');
    near(sim.stateOf('Asha', 'Ben')!.pos / LEN, 0.98, 0.01, 'Ben progress');
    near(sim.stateOf('Asha', 'Chitra')!.pos / LEN, 0.72, 0.01, 'Chitra progress');

    sim.runUntil(benS + 3, all);
    const b = sim.finishRow('Ben')!;
    assert.ok(b && b.finished && b.rank === 2, 'Ben finished 2nd');
    near(b.timeMs!, benS * 1000, 40, 'Ben time');
    assert.equal(sim.phase, 'racing', 'Chitra is still typing');

    sim.runUntil(chitraS + 3, all);
    const c = sim.finishRow('Chitra')!;
    assert.ok(c && c.finished && c.rank === 3, 'Chitra finished 3rd');
    assert.equal(sim.phase, 'results', 'results are finalised once everyone is done');

    const rows = sim.results('Asha')!;
    assert.deepEqual(rows.map((r) => [r.name, r.rank, r.finished]), [['Asha', 1, true], ['Ben', 2, true], ['Chitra', 3, true]]);
    assert.ok(rows.every((r) => r.timeMs !== null && r.accuracy === 100 && r.dnfReason === undefined));
  });

  // ------------------------------------------------------------------------------------------------ test 1
  test('1. a player who finishes normally is recorded with the right time, WPM, accuracy and rank — not DNF', () => {
    sim = new Sim();
    sim.join('Solo');
    sim.start('Solo');
    // 200 ms per char + a deliberate typo before every 50th character (each costs one extra 200 ms keystroke)
    const typos = Math.floor((LEN - 1) / 50);
    const finishS = ((LEN + typos) * 200) / 1000;
    const solo = new Typist(sim, 'Solo', { msPerChar: 200, typoEvery: 50 });
    sim.advanceToGo();
    sim.runUntil(finishS + 3, [solo]);
    assert.equal(sim.phase, 'results', 'the only racer finished → results immediately');
    const row = sim.row('Solo', 'Solo')!;
    assert.equal(row.finished, true);
    assert.equal(row.rank, 1);
    assert.equal(row.dnfReason, undefined);
    assert.equal(row.progress, 1);
    near(row.timeMs!, finishS * 1000, 60, 'finish time');
    near(row.wpm, LEN / 5 / (finishS / 60), 0.5, 'WPM = chars/5/minutes');
    near(row.accuracy, (LEN / (LEN + typos)) * 100, 0.1, 'accuracy = correct / all keystrokes');
    assert.equal(row.trophies, 25);
    assert.deepEqual(sim.finishRow('Solo'), row, 'private finish row equals the final row');
  });

  // ------------------------------------------------------------------------------------------------ test 2
  test('2. a player finishes while others are still racing: they get their result, everyone else keeps racing, no results yet', () => {
    sim = new Sim();
    for (const n of ['Asha', 'Ben', 'Chitra']) sim.join(n);
    sim.start('Asha');
    const asha = new Typist(sim, 'Asha', { msPerChar: 100 });
    const ben = new Typist(sim, 'Ben', { msPerChar: 250 });
    const chitra = new Typist(sim, 'Chitra', { msPerChar: 400 });
    sim.advanceToGo();
    sim.runUntil(sec(100) + 1, [asha, ben, chitra]);

    const row = sim.finishRow('Asha')!;
    assert.equal(row.rank, 1);
    assert.equal(row.finished, true);
    assert.equal(sim.phase, 'racing');
    for (const observer of ['Asha', 'Ben', 'Chitra']) {
      assert.equal(sim.get(observer).conn.room?.results, undefined, `${observer} has not been sent results`);
      assert.ok(sim.stateOf(observer, 'Asha')!.finMs > 0, `${observer} sees Asha as finished`);
      assert.equal(sim.stateOf(observer, 'Ben')!.finMs, 0, `${observer} sees Ben still racing`);
    }
    assert.equal(sim.finishRow('Ben'), undefined, 'Ben has no result yet');
    // and Ben can still type: his position keeps advancing
    const before = sim.stateOf('Ben', 'Ben')!.pos;
    sim.runUntil(sec(100) + 7, [asha, ben, chitra]);
    assert.ok(sim.stateOf('Ben', 'Ben')!.pos > before + 10, 'Ben keeps moving after the winner finished');
  });

  // ------------------------------------------------------------------------------------------------ test 3
  test('3. a nearly finished player (98%) can continue long after another player wins — even past the old 45 s grace', () => {
    sim = new Sim();
    sim.join('Asha');
    sim.join('Ben');
    sim.start('Asha');
    const stopAfter = Math.round(LEN * 0.98);
    const asha = new Typist(sim, 'Asha', { msPerChar: 100 }); // wins at LEN/10 s
    const ben = new Typist(sim, 'Ben', { msPerChar: 100, stopAfter }); // 98%…
    sim.advanceToGo();
    sim.runUntil(sec(100) + 1, [asha, ben]);
    assert.equal(sim.finishRow('Asha')!.rank, 1);
    near(sim.stateOf('Asha', 'Ben')!.pos / LEN, 0.98, 0.005, 'Ben is at 98%');
    // …then hunts for the last few characters, one every 12.5 s (never idle for 45 s): well past the old grace.
    const left = LEN - stopAfter;
    for (let i = 0; i < left; i++) {
      sim.run(12_500, [asha, ben]);
      assert.equal(sim.phase, 'racing', `still racing ${(i + 1) * 12.5} s after the winner`);
      ben.typeNow(1);
    }
    assert.ok(left * 12.5 > 45, 'the hunt outlasted the old 45 s grace');
    const row = sim.finishRow('Ben')!;
    assert.ok(row && row.finished && row.rank === 2, 'Ben finishes 2nd');
    assert.equal(sim.phase, 'results');
    assert.equal(sim.row('Asha', 'Ben')!.finished, true);
  });

  test('3b. a player who pauses for less than the idle limit (40 s) and then resumes is not DNF', () => {
    sim = new Sim();
    sim.join('Asha');
    sim.join('Ben');
    sim.start('Asha');
    const asha = new Typist(sim, 'Asha', { msPerChar: 100 });
    const ben = new Typist(sim, 'Ben', { msPerChar: 100, stopAfter: 120 });
    sim.advanceToGo();
    sim.runUntil(sec(100) + 0.1, [asha, ben]); // Asha has won
    sim.run(40_000, [asha, ben]); // Ben silent for 40 s (limit is 45 s)
    assert.equal(sim.phase, 'racing');
    ben.resume(); // …and carries on typing at his normal pace
    sim.run((LEN - 120) * 100 + 2000, [asha, ben]);
    assert.equal(sim.finishRow('Ben')!.finished, true);
    assert.equal(sim.phase, 'results');
  });

  // ------------------------------------------------------------------------------------------------ test 4 (genuine DNF)
  describe('4. genuine failures produce DNF with an explicit reason', () => {
    test('deadline: still typing when the race time limit expires → DNF "deadline" (and not one second earlier)', () => {
      sim = new Sim({ raceMaxMs: 60_000 });
      sim.join('Asha');
      sim.join('Ben');
      sim.start('Asha');
      const asha = new Typist(sim, 'Asha', { msPerChar: 100 }); // wins at LEN/10 s (< 60 s)
      const ben = new Typist(sim, 'Ben', { msPerChar: 500 }); // would need LEN/2 s — actively typing the whole time
      assert.ok(sec(100) < 60 && sec(500) > 60);
      sim.advanceToGo();
      sim.runUntil(59.5, [asha, ben]);
      assert.equal(sim.phase, 'racing', 'a win well before the deadline must not cut it short');
      sim.runUntil(60.2, [asha, ben]);
      assert.equal(sim.phase, 'results');
      const row = sim.row('Asha', 'Ben')!;
      assert.equal(row.finished, false);
      assert.equal(row.dnfReason, 'deadline');
      assert.equal(row.timeMs, null);
      near(row.progress, 60 / sec(500), 0.03, 'progress at the deadline');
      assert.equal(row.trophies, 0);
      assert.equal(sim.row('Asha', 'Asha')!.rank, 1);
      assert.equal(row.rank, 2);
    });

    test('deadline: with the shipped default a 9 WPM typist (the slowest we promise for a 350-character passage) finishes in time', () => {
      assert.equal(defaultConfig.raceMaxMs, 480_000);
      const longest = Math.max(...PASSAGES.map((p) => p.length));
      const minWpm = longest / 5 / (defaultConfig.raceMaxMs / 60_000);
      assert.ok(minWpm <= 9, `needs ${minWpm.toFixed(1)} WPM on the longest passage`);
      sim = new Sim();
      sim.join('Asha');
      sim.join('Slow');
      sim.start('Asha');
      const asha = new Typist(sim, 'Asha', { msPerChar: 100 });
      const slow = new Typist(sim, 'Slow', { msPerChar: 12_000 / 9 }); // 9 WPM, never pausing
      sim.advanceToGo();
      sim.runUntil(sec(12_000 / 9) + 5, [asha, slow]);
      assert.ok(sim.finishRow('Slow')?.finished, 'the 9 WPM typist finished');
      assert.equal(sim.phase, 'results');
      assert.equal(sim.row('Asha', 'Slow')!.dnfReason, undefined);
    });

    test('inactive: stops typing after another player finished → DNF "inactive" only once the idle limit passes; an active racer is never affected', () => {
      sim = new Sim();
      for (const n of ['Asha', 'Ben', 'Chitra']) sim.join(n);
      sim.start('Asha');
      const asha = new Typist(sim, 'Asha', { msPerChar: 100 }); // wins at LEN/10 s
      const ben = new Typist(sim, 'Ben', { msPerChar: 500 }); // active, finishes at LEN/2 s
      const chitra = new Typist(sim, 'Chitra', { msPerChar: 100, stopAfter: 20 }); // types 20 chars then walks away
      const idleAt = sec(100) + 45; // when Chitra's idle limit is reached
      sim.advanceToGo();
      sim.runUntil(idleAt - 2, [asha, ben, chitra]);
      assert.equal(sim.phase, 'racing');
      sim.runUntil(idleAt + 6, [asha, ben, chitra]);
      assert.equal(sim.phase, 'racing', 'Chitra no longer holds the race open, but Ben is still genuinely racing');
      sim.runUntil(sec(500) + 2, [asha, ben, chitra]);
      assert.equal(sim.phase, 'results');
      assert.equal(sim.row('Asha', 'Ben')!.finished, true, 'Ben, who kept typing, finished');
      const c = sim.row('Asha', 'Chitra')!;
      assert.equal(c.finished, false);
      assert.equal(c.dnfReason, 'inactive');
      near(c.progress, 20 / LEN, 0.002, 'Chitra progress');
    });

    test('inactive: a racer who never typed is DNF 45 s after the first finisher, and the room does not wait longer', () => {
      sim = new Sim();
      sim.join('Asha');
      sim.join('Ghost');
      sim.start('Asha');
      const asha = new Typist(sim, 'Asha', { msPerChar: 100 });
      const idleAt = sec(100) + 45;
      sim.advanceToGo();
      sim.runUntil(idleAt - 2, [asha]);
      assert.equal(sim.phase, 'racing', 'Ghost still has until the winner’s time + 45 s');
      sim.runUntil(idleAt + 2, [asha]);
      assert.equal(sim.phase, 'results');
      const g = sim.row('Asha', 'Ghost')!;
      assert.equal(g.dnfReason, 'inactive');
      assert.equal(g.progress, 0);
    });

    test('offline: a racer disconnected longer than the reconnect allowance is DNF "offline"; one who returns in time keeps racing', () => {
      sim = new Sim();
      for (const n of ['Asha', 'Ben', 'Chitra']) sim.join(n);
      sim.start('Asha');
      const asha = new Typist(sim, 'Asha', { msPerChar: 100 }); // wins at LEN/10 s (34 s)
      const ben = new Typist(sim, 'Ben', { msPerChar: 100 });
      const chitra = new Typist(sim, 'Chitra', { msPerChar: 250 });
      const winS = sec(100);
      const dropS = 20;
      const backS = winS + 2; // Chitra returns ~16 s after dropping
      sim.advanceToGo();
      sim.runUntil(dropS, [asha, ben, chitra]);
      const chitraTyped = sim.stateOf('Asha', 'Chitra')!.pos;
      sim.disconnect('Ben');
      ben.paused = true;
      sim.disconnect('Chitra');
      chitra.paused = true;
      sim.runUntil(backS - 0.5, [asha, ben, chitra]); // Asha wins while both are offline
      assert.equal(sim.phase, 'racing', 'offline racers are given time to come back');
      sim.reconnect('Chitra');
      chitra.paused = false;
      sim.runUntil(dropS + 29, [asha, ben, chitra]);
      assert.equal(sim.phase, 'racing', 'Chitra is typing again; Ben has been offline < 30 s');
      sim.runUntil(dropS + 45, [asha, ben, chitra]); // Ben has now been gone 45 s (> 30 s allowance)
      assert.equal(sim.phase, 'racing', 'Chitra (slow, back online) still holds the race open even though Ben is long gone');
      const chitraDoneS = backS + ((LEN - chitraTyped) * 250) / 1000;
      sim.runUntil(chitraDoneS + 3, [asha, ben, chitra]);
      assert.equal(sim.phase, 'results');
      assert.equal(sim.row('Asha', 'Ben')!.dnfReason, 'offline');
      assert.equal(sim.row('Asha', 'Chitra')!.finished, true, 'the racer who reconnected in time finished');
    });

    test('ended: the host can end the race early (others become DNF "ended"); a non-host cannot', () => {
      sim = new Sim();
      for (const n of ['Asha', 'Ben', 'Chitra']) sim.join(n);
      sim.start('Asha');
      const asha = new Typist(sim, 'Asha', { msPerChar: 100 });
      const ben = new Typist(sim, 'Ben', { msPerChar: 300 });
      const chitra = new Typist(sim, 'Chitra', { msPerChar: 300 });
      sim.advanceToGo();
      sim.runUntil(sec(100) + 1, [asha, ben, chitra]);
      assert.equal(sim.room.endByHost(sim.get('Ben').p.id), false, 'only the host may end the race');
      assert.equal(sim.phase, 'racing');
      assert.equal(sim.room.endByHost(sim.get('Asha').p.id), false, 'a driver — even the fastest — is not the host');
      assert.equal(sim.room.endByHost(sim.room.hostId), true, 'the (spectating) host ends it');
      assert.equal(sim.phase, 'results');
      assert.equal(sim.row('Ben', 'Ben')!.dnfReason, 'ended');
      assert.equal(sim.row('Ben', 'Chitra')!.dnfReason, 'ended');
      assert.equal(sim.row('Ben', 'Asha')!.finished, true);
    });

    test('left: a racer who leaves mid-race is DNF "left" and does not hold up the others', () => {
      sim = new Sim();
      sim.join('Asha');
      sim.join('Ben');
      sim.start('Asha');
      const asha = new Typist(sim, 'Asha', { msPerChar: 100 });
      const ben = new Typist(sim, 'Ben', { msPerChar: 300 });
      sim.advanceToGo();
      sim.runUntil(10, [asha, ben]);
      ben.paused = true;
      sim.room.leave(sim.get('Ben').p);
      sim.runUntil(sec(100) + 1, [asha, ben]);
      assert.equal(sim.phase, 'results', 'Asha finished and was the only one left');
      const row = sim.row('Asha', 'Ben')!;
      assert.equal(row.dnfReason, 'left');
      assert.equal(row.finished, false);
    });
  });

  // ------------------------------------------------------------------------------------------------ test 5
  describe('5. delayed delivery / dropped connections do not lose a valid finish', () => {
    test('all of Ben’s keys are stuck on the network for 40 s and then arrive as a backlog: his finish is still recorded (rank 2, 100% accuracy)', () => {
      sim = new Sim();
      sim.join('Asha');
      sim.join('Ben');
      sim.start('Asha');
      const asha = new Typist(sim, 'Asha', { msPerChar: 100 }); // wins at LEN/10 s
      // Ben types normally (200 ms/char) but nothing reaches the server between 5 s and 45 s.
      const ben = new Typist(sim, 'Ben', { msPerChar: 200, hold: { from: 5, until: 45 } });
      sim.advanceToGo();
      sim.runUntil(44, [asha, ben]);
      assert.equal(sim.finishRow('Asha')!.rank, 1);
      assert.equal(sim.phase, 'racing', 'Ben is not written off while his keys are in transit');
      sim.runUntil(sec(200) + 8, [asha, ben]);
      const row = sim.finishRow('Ben')!;
      assert.ok(row, 'Ben’s finish was recorded');
      assert.equal(row.finished, true);
      assert.equal(row.rank, 2);
      assert.equal(row.accuracy, 100);
      assert.equal(sim.phase, 'results');
      assert.equal(sim.row('Asha', 'Ben')!.finished, true);
    });

    test('keys that arrive after the idle limit are too late: DNF "inactive" (the genuine counterpart of the test above)', () => {
      sim = new Sim();
      sim.join('Asha');
      sim.join('Ben');
      sim.start('Asha');
      const asha = new Typist(sim, 'Asha', { msPerChar: 100 });
      const ben = new Typist(sim, 'Ben', { msPerChar: 200, hold: { from: 5, until: 300 } });
      sim.advanceToGo();
      sim.runUntil(sec(100) + 45 + 6, [asha, ben]);
      assert.equal(sim.phase, 'results');
      assert.equal(sim.row('Asha', 'Ben')!.dnfReason, 'inactive');
    });

    test('a reconnect mid-race resumes the same racer: position intact, finish recorded', () => {
      sim = new Sim();
      sim.join('Asha');
      sim.join('Ben');
      sim.start('Asha');
      const asha = new Typist(sim, 'Asha', { msPerChar: 100 });
      const ben = new Typist(sim, 'Ben', { msPerChar: 200 });
      sim.advanceToGo();
      sim.runUntil(10, [asha, ben]);
      const posBefore = sim.stateOf('Ben', 'Ben')!.pos;
      sim.disconnect('Ben');
      ben.paused = true;
      sim.runUntil(15, [asha, ben]);
      const conn = sim.reconnect('Ben');
      ben.paused = false;
      assert.equal(conn.last('room')!.room.phase, 'racing');
      sim.runUntil(16, [asha, ben]);
      assert.ok(sim.stateOf('Ben', 'Ben')!.pos >= posBefore, 'progress was kept');
      sim.runUntil(sec(200) + 5 + 6, [asha, ben]);
      assert.equal(sim.row('Asha', 'Ben')!.finished, true);
      assert.equal(sim.row('Asha', 'Ben')!.dnfReason, undefined);
    });
  });

  // ------------------------------------------------------------------------------------------------ test 6
  test('6. every client receives identical final results, and each finisher’s private result equals their row', () => {
    sim = new Sim();
    const names = ['Asha', 'Ben', 'Chitra', 'Dev', 'Esha'];
    for (const n of names) sim.join(n);
    sim.start('Asha');
    const typists = [
      new Typist(sim, 'Asha', { msPerChar: 110 }),
      new Typist(sim, 'Ben', { msPerChar: 150, typoEvery: 40 }),
      new Typist(sim, 'Chitra', { msPerChar: 210 }),
      new Typist(sim, 'Dev', { msPerChar: 130, stopAfter: 60 }), // walks away
      new Typist(sim, 'Esha', { msPerChar: 260 }),
    ];
    sim.advanceToGo();
    sim.runUntil(sec(260) + 10, typists);
    assert.equal(sim.phase, 'results');
    const reference = sim.results('Asha')!;
    assert.equal(reference.length, 5);
    for (const n of names) assert.deepEqual(sim.results(n), reference, `${n} sees the same results`);
    assert.deepEqual(reference.map((r) => r.rank), [1, 2, 3, 4, 5]);
    assert.deepEqual(reference.map((r) => r.name), ['Asha', 'Ben', 'Chitra', 'Esha', 'Dev']);
    assert.equal(reference[4]!.finished, false);
    for (const r of reference.filter((x) => x.finished)) assert.deepEqual(sim.finishRow(r.name), r);
    assert.ok(reference[1]!.accuracy < 100, 'Ben’s typos are counted');
    // ranks are in finish-time order
    const times = reference.filter((r) => r.finished).map((r) => r.timeMs!);
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
  });

  // ------------------------------------------------------------------------------------------------ test 10 (room level)
  test('10. race again after results works: fresh race, per-race state reset, trophies accumulate; reconnect in the new race works too', () => {
    sim = new Sim();
    sim.join('Asha');
    sim.join('Ben');
    sim.start('Asha');
    let asha = new Typist(sim, 'Asha', { msPerChar: 100 });
    let ben = new Typist(sim, 'Ben', { msPerChar: 140 });
    sim.advanceToGo();
    sim.runUntil(sec(140) + 4, [asha, ben]);
    assert.equal(sim.phase, 'results');
    assert.equal(sim.room.players.get(sim.get('Asha').p.id)!.trophies, 25);
    const race1 = sim.room.race!.id;

    assert.equal(sim.room.start(sim.get('Ben').p.id), false, 'only the host can start another race');
    assert.equal(sim.start('Asha'), true, '"Race again" straight from the results page');
    assert.equal(sim.phase, 'countdown');
    assert.equal(sim.room.race!.id, race1 + 1);
    asha = new Typist(sim, 'Asha', { msPerChar: 150 });
    ben = new Typist(sim, 'Ben', { msPerChar: 100 }); // Ben wins this time
    sim.advanceToGo();
    sim.runUntil(5, [asha, ben]);
    sim.disconnect('Ben');
    ben.paused = true;
    sim.runUntil(8, [asha, ben]);
    sim.reconnect('Ben');
    ben.paused = false;
    sim.runUntil(sec(150) + 6, [asha, ben]);
    assert.equal(sim.phase, 'results');
    const rows = sim.results('Asha')!;
    assert.deepEqual(rows.map((r) => [r.name, r.rank, r.finished]), [['Ben', 1, true], ['Asha', 2, true]]);
    assert.equal(sim.room.players.get(sim.get('Asha').p.id)!.trophies, 25 + 15);
    assert.equal(sim.room.players.get(sim.get('Ben').p.id)!.trophies, 15 + 25);
    for (const r of rows) assert.equal(r.dnfReason, undefined, 'nobody carried a DNF over from the previous race');

    assert.equal(sim.room.backToLobby(sim.get('Asha').p.id), false, 'a driver cannot send the room back to the lobby');
    assert.equal(sim.room.backToLobby(sim.room.hostId), true);
    assert.equal(sim.phase, 'lobby');
    assert.equal(sim.room.race, null);
  });
});

// A compile-time guard so the tests keep exercising every DnfReason.
const _reasons: Record<NonNullable<ResultRow['dnfReason']>, true> = { deadline: true, inactive: true, offline: true, left: true, ended: true };
void _reasons;
