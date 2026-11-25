import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { defaultConfig } from '../server/config';
import { PASSAGES } from '../server/passages';
import { calcScore, trophiesFor } from '../shared/game';
import { Sim, Typist } from './helpers/room-sim';

// The passages are 300–350 characters. These tests drive the real Room (virtual time) with every shipped passage and
// with a 35-driver room under the shipped rules, checking typing progress, WPM, accuracy, finish detection, scoring,
// the shared passage, and that slow-but-active typists get enough time (no premature DNF).

const near = (actual: number, expected: number, tol: number, msg?: string) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? 'value'}: expected ${expected} ± ${tol}, got ${actual}`);

describe('long passages (300–350 characters)', () => {
  let sim: Sim | undefined;
  afterEach(() => {
    sim?.destroy();
    sim = undefined;
  });

  test('every shipped passage can be raced end to end: finish detection, time, WPM, accuracy and score are right', () => {
    PASSAGES.forEach((text, i) => {
      const s = new Sim({}, i);
      try {
        s.join('Solo');
        s.start('Solo');
        assert.equal(s.text, text, `passage ${i} is the one served`);
        const typos = Math.floor((text.length - 1) / 40);
        const finishMs = (text.length + typos) * 200; // 60 WPM, one wrong key before every 40th character
        const solo = new Typist(s, 'Solo', { msPerChar: 200, typoEvery: 40 });
        s.advanceToGo();
        s.runUntil(finishMs / 1000 - 5, [solo]);
        assert.equal(s.phase, 'racing', `passage ${i}: still racing 5 s before the expected finish`);
        const mid = s.stateOf('Solo', 'Solo')!;
        assert.ok(mid.pos > text.length * 0.9 && mid.pos < text.length, `passage ${i}: live position ${mid.pos}/${text.length} advances correct characters only`);
        s.runUntil(finishMs / 1000 + 3, [solo]);
        assert.equal(s.phase, 'results', `passage ${i}: finish detected`);
        const row = s.row('Solo', 'Solo')!;
        assert.equal(row.finished, true);
        assert.equal(row.dnfReason, undefined);
        assert.equal(row.rank, 1);
        assert.equal(row.progress, 1);
        near(row.timeMs!, finishMs, 60, `passage ${i} finish time`);
        near(row.wpm, text.length / 5 / (finishMs / 60_000), 0.5, `passage ${i} WPM`);
        near(row.accuracy, (text.length / (text.length + typos)) * 100, 0.1, `passage ${i} accuracy`);
        near(row.score, calcScore(row.wpm, row.accuracy, 1), 3, `passage ${i} score`);
        assert.equal(row.trophies, 25);
      } finally {
        s.destroy();
      }
    });
  });

  test('the race deadline leaves room for slow typists on every passage: even 9 WPM finishes, and the idle rule does not depend on length', () => {
    for (const p of PASSAGES) {
      const minWpm = p.length / 5 / (defaultConfig.raceMaxMs / 60_000);
      assert.ok(minWpm <= 9, `a ${p.length}-character passage needs ${minWpm.toFixed(2)} WPM to beat the deadline`);
    }
    assert.equal(defaultConfig.raceMaxMs, 480_000);
    assert.equal(defaultConfig.idleDnfMs, 45_000, 'only 45 s of complete silence (after a winner exists) counts as stopped');
  });

  test('35 drivers race one long passage under the shipped rules: same passage for all, nobody DNF — even the 12 WPM typist — and scoring is consistent', () => {
    sim = new Sim({}, 3, true);
    const names = Array.from({ length: 35 }, (_, i) => `Driver${String(i + 1).padStart(2, '0')}`);
    for (const n of names) sim.join(n);
    sim.room.broadcastRoom();

    // lobby: the roster is complete (35 drivers + the spectating host) and the snapshot stays small
    const lobby = sim.get(names[0]!).conn.room!;
    assert.equal(lobby.players.length, 36);
    assert.equal(lobby.players.filter((p) => !p.host).length, 35, '35 drivers');
    assert.equal(lobby.capacity, 50);
    assert.equal(lobby.players.filter((p) => p.host).length, 1);
    assert.equal(lobby.players.filter((p) => p.connected).length, 36);
    assert.ok(JSON.stringify(lobby).length < 12_000, `a 35-driver room snapshot is ${JSON.stringify(lobby).length} bytes`);

    sim.start();
    const text = sim.text;
    assert.ok(text.length >= 300 && text.length <= 350);
    for (const n of names) assert.equal(sim.get(n).conn.room!.race!.text, text, `${n} received the shared passage`);

    // 90 WPM down to 12 WPM, nobody pausing (so only the race deadline could cut anyone off)
    const wpms = names.map((_, i) => 90 - (i * 78) / 34);
    const typists = names.map((n, i) => new Typist(sim!, n, { msPerChar: 12_000 / wpms[i]! }));
    const slowestS = (text.length / 5 / 12) * 60;
    assert.ok(slowestS < defaultConfig.raceMaxMs / 1000, `the slowest racer needs ${slowestS.toFixed(0)} s, the deadline is ${defaultConfig.raceMaxMs / 1000} s`);
    sim.advanceToGo();
    sim.runUntil(slowestS + 5, typists);

    assert.equal(sim.phase, 'results');
    const rows = sim.results(names[0]!)!;
    assert.equal(rows.length, 35);
    assert.ok(rows.every((r) => r.finished && r.dnfReason === undefined && r.progress === 1 && r.accuracy === 100), 'all 35 finished with 100% accuracy — nobody is DNF');
    assert.deepEqual(rows.map((r) => r.name), names, 'ranks follow speed');
    assert.deepEqual(rows.map((r) => r.rank), Array.from({ length: 35 }, (_, i) => i + 1));
    near(rows[0]!.wpm, 90, 0.7, 'fastest WPM');
    near(rows[34]!.wpm, 12, 0.2, 'slowest WPM');
    for (const r of rows) {
      near(r.score, calcScore(r.wpm, r.accuracy, r.progress), 3, `${r.name} score`);
      assert.equal(r.trophies, trophiesFor(r.rank, true));
    }
    const times = rows.map((r) => r.timeMs!);
    assert.deepEqual(times, [...times].sort((a, b) => a - b), 'finish times are in rank order');
    for (const n of names) assert.deepEqual(sim.results(n), rows, `${n} sees identical results`);

    // "Race again": a fresh passage, again identical for all 35
    assert.equal(sim.start(), true);
    const next = sim.text;
    assert.notEqual(next, text, 'the next race uses a different passage');
    for (const n of names) assert.equal(sim.get(n).conn.room!.race!.text, next, `${n} received the next shared passage`);
  });

  test('a 35-driver lobby tracks the online count as drivers drop and come back, and the host can still start', () => {
    sim = new Sim({}, 8, true);
    const names = Array.from({ length: 35 }, (_, i) => `Driver${String(i + 1).padStart(2, '0')}`);
    for (const n of names) sim.join(n);
    sim.disconnect('Driver07');
    sim.disconnect('Driver20');
    sim.room.broadcastRoom();
    const info = sim.get('Driver01').conn.room!;
    const drivers = (i: typeof info) => i.players.filter((p) => !p.host);
    assert.equal(drivers(info).length, 35, 'offline drivers keep their seat in the lobby');
    assert.equal(drivers(info).filter((p) => p.connected).length, 33);
    sim.reconnect('Driver07');
    assert.equal(drivers(sim.get('Driver01').conn.room!).filter((p) => p.connected).length, 34);
    assert.equal(sim.start(), true, 'the host can start with every driver who is online');
  });
});
