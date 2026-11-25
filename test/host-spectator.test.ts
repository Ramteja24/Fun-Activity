import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { VEHICLE_COUNT } from '../shared/protocol';
import { Sim, Typist } from './helpers/room-sim';

// The host creates the room, shares the code, starts and ends races and watches them — but never races. Only players who
// join as drivers have a car, a WPM, a position and a place in the ranking. Real room logic under virtual time.

describe('the host is a spectator', () => {
  let sim: Sim | null = null;
  afterEach(() => {
    sim?.destroy();
    sim = null;
  });
  const hostInfo = (s: Sim) => s.room.roomInfo().players.find((p) => p.host)!;

  test('the creator is the host and is not racing, in the lobby or in any phase of a race', () => {
    sim = new Sim();
    sim.join('Asha');
    sim.join('Ben');
    assert.equal(sim.room.hostId, sim.get(Sim.HOST).p.id);
    assert.equal(hostInfo(sim).name, Sim.HOST);
    assert.equal(hostInfo(sim).racing, false);
    assert.equal(sim.start(), true);
    assert.equal(sim.phase, 'countdown');
    assert.equal(hostInfo(sim).racing, false, 'not racing in the countdown');
    assert.deepEqual(sim.room.roomInfo().players.filter((p) => p.racing).map((p) => p.name), ['Asha', 'Ben'], 'only the drivers race');
    sim.advanceToGo();
    assert.equal(sim.phase, 'racing');
    assert.equal(hostInfo(sim).racing, false, 'not racing once it is under way');
  });

  test('the host is never on the track: not in the live state, no finish, no row in the results, no trophies', () => {
    sim = new Sim();
    sim.join('Asha');
    sim.join('Ben');
    sim.start();
    const asha = new Typist(sim, 'Asha', { msPerChar: 100 });
    const ben = new Typist(sim, 'Ben', { msPerChar: 150 });
    sim.advanceToGo();
    sim.runUntil(10, [asha, ben]);
    const hostId = sim.get(Sim.HOST).p.id;
    const live = sim.get(Sim.HOST).conn.last('state')!;
    assert.equal(live.racers.length, 2, 'the host watches a two-car race');
    assert.ok(live.racers.every((r) => r[0] !== hostId), 'no entry for the host');

    sim.runUntil(sec(150) + 4, [asha, ben]);
    assert.equal(sim.phase, 'results');
    const rows = sim.results(Sim.HOST)!;
    assert.deepEqual(rows.map((r) => r.name), ['Asha', 'Ben']);
    assert.ok(rows.every((r) => r.id !== hostId));
    assert.equal(sim.get(Sim.HOST).conn.last('finish'), undefined, 'the host gets no private finish row');
    assert.equal(sim.room.players.get(hostId)!.trophies, 0);
    assert.equal(sim.room.players.get(hostId)!.row, null);
    assert.ok(sim.room.players.get(hostId)!.pos === 0 && sim.room.players.get(hostId)!.correct === 0);
  });

  test('keystrokes from the host change nothing (they are acknowledged so a client stays in sync, but never counted)', () => {
    sim = new Sim();
    sim.join('Asha');
    sim.start();
    sim.advanceToGo();
    const host = sim.get(Sim.HOST).p;
    for (let i = 0; i < sim.text.length; i++) sim.room.key(host, i + 1, sim.text[i]!);
    assert.equal(host.pos, 0);
    assert.equal(host.correct, 0);
    assert.equal(host.wrong, 0);
    assert.equal(host.finishMs, 0, 'typing the whole passage as the host never "finishes"');
    assert.equal(host.lastSeq, sim.text.length, 'but every key was acknowledged');
    assert.equal(sim.phase, 'racing', 'and the race was not ended by it');
  });

  test('a race needs a driver: the host alone cannot start one, and a lone driver going offline blocks it again', () => {
    sim = new Sim();
    assert.equal(sim.start(), false, 'nobody but the host is here');
    assert.equal(sim.phase, 'lobby');
    sim.join('Asha');
    sim.disconnect('Asha');
    assert.equal(sim.start(), false, 'the only driver is offline');
    assert.equal(sim.phase, 'lobby');
    sim.reconnect('Asha');
    assert.equal(sim.start(), true);
    assert.equal(sim.phase, 'countdown');
  });

  test('only the host starts, ends and resets; drivers cannot', () => {
    sim = new Sim();
    sim.join('Asha');
    sim.join('Ben');
    const asha = sim.get('Asha').p.id;
    assert.equal(sim.room.start(asha), false);
    assert.equal(sim.start(), true);
    sim.advanceToGo();
    assert.equal(sim.room.endByHost(asha), false);
    assert.equal(sim.phase, 'racing');
    assert.equal(sim.room.endByHost(sim.room.hostId), true, 'the spectating host ends the race');
    assert.equal(sim.phase, 'results');
    assert.equal(sim.room.backToLobby(asha), false);
    assert.equal(sim.room.backToLobby(sim.room.hostId), true);
    assert.equal(sim.room.kick(asha, sim.get('Ben').p.id), undefined, 'a driver cannot remove anyone');
    assert.ok(sim.room.players.has(sim.get('Ben').p.id));
  });

  test('the host holds no seat and no car: capacity counts drivers only and every driver gets a distinct look from the first one', () => {
    sim = new Sim({ maxPlayers: 3 });
    const a = sim.join('A');
    const b = sim.join('B');
    const c = sim.join('C');
    assert.deepEqual([a.p.vehicle, b.p.vehicle, c.p.vehicle], [0, 1, 2], 'the host consumed no look');
    assert.equal(sim.room.activeCount(), 3);
    assert.equal(sim.room.players.size, 4, 'host + 3 drivers');
    const refused = sim.room.join('D', new (class { send() {} close() {} })(), undefined, 'titans');
    assert.equal(refused.ok, false);
    assert.ok(!refused.ok && refused.code === 'room_full');
    assert.equal(sim.room.players.size, 4);
  });

  test('a full room of 50 distinct drivers plus the host', () => {
    sim = new Sim({}, 8, true);
    for (let i = 0; i < 50; i++) sim.join(`Driver${String(i).padStart(2, '0')}`);
    assert.equal(sim.room.activeCount(), 50);
    assert.equal(sim.room.players.size, 51);
    const looks = [...sim.room.players.values()].filter((p) => p.id !== sim!.room.hostId).map((p) => p.vehicle);
    assert.equal(new Set(looks).size, VEHICLE_COUNT, 'all 50 drivers look different');
  });

  test('the host leaving mid-race interrupts nobody: the race goes on, finishes for everyone, and no driver is made host', () => {
    sim = new Sim();
    for (const n of ['Asha', 'Ben', 'Chitra']) sim.join(n);
    sim.start();
    const typists = [new Typist(sim, 'Asha', { msPerChar: 100 }), new Typist(sim, 'Ben', { msPerChar: 130 }), new Typist(sim, 'Chitra', { msPerChar: 160 })];
    sim.advanceToGo();
    sim.runUntil(8, typists);
    sim.room.leave(sim.get(Sim.HOST).p);
    assert.equal(sim.room.hostId, '', 'the room waits for the admin');
    assert.equal(sim.phase, 'racing');
    sim.runUntil(sec(160) + 4, typists);
    assert.equal(sim.phase, 'results');
    assert.deepEqual(sim.results('Ben')!.map((r) => [r.name, r.finished, r.dnfReason]), [['Asha', true, undefined], ['Ben', true, undefined], ['Chitra', true, undefined]]);
  });

  test('while the admin is away nobody can start, end or change anything; when the admin comes back they host again', () => {
    sim = new Sim();
    for (const n of ['Asha', 'Ben']) sim.join(n);
    sim.room.leave(sim.get(Sim.HOST).p);
    const asha = sim.get('Asha').p.id;
    assert.equal(sim.room.start(asha), false, 'a driver cannot start a race');
    assert.equal(sim.room.setActivity(asha, 'trivia'), false, 'nor move the room to another game');
    const back = sim.room.join('Admin', { send() {}, close() {} }, undefined, undefined, true);
    assert.ok(back.ok);
    assert.equal(sim.room.hostId, back.ok ? back.player.id : '');
    assert.equal(sim.start(), true, 'the admin starts the race');
    assert.deepEqual(sim.room.roomInfo().players.filter((p) => p.racing).map((p) => p.name).sort(), ['Asha', 'Ben']);
  });

  test('a host who drops offline mid-race and returns within the grace period is still the host and the race is unaffected', () => {
    sim = new Sim();
    for (const n of ['Asha', 'Ben']) sim.join(n);
    sim.start();
    const typists = [new Typist(sim, 'Asha', { msPerChar: 100 }), new Typist(sim, 'Ben', { msPerChar: 150 })];
    sim.advanceToGo();
    sim.runUntil(5, typists);
    sim.disconnect(Sim.HOST);
    sim.runUntil(8, typists);
    sim.reconnect(Sim.HOST);
    assert.equal(sim.room.hostId, sim.get(Sim.HOST).p.id);
    sim.runUntil(sec(150) + 4, typists);
    assert.equal(sim.phase, 'results');
    assert.ok(sim.results('Asha')!.every((r) => r.finished && r.dnfReason === undefined), 'nobody was cut off because the host blinked');
  });

  test('an offline host never holds a race open or ends it: the race ends when the drivers are done, and the host still sees the results', () => {
    sim = new Sim();
    sim.join('Asha');
    sim.start();
    const asha = new Typist(sim, 'Asha', { msPerChar: 100 });
    sim.advanceToGo();
    sim.disconnect(Sim.HOST);
    sim.runUntil(sec(100) + 2, [asha]);
    assert.equal(sim.phase, 'results', 'the only driver finished; the absent host does not matter');
    sim.reconnect(Sim.HOST);
    assert.equal(sim.results(Sim.HOST)!.length, 1);
  });

  test('host rights never pass to a driver: the room waits for the admin, who comes back as its host', () => {
    sim = new Sim();
    for (const n of ['Asha', 'Ben']) sim.join(n);
    const host = sim.get(Sim.HOST);
    sim.disconnect(Sim.HOST);
    sim.advance(120_000); // however long the admin is away
    assert.equal(sim.room.hostId, host.p.id, 'nobody else became host');
    assert.equal(sim.room.start(sim.get('Asha').p.id), false, 'a driver cannot start a race');
    sim.reconnect(Sim.HOST);
    assert.equal(sim.room.hostId, host.p.id, 'the admin is the host again');
    assert.equal(host.p.team, null, 'and still only watches');
    assert.equal(sim.start(), true);
    assert.deepEqual(sim.room.roomInfo().players.filter((p) => p.racing).map((p) => p.name).sort(), ['Asha', 'Ben']);
  });

  test('a driver can never take the host seat: not by joining a room whose admin is away, not by typing the admin’s name', () => {
    sim = new Sim();
    sim.join('Asha');
    sim.disconnect(Sim.HOST);
    const conn = { send() {}, close() {} };
    const byName = sim.room.join(Sim.HOST, conn, undefined, 'titans');
    assert.equal(byName.ok, false, 'the offline host seat is not taken over by name');
    const newcomer = sim.room.join('Newcomer', conn, undefined, 'vibe');
    assert.ok(newcomer.ok && newcomer.player.id !== sim.room.hostId, 'a newcomer is a driver');
    // the admin on a new device (no saved token) takes the seat back
    const admin = sim.room.join('Admin', { send() {}, close() {} }, undefined, undefined, true);
    assert.ok(admin.ok);
    assert.equal(sim.room.hostId, admin.ok ? admin.player.id : '');
    // and a second admin tab cannot push out a host who is online
    const again = sim.room.join('Admin 2', { send() {}, close() {} }, undefined, undefined, true);
    assert.equal(again.ok, false);
  });

  test('every driver leaving mid-race settles the race at once; the host sees the results and cannot start another until someone joins', () => {
    sim = new Sim();
    for (const n of ['Asha', 'Ben']) sim.join(n);
    sim.start();
    sim.advanceToGo();
    sim.room.leave(sim.get('Asha').p);
    sim.room.leave(sim.get('Ben').p);
    assert.equal(sim.phase, 'results');
    assert.deepEqual(sim.results(Sim.HOST)!.map((r) => [r.name, r.dnfReason]), [['Asha', 'left'], ['Ben', 'left']].sort());
    assert.equal(sim.start(), false, 'no driver is online');
  });

  test('a driver who joins mid-race watches, exactly like the host, and races from the next round', () => {
    sim = new Sim();
    sim.join('Asha');
    sim.start();
    sim.advanceToGo();
    const late = sim.join('Late');
    sim.room.broadcastRoom();
    const info = sim.room.roomInfo();
    assert.equal(info.players.find((p) => p.name === 'Late')!.racing, false);
    assert.equal(info.players.find((p) => p.host)!.racing, false);
    const live = late.conn.last('state');
    assert.ok(!live || live.racers.every((r) => r[0] !== late.p.id));
  });
});

const sec = (wpmCharMs: number) => (350 * wpmCharMs) / 1000;
