import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createApp } from '../server/app';
import { defaultConfig } from '../server/config';
import { DEFAULT_MAX_PLAYERS, VEHICLE_COUNT, type ResultRow, type ServerMsg } from '../shared/protocol';
import { Client, FAST, newRoom, sleep } from './helpers/ws-client';

// Real server, real sockets: 50 independent drivers in one room — plus the host, who watches and holds no seat.

const names = (n: number) => Array.from({ length: n }, (_, i) => `Racer${String(i + 1).padStart(2, '0')}`);

/** Run `fn` against a fresh server and always release every socket/port, even when an assertion fails. */
async function withServer<T>(config: Parameters<typeof createApp>[0], fn: (port: number, track: (c: Client | Client[]) => void) => Promise<T>) {
  const app = createApp(config);
  const port = await app.listen(0, '127.0.0.1');
  const sockets: Client[] = [];
  try {
    return await fn(port, (c) => sockets.push(...(Array.isArray(c) ? c : [c])));
  } finally {
    for (const c of sockets) c.close();
    await app.close();
  }
}

describe('room capacity', () => {
  test('the shipped default capacity is 50, and nothing else in the config still says 30', () => {
    assert.equal(DEFAULT_MAX_PLAYERS, 50);
    assert.equal(defaultConfig.maxPlayers, 50);
  });

  test('7. fifty drivers can join one room: everyone sees all 50 (and the host), the capacity, one host, and 50 distinct vehicle looks', async () => {
    await withServer({ config: FAST }, async (port, track) => {
      const { host, all } = await newRoom(port, names(50));
      track(all);
      await sleep(300); // let the last "joined" broadcast reach everyone
      assert.equal(all.length, 51, '50 drivers + the host');
      for (const c of all) {
        assert.equal(c.room.players.length, 51, 'every client sees all 50 drivers and the host');
        assert.equal(c.room.players.filter((p) => !p.host).length, 50);
        assert.equal(c.room.capacity, 50);
        assert.equal(c.room.players.filter((p) => p.host).length, 1);
        assert.equal(c.room.phase, 'lobby');
      }
      const drivers = host.room.players.filter((p) => !p.host);
      assert.deepEqual(drivers.map((p) => p.name), names(50), 'join order is preserved');
      assert.equal(new Set(drivers.map((p) => p.vehicle)).size, 50, 'a full room gets 50 distinct looks (the host holds none)');
      assert.equal(VEHICLE_COUNT, 50);
    });
  });

  test('7b. a 35-teammate session over real sockets: all see the roster and counts, every driver races the same 300–350 character passage, results are identical', async () => {
    await withServer({ config: { ...FAST, raceMaxMs: 30_000, idleDnfMs: 5000 } }, async (port, track) => {
      const { host, drivers, all } = await newRoom(port, names(35));
      track(all);
      await sleep(300);
      for (const c of all) {
        const seated = c.room.players.filter((p) => !p.host);
        assert.equal(seated.length, 35, 'every client sees all 35 drivers');
        assert.equal(seated.filter((p) => p.connected).length, 35, 'and that all 35 are online');
        assert.equal(c.room.capacity, 50, 'the room still holds 50');
        assert.equal(c.room.phase, 'lobby');
      }
      assert.deepEqual(host.room.players.filter((p) => !p.host).map((p) => p.name), names(35), 'join order is preserved');
      const roomMsgs = host.msgs.filter((m) => m.t === 'room').map((m) => JSON.stringify(m).length);
      assert.ok(Math.max(...roomMsgs) < 12_000, `a 35-driver lobby update stays small (max ${Math.max(...roomMsgs)} bytes)`);

      host.send({ t: 'start' });
      await Promise.all(all.map((c) => c.waitPhase('countdown')));
      const races = all.map((c) => c.room.race!);
      assert.ok(races.every((r) => r.text === races[0]!.text && r.goAt === races[0]!.goAt), 'one passage and one GO time for all 35 drivers (and the host)');
      const text = races[0]!.text;
      assert.ok(text.length >= 300 && text.length <= 350, `the passage is ${text.length} characters`);
      await Promise.all(all.map((c) => c.waitPhase('racing')));

      await Promise.all(
        drivers.map(async (c, i) => {
          await sleep(i * 10);
          await c.type(text, 1);
        }),
      );
      await Promise.all(all.map((c) => c.waitPhase('results', 15_000)));

      const rows = host.room.results as ResultRow[];
      assert.equal(rows.length, 35, 'the ranking has the 35 drivers — the host is not in it');
      assert.ok(rows.every((r) => r.finished && r.dnfReason === undefined && r.progress === 1 && r.accuracy === 100), 'all 35 finished the long passage — nobody is DNF');
      assert.deepEqual(rows.map((r) => r.rank), Array.from({ length: 35 }, (_, i) => i + 1));
      const times = rows.map((r) => r.timeMs!);
      assert.deepEqual(times, [...times].sort((a, b) => a - b), 'ranks follow finish time');
      const sizes = host.msgs.filter((m) => m.t === 'state').map((m) => JSON.stringify(m).length);
      assert.ok(Math.max(...sizes) < 4500, `a 35-racer live state message stays small (max ${Math.max(...sizes)} bytes)`);
      for (const c of all) assert.deepEqual(c.room.results, rows, 'every socket received identical results');
    });
  });

  test('8. the 51st driver is refused with a clear room-full message and is not added', async () => {
    await withServer({ config: FAST }, async (port, track) => {
      const { host, all, code } = await newRoom(port, names(50));
      track(all);
      const extra = await Client.connect(port);
      track(extra);
      extra.send({ t: 'join', room: code, name: 'Number51', team: 'titans' });
      const err = (await extra.waitFor((m) => m.t === 'error')) as Extract<ServerMsg, { t: 'error' }>;
      assert.equal(err.code, 'room_full');
      assert.match(err.msg, /full/i);
      assert.match(err.msg, /50/, 'the message says how many players the room holds');
      await sleep(150);
      assert.equal(host.room.players.filter((p) => !p.host).length, 50, 'the refused player never appears in the room');
      assert.equal(extra.last('joined'), undefined);

      // …and a refused socket can still try again with another room code (it is not left half-joined)
      extra.send({ t: 'join', room: 'ZZZZ', name: 'Number51' });
      assert.equal(((await extra.waitFor((m) => m.t === 'error' && m.code === 'no_room')) as Extract<ServerMsg, { t: 'error' }>).code, 'no_room');
    });
  });

  test('capacity is configurable (maxPlayers), counts drivers only (the host holds no seat) and is enforced the same way', async () => {
    await withServer({ config: { ...FAST, maxPlayers: 3 } }, async (port, track) => {
      const { host, all, code } = await newRoom(port, names(3));
      track(all);
      assert.equal(host.room.capacity, 3);
      assert.equal(host.room.players.length, 4, 'host + 3 drivers: the host did not use up a seat');
      const extra = await Client.connect(port);
      track(extra);
      extra.send({ t: 'join', room: code, name: 'Four', team: 'vibe' });
      const err = (await extra.waitFor((m) => m.t === 'error')) as Extract<ServerMsg, { t: 'error' }>;
      assert.equal(err.code, 'room_full');
      assert.match(err.msg, /3 players/);
    });
  });

  test('a full room still lets existing players back in (token and same-name) and late joiners are refused mid-race', async () => {
    await withServer({ config: FAST }, async (port, track) => {
      const { host, drivers, all, code } = await newRoom(port, names(50));
      track(all);
      host.send({ t: 'start' });
      await Promise.all(all.map((c) => c.waitPhase('racing')));

      // late joiner during the race: refused (full)
      const late = await Client.connect(port);
      track(late);
      late.send({ t: 'join', room: code, name: 'Latecomer', team: 'ctrl' });
      assert.equal(((await late.waitFor((m) => m.t === 'error')) as Extract<ServerMsg, { t: 'error' }>).code, 'room_full');

      // a racer's phone drops and comes back — by token, then (new device) by name — even though the room is full
      const victim = drivers[10]!;
      const { token, me } = victim;
      const victimName = host.room.players.find((p) => p.id === me)!.name;
      victim.close();
      await host.waitFor((m) => m.t === 'room' && m.room.players.some((p) => p.id === me && !p.connected));
      const back = await Client.connect(port);
      track(back);
      back.send({ t: 'join', room: code, name: 'whatever', token });
      const j = (await back.waitFor((m) => m.t === 'joined')) as Extract<ServerMsg, { t: 'joined' }>;
      assert.equal(j.you, me);
      assert.equal(j.room.players.length, 51);

      back.close();
      await host.waitFor((m) => m.t === 'room' && m.room.players.some((p) => p.id === me && !p.connected));
      const again = await Client.connect(port);
      track(again);
      again.send({ t: 'join', room: code, name: victimName.toLowerCase() }); // same person, new device, different case
      assert.equal(((await again.waitFor((m) => m.t === 'joined')) as Extract<ServerMsg, { t: 'joined' }>).you, me);

      // …while a *connected* player's name stays protected
      const thief = await Client.connect(port);
      track(thief);
      thief.send({ t: 'join', room: code, name: names(50)[1]!.toUpperCase() });
      assert.equal(((await thief.waitFor((m) => m.t === 'error')) as Extract<ServerMsg, { t: 'error' }>).code, 'name_taken');
    });
  });

  test('in the lobby a full room frees the seat of the longest-offline driver instead of refusing a newcomer — and never the host\'s', async () => {
    await withServer({ config: { ...FAST, lobbyPruneMs: 60_000 } }, async (port, track) => {
      const { host, drivers, all, code } = await newRoom(port, names(50));
      track(all);
      const ghost = drivers[20]!;
      const ghostName = host.room.players.find((p) => p.id === ghost.me)!.name;
      ghost.close();
      await host.waitFor((m) => m.t === 'room' && m.room.players.some((p) => p.id === ghost.me && !p.connected));
      const newcomer = await Client.connect(port);
      track(newcomer);
      newcomer.send({ t: 'join', room: code, name: 'Newcomer', team: 'vibe' });
      await newcomer.waitFor((m) => m.t === 'joined');
      await sleep(150);
      assert.equal(host.room.players.filter((p) => !p.host).length, 50);
      assert.ok(host.room.players.some((p) => p.name === 'Newcomer'));
      assert.ok(!host.room.players.some((p) => p.name === ghostName), 'the offline ghost seat was freed');
      assert.equal(host.room.hostId, host.me, 'the host is untouched');
    });
  });

  test('a host who drops offline is never evicted to make room: their host seat is not a driver seat', async () => {
    await withServer({ config: { ...FAST, lobbyPruneMs: 60_000, maxPlayers: 3 } }, async (port, track) => {
      const { host, drivers, all, code } = await newRoom(port, names(3));
      track(all);
      host.close(); // the host goes offline first, so they have been offline longest
      await drivers[0]!.waitFor((m) => m.t === 'room' && m.room.players.some((p) => p.host && !p.connected));
      drivers[2]!.close();
      await drivers[0]!.waitFor((m) => m.t === 'room' && m.room.players.some((p) => p.name === 'Racer03' && !p.connected));
      const newcomer = await Client.connect(port);
      track(newcomer);
      newcomer.send({ t: 'join', room: code, name: 'Newcomer', team: 'vibe' });
      await newcomer.waitFor((m) => m.t === 'joined');
      await sleep(100);
      const roster = drivers[0]!.room.players;
      assert.ok(roster.some((p) => p.host), 'the offline host is still the host');
      assert.ok(!roster.some((p) => p.name === 'Racer03'), 'the longest-offline *driver* was the one freed');
    });
  });

  test('9. race synchronisation and rankings with 50 connected drivers: one shared GO, full 50-row state, identical results everywhere', async () => {
    await withServer({ config: { ...FAST, raceMaxMs: 30_000, idleDnfMs: 5000 } }, async (port, track) => {
      const { host, drivers, all } = await newRoom(port, names(50));
      track(all);
      await sleep(300);
      host.send({ t: 'start' });
      await Promise.all(all.map((c) => c.waitPhase('countdown')));
      const races = all.map((c) => c.room.race!);
      assert.ok(races.every((r) => r.goAt === races[0]!.goAt && r.text === races[0]!.text && r.id === 1), 'all 51 sockets got the same GO time and passage');
      await Promise.all(all.map((c) => c.waitPhase('racing')));
      const text = races[0]!.text;

      // Driver i starts 12 ms after driver i-1 and types at a steady pace → a deterministic finishing order.
      await Promise.all(
        drivers.map(async (c, i) => {
          await sleep(i * 12);
          await c.type(text, 1);
        }),
      );
      await Promise.all(all.map((c) => c.waitPhase('results', 15_000)));

      // live state: every snapshot carries all 50 racers (the spectating host is not one of them), sorted by rank
      const state = host.last('state')!;
      assert.equal(state.racers.length, 50, 'the live state includes every driver and nobody else');
      assert.ok(state.racers.every((r) => r[0] !== host.me), 'the host is not on the track');
      const sizes = host.msgs.filter((m) => m.t === 'state').map((m) => JSON.stringify(m).length);
      assert.ok(Math.max(...sizes) < 6000, `a 50-racer state message stays small (max ${Math.max(...sizes)} bytes)`);

      const rows = host.room.results as ResultRow[];
      assert.equal(rows.length, 50, 'the results list every driver');
      assert.ok(rows.every((r) => r.finished && r.dnfReason === undefined), 'all 50 finished — nobody is DNF');
      assert.deepEqual(rows.map((r) => r.rank), Array.from({ length: 50 }, (_, i) => i + 1));
      assert.deepEqual(rows.slice(0, 3).map((r) => r.trophies), [25, 15, 10]);
      assert.ok(rows.slice(3).every((r) => r.trophies === 5));
      const times = rows.map((r) => r.timeMs!);
      assert.deepEqual(times, [...times].sort((a, b) => a - b), 'ranks follow finish time');
      for (const c of all) assert.deepEqual(c.room.results, rows, 'every one of the 51 sockets received identical results');
      for (const c of drivers) {
        const mine = c.last('finish')!.row;
        assert.deepEqual(mine, rows.find((r) => r.id === c.me), 'each racer’s private finish row equals their results row');
      }
      assert.equal(host.last('finish'), undefined, 'the host has no finish row');
      assert.deepEqual(host.room.players.map((p) => p.trophies).sort((a, b) => b - a)[0], 25);
      assert.equal(host.room.players.find((p) => p.id === host.me)!.trophies, 0);
    });
  });

  test('10. with 50 drivers: a racer drops and reconnects mid-race and still finishes; then "race again" runs a fresh 50-driver race', async () => {
    await withServer({ config: { ...FAST, raceMaxMs: 30_000, idleDnfMs: 5000, racerOfflineMs: 5000 } }, async (port, track) => {
      const { host, drivers, all, code } = await newRoom(port, names(50));
      track(all);
      await sleep(300);
      host.send({ t: 'start' });
      await Promise.all(all.map((c) => c.waitPhase('racing')));
      const text = host.room.race!.text;

      const victim = drivers[24]!;
      await victim.type(text.slice(0, 40), 1);
      await sleep(100);
      const { token, me, seq } = victim;
      victim.close();
      await host.waitFor((m) => m.t === 'room' && m.room.players.some((p) => p.id === me && !p.connected));

      const others = drivers.filter((c) => c !== victim);
      await Promise.all(others.map(async (c, i) => { await sleep(i * 4); await c.type(text, 1); }));
      assert.equal(host.room.phase, 'racing', 'the victim is not written off the moment everyone else finishes');

      const back = await Client.connect(port);
      track(back);
      back.send({ t: 'join', room: code, name: 'x', token });
      const joined = (await back.waitFor((m) => m.t === 'joined')) as Extract<ServerMsg, { t: 'joined' }>;
      assert.equal(joined.you, me);
      assert.equal(joined.seq, seq);
      await back.waitFor((m) => m.t === 'state');
      const st = back.last('state')!;
      assert.equal(st.racers.find((r) => r[0] === me)![1], 40, 'position restored from the server');
      await back.type(text.slice(40), 1);
      await Promise.all([host, ...others, back].map((c) => c.waitPhase('results', 10_000)));

      let rows = host.room.results as ResultRow[];
      assert.equal(rows.length, 50);
      assert.ok(rows.every((r) => r.finished), 'including the player who reconnected');
      assert.equal(rows[49]!.id, me, 'finished last');
      const firstDriver = others[0]!;
      const race1Trophies = rows.find((r) => r.id === firstDriver.me)!.trophies;

      // Race again, straight from the results page
      host.send({ t: 'start' });
      await Promise.all([host, ...others].map((c) => c.waitPhase('countdown')));
      assert.equal(host.room.race!.id, 2);
      await Promise.all([host, ...others].map((c) => c.waitPhase('racing')));
      const text2 = host.room.race!.text;
      await Promise.all(others.map(async (c, i) => { await sleep(i * 4); await c.type(text2, 1); }));
      await Promise.all([host, ...others].map((c) => c.waitPhase('results', 10_000)));
      rows = host.room.results as ResultRow[];
      assert.equal(rows.length, 49 + 1, 'all 50 drivers are on the grid again (the reconnected player is back via the same seat)');
      // the 49 that typed finished; the one who did not (the socket we closed earlier is replaced by `back`, who sat out) is DNF
      assert.equal(rows.filter((r) => r.finished).length, 49);
      const sat = rows.find((r) => !r.finished)!;
      assert.equal(sat.id, me);
      assert.equal(sat.dnfReason, 'inactive');
      assert.equal(
        host.room.players.find((p) => p.id === firstDriver.me)!.trophies,
        race1Trophies + rows.find((r) => r.id === firstDriver.me)!.trophies,
        'trophies accumulate across the two races',
      );
    });
  });
});
