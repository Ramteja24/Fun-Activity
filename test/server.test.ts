import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createApp, type App } from '../server/app';
import type { ResultRow, ServerMsg } from '../shared/protocol';
import { Client, FAST, newRoom, sleep } from './helpers/ws-client';

// These tests use the real server and real WebSocket connections — one socket per device.

describe('multiplayer server', () => {
  let app: App;
  let port: number;
  const open: Client[] = [];
  const track = <T extends Client | Client[]>(c: T): T => {
    for (const x of Array.isArray(c) ? c : [c]) open.push(x);
    return c;
  };

  before(async () => {
    app = createApp({ config: FAST });
    port = await app.listen(0, '127.0.0.1');
  });
  after(async () => {
    for (const c of open) c.close();
    await app.close();
  });

  test('host creates a room; drivers join by code; everyone sees the same lobby (the host is listed, but is no driver)', async () => {
    const { host, all, code } = await newRoom(port, ['Asha', 'Ben', 'Chitra']);
    track(all);
    assert.match(code, /^[BCDFGHJKLMNPQRSTVWXZ2-9]{4}$/);
    await sleep(50);
    for (const c of all) {
      assert.equal(c.room.players.length, 4);
      assert.equal(c.room.phase, 'lobby');
      assert.equal(c.room.hostId, host.me);
    }
    assert.deepEqual(host.room.players.map((p) => p.name), ['Host', 'Asha', 'Ben', 'Chitra']);
    const drivers = host.room.players.filter((p) => !p.host);
    assert.equal(new Set(drivers.map((p) => p.vehicle)).size, 3); // distinct vehicles among the drivers
    assert.equal(host.room.players.filter((p) => p.host).length, 1);
    assert.equal(host.room.players.find((p) => p.host)!.name, 'Host');
  });

  test('bad room code, duplicate name, empty name are rejected', async () => {
    const { host, code } = await newRoom(port, ['Dana']);
    track(host);
    const c = track(await Client.connect(port));
    c.send({ t: 'join', room: 'ZZZZ', name: 'X' });
    assert.equal(((await c.waitFor((m) => m.t === 'error')) as Extract<ServerMsg, { t: 'error' }>).code, 'no_room');
    c.send({ t: 'join', room: code, name: 'dana' });
    assert.equal(((await c.waitFor((m) => m.t === 'error' && m.code === 'name_taken')) as Extract<ServerMsg, { t: 'error' }>).code, 'name_taken');
    c.send({ t: 'join', room: code, name: '   ' });
    await c.waitFor((m) => m.t === 'error' && m.code === 'bad_name');
  });

  test('only the host can start; countdown carries one shared goAt and the passage', async () => {
    const { host, drivers, all } = await newRoom(port, ['G1', 'G2']);
    track(all);
    drivers[0]!.send({ t: 'start' });
    await sleep(100);
    assert.equal(host.room.phase, 'lobby', 'a driver cannot start the race');

    host.send({ t: 'start' });
    await Promise.all(all.map((c) => c.waitPhase('countdown')));
    const races = all.map((c) => c.room.race!);
    assert.ok(races.every((r) => r.goAt === races[0]!.goAt && r.text === races[0]!.text && r.id === 1));
    assert.ok(races[0]!.goAt > Date.now() - 50);
    await Promise.all(all.map((c) => c.waitPhase('racing')));
  });

  test('server validates keystrokes: wrong keys never advance, early keys are ignored', async () => {
    const { host, drivers, all } = await newRoom(port, ['Solo']);
    track(all);
    const solo = drivers[0]!;
    host.send({ t: 'start' });
    await solo.waitPhase('countdown');
    const text = solo.room.race!.text;

    solo.send({ t: 'k', s: ++solo.seq, c: text[0]! }); // before GO: ignored
    await solo.waitPhase('racing');
    await sleep(200); // let a tick land
    let st = solo.last('state')!;
    assert.equal(st.racers.find((r) => r[0] === solo.me)![1], 0, 'key sent before GO must not count');

    const wrong = text[0] === 'z' ? 'q' : 'z';
    await solo.type(wrong + wrong + text[0]! + text[1]!);
    await sleep(250);
    st = solo.last('state')!;
    assert.equal(st.racers.find((r) => r[0] === solo.me)![1], 2, 'two wrong keys then two right keys → position 2');
    assert.equal(st.ack, solo.seq, 'every key is acknowledged');
  });

  test('full race: finish order = rank; WPM, accuracy, score, trophies computed on the server', async () => {
    const { host, drivers, all } = await newRoom(port, ['Fast', 'Mid', 'Slow']);
    track(all);
    const [fastDriver, mid, slow] = drivers as [Client, Client, Client];
    host.send({ t: 'start' });
    await Promise.all(all.map((c) => c.waitPhase('racing')));
    const text = host.room.race!.text;

    const wrong = text[0] === 'z' ? 'q' : 'z';
    // Fast: 3 wrong keys (accuracy < 100), then perfect.
    const fast = (async () => {
      await fastDriver.type(wrong.repeat(3));
      await fastDriver.type(text);
    })();
    const midRun = (async () => {
      await sleep(120);
      await mid.type(text);
    })();
    await Promise.all([fast, midRun]);
    await sleep(150);
    const fin = fastDriver.last('finish')!;
    assert.ok(fin, 'the fastest driver got a private finish message');
    assert.equal(host.last('finish'), undefined, 'the host never finishes: they are not racing');
    assert.equal(fin.row.rank, 1);
    assert.equal(fin.row.finished, true);
    assert.equal(fin.row.trophies, 25);
    assert.equal(fin.row.accuracy, Math.round((text.length / (text.length + 3)) * 1000) / 10);
    assert.ok(fin.row.wpm > 0 && fin.row.score > 0);

    // `slow` types 20 characters after the others finished and then stops: once the idle limit passes → DNF "inactive"
    await slow.type(text.slice(0, 20));
    await Promise.all(all.map((c) => c.waitPhase('results', 5000)));
    const rows = host.room.results as ResultRow[];
    assert.deepEqual(rows.map((r) => r.name), ['Fast', 'Mid', 'Slow']);
    assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3]);
    assert.deepEqual(rows.map((r) => r.finished), [true, true, false]);
    assert.deepEqual(rows.map((r) => r.trophies), [25, 15, 0]);
    assert.equal(rows[2]!.timeMs, null);
    assert.equal(rows[2]!.dnfReason, 'inactive');
    assert.equal(rows[2]!.progress, Math.round((20 / text.length) * 1000) / 1000);
    assert.ok(rows[0]!.timeMs! < rows[1]!.timeMs!);
    for (const c of all) assert.deepEqual(c.room.results, rows, 'every device sees identical results');
    assert.deepEqual(host.room.players.filter((p) => !p.host).map((p) => p.trophies), [25, 15, 0]);
    assert.equal(host.room.players.find((p) => p.host)!.trophies, 0, 'the host earns nothing: they did not race');
    assert.ok(rows.every((r) => r.id !== host.me), 'the host is not in the ranking');
  });

  test('progress is only ever derived from keystrokes (made-up messages do nothing)', async () => {
    const { host, drivers, all } = await newRoom(port, ['Cheat']);
    track(all);
    const cheat = drivers[0]!;
    host.send({ t: 'start' });
    await cheat.waitPhase('racing');
    cheat.send({ t: 'finish', row: { rank: 1 } });
    cheat.send({ t: 'state', racers: [[cheat.me, 9999, 999, 1]] });
    cheat.send({ t: 'k', s: 'x', c: 'a' });
    cheat.send({ t: 'k', s: ++cheat.seq, c: 'abc' }); // multi-char "key" rejected
    await sleep(250);
    const st = cheat.last('state')!;
    assert.equal(st.racers.find((r) => r[0] === cheat.me)![1], 0);
    assert.equal(cheat.last('finish'), undefined);
  });

  test('reconnect mid-race resumes the same racer with progress intact (token), and by name', async () => {
    const { host, drivers, all } = await newRoom(port, ['Ruth', 'Sam']);
    track(all);
    const sam = drivers[1]!;
    host.send({ t: 'start' });
    await Promise.all(all.map((c) => c.waitPhase('racing')));
    const text = host.room.race!.text;
    await sam.type(text.slice(0, 12));
    await sleep(150);

    const { me, token, seq } = sam;
    sam.close(); // phone loses signal
    await host.waitFor((m) => m.t === 'room' && m.room.players.some((p) => p.id === me && !p.connected));

    const back = track(await Client.connect(port));
    back.send({ t: 'join', room: host.room.code, name: 'whatever', token });
    const joined = (await back.waitFor((m) => m.t === 'joined')) as Extract<ServerMsg, { t: 'joined' }>;
    assert.equal(joined.you, me);
    assert.equal(joined.seq, seq);
    assert.equal(joined.room.phase, 'racing');
    assert.equal(joined.room.race!.text, text);
    const st = (await back.waitFor((m) => m.t === 'state')) as Extract<ServerMsg, { t: 'state' }>;
    assert.equal(st.racers.find((r) => r[0] === me)![1], 12);
    await back.type(text.slice(12, 20)); // continues from the same sequence
    await sleep(250);
    assert.equal(back.last('state')!.racers.find((r) => r[0] === me)![1], 20);

    // Same name from a *new* device while the old one is offline also reclaims the seat.
    back.close();
    await host.waitFor((m) => m.t === 'room' && m.room.players.some((p) => p.id === me && !p.connected));
    const again = track(await Client.connect(port));
    again.send({ t: 'join', room: host.room.code, name: 'sam' });
    const j2 = (await again.waitFor((m) => m.t === 'joined')) as Extract<ServerMsg, { t: 'joined' }>;
    assert.equal(j2.you, me);
  });

  test('late joiners spectate the running race and race next time', async () => {
    const { host, code, all } = await newRoom(port, ['One']);
    track(all);
    host.send({ t: 'start' });
    await host.waitPhase('racing');
    const late = track(await Client.connect(port));
    late.send({ t: 'join', room: code, name: 'Late', team: 'ctrl' });
    await late.waitFor((m) => m.t === 'joined');
    assert.equal(late.room.players.find((p) => p.id === late.me)!.racing, false);
    late.send({ t: 'k', s: ++late.seq, c: host.room.race!.text[0]! });
    await sleep(250);
    const st = host.last('state')!;
    assert.equal(st.racers.length, 1, 'spectator is not on the track');
    assert.ok(st.racers.every((r) => r[1] === 0));
  });

  test('host can run another race and return to the lobby; trophies accumulate', async () => {
    const { host, drivers, all } = await newRoom(port, ['P', 'Q']);
    track(all);
    const [p, q] = drivers as [Client, Client];
    const run = async () => {
      host.send({ t: 'start' });
      await Promise.all(all.map((c) => c.waitPhase('racing')));
      await p.type(p.room.race!.text);
      await q.type(q.room.race!.text.slice(0, 5));
      await Promise.all(all.map((c) => c.waitPhase('results', 5000)));
    };
    await run();
    const raceId1 = host.room.race!.id;
    q.send({ t: 'lobby' }); // a driver: ignored
    await sleep(100);
    assert.equal(host.room.phase, 'results');
    await run(); // "race again" straight from results
    assert.equal(host.room.race!.id, raceId1 + 1);
    assert.equal(host.room.players.find((x) => x.id === p.me)!.trophies, 50);
    assert.equal(host.room.players.find((x) => x.id === host.me)!.trophies, 0, 'the host never earns trophies');
    host.send({ t: 'lobby' });
    await Promise.all(all.map((c) => c.waitPhase('lobby')));
    assert.equal(host.room.race, null);
  });

  test('host disconnect: host rights never pass to a driver — the room waits, and the returning host is the host again', async () => {
    const { host, drivers, all } = await newRoom(port, ['Deputy', 'Third']);
    track(all);
    const [deputy] = drivers as [Client, Client];
    const { token } = host;
    host.close();
    await deputy.waitFor((m) => m.t === 'room' && m.room.players.some((p) => p.host && !p.connected), 3000);
    await sleep(800); // well past any old grace period
    assert.notEqual(deputy.room.hostId, deputy.me, 'a driver never becomes host');
    deputy.send({ t: 'start' });
    await sleep(150);
    assert.equal(deputy.room.phase, 'lobby', 'a driver cannot start the race');

    const back = track(await Client.connect(port));
    back.send({ t: 'join', room: deputy.room.code, name: 'Host', token });
    await back.waitFor((m) => m.t === 'joined');
    await sleep(50);
    assert.equal(back.room.hostId, back.me, 'the host is back in charge');
    assert.equal(back.room.players.find((p) => p.id === back.me)!.host, true);
  });

  test('only the admin creates rooms: with a login configured, a create without a valid admin token is refused', async () => {
    const { createAdminAuth, makeCredentials } = await import('../server/admin');
    const auth = createAdminAuth(makeCredentials('boss', 'correct horse'));
    const secured = createApp({ config: FAST, admin: auth });
    const p2 = await secured.listen(0, '127.0.0.1');
    try {
      const anon = track(await Client.connect(p2));
      anon.send({ t: 'create', name: 'Mallory' });
      const err = await anon.waitFor((m) => m.t === 'error');
      assert.equal(err.t === 'error' && err.code, 'not_admin');
      const forged = track(await Client.connect(p2));
      forged.send({ t: 'create', name: 'Mallory', admin: '9999999999999.deadbeef' });
      const err2 = await forged.waitFor((m) => m.t === 'error');
      assert.equal(err2.t === 'error' && err2.code, 'not_admin');

      const token = auth.login('boss', 'correct horse')!;
      const admin = track(await Client.connect(p2));
      admin.send({ t: 'create', name: 'Boss', admin: token });
      const joined = await admin.waitFor((m) => m.t === 'joined');
      assert.ok(joined.t === 'joined' && joined.room.hostId === joined.you, 'the admin hosts the room');

      // the HTTP login: right password → token, wrong one → 401
      const post = (body: unknown) => fetch(`http://127.0.0.1:${p2}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const ok = await post({ username: 'BOSS', password: 'correct horse' });
      assert.equal(ok.status, 200);
      const { token: t2 } = (await ok.json()) as { token: string };
      assert.ok(auth.verify(t2));
      assert.equal((await post({ username: 'boss', password: 'wrong password' })).status, 401);
      const session = await fetch(`http://127.0.0.1:${p2}/api/admin/session`, { headers: { Authorization: `Bearer ${t2}` } });
      assert.deepEqual(await session.json(), { admin: true, configured: true });
    } finally {
      await secured.close();
    }
  });

  test('host can kick a driver; the kicked driver is told and removed', async () => {
    const { host, drivers, all } = await newRoom(port, ['Troll']);
    track(all);
    const troll = drivers[0]!;
    host.send({ t: 'kick', id: troll.me });
    await troll.waitFor((m) => m.t === 'kicked');
    await host.waitFor((m) => m.t === 'room' && m.room.players.length === 1);
  });

  test('empty lobby seats are pruned after the grace period', async () => {
    const { host, drivers, all } = await newRoom(port, ['Keep', 'Drop']);
    track(all);
    drivers[1]!.close();
    await host.waitFor((m) => m.t === 'room' && m.room.players.some((p) => !p.connected));
    assert.equal(host.room.players.length, 3, 'offline seat is kept for a while so they can come back');
    await sleep(FAST.lobbyPruneMs + 100);
    app.registry.sweep(); // production sweeps every 15 s; force one here
    await sleep(150);
    assert.equal(host.room.players.length, 2);
  });

  test('per-player key rate limit (human-impossible bursts are dropped but still acked)', async () => {
    const limited = createApp({ config: { ...FAST, maxKeysPerSecond: 40 } });
    const p = await limited.listen(0, '127.0.0.1');
    const { host, drivers, all } = await newRoom(p, ['Burst']);
    const burst = drivers[0]!;
    host.send({ t: 'start' });
    await burst.waitPhase('racing');
    const text = burst.room.race!.text;
    await burst.type(text.slice(0, 100)); // 100 keys in a few ms
    await sleep(250);
    const st = burst.last('state')!;
    const pos = st.racers.find((r) => r[0] === burst.me)![1];
    assert.ok(pos <= 40, `accepted ${pos} of 100 burst keys`);
    assert.equal(st.ack, burst.seq);
    for (const c of all) c.close();
    await limited.close();
  });

  test('message flood guard drops sustained floods from one socket but the server stays healthy', async () => {
    const guarded = createApp({ config: { ...FAST, maxMessagesPerSecond: 50 } });
    const p = await guarded.listen(0, '127.0.0.1');
    const { host, drivers, all } = await newRoom(p, ['Flood']);
    const flood = drivers[0]!;
    host.send({ t: 'start' });
    await flood.waitPhase('racing');
    const text = flood.room.race!.text;
    await flood.type(text); // 150 messages in one burst, bucket holds ≤ 100
    await sleep(300);
    const pos = flood.last('state')!.racers.find((r) => r[0] === flood.me)![1];
    assert.ok(pos < text.length, `flood should have been truncated, got ${pos}/${text.length}`);
    const other = await Client.connect(p); // the server still accepts others
    other.send({ t: 'ping', c: 1 });
    await other.waitFor((m) => m.t === 'pong');
    other.close();
    for (const c of all) c.close();
    await guarded.close();
  });

  test('a win does not end the race for anyone still typing: results come only when everyone is done (or genuinely stopped)', async () => {
    const { host, drivers, all } = await newRoom(port, ['Winner', 'Steady', 'Walker']);
    track(all);
    const [winner, steady, walker] = drivers as [Client, Client, Client];
    host.send({ t: 'start' });
    await Promise.all(all.map((c) => c.waitPhase('racing')));
    const text = host.room.race!.text;
    await winner.type(text); // Winner finishes at once
    await walker.type(text.slice(0, 10)); // Walker types 10 characters and then stops for good
    // Steady keeps typing — slowly, but never pauses longer than the idle limit (600 ms in FAST) — for 3× the idle limit
    const slowType = (async () => {
      for (const ch of text.slice(0, 140)) {
        steady.send({ t: 'k', s: ++steady.seq, c: ch });
        await sleep(15);
      }
    })();
    await slowType;
    assert.equal(host.room.phase, 'racing', 'still racing ~2 s after the winner because Steady is actively typing');
    await steady.type(text.slice(140), 15);
    await Promise.all(all.map((c) => c.waitPhase('results', 4000)));
    const rows = host.room.results as ResultRow[];
    assert.deepEqual(rows.map((r) => [r.name, r.finished, r.dnfReason]), [
      ['Winner', true, undefined],
      ['Steady', true, undefined],
      ['Walker', false, 'inactive'],
    ]);
    for (const c of all) assert.deepEqual(c.room.results, rows);
  });

  test('host can end the race early; a driver cannot; unfinished racers get DNF "ended"', async () => {
    const { host, drivers, all } = await newRoom(port, ['Boss', 'Slowpoke']);
    track(all);
    const [boss, slowpoke] = drivers as [Client, Client];
    host.send({ t: 'start' });
    await Promise.all(all.map((c) => c.waitPhase('racing')));
    await slowpoke.type(host.room.race!.text.slice(0, 12), 5);
    boss.send({ t: 'end' });
    slowpoke.send({ t: 'end' });
    await sleep(150);
    assert.equal(host.room.phase, 'racing', 'a driver cannot end the race');
    host.send({ t: 'end' });
    await Promise.all(all.map((c) => c.waitPhase('results')));
    const rows = host.room.results as ResultRow[];
    assert.ok(rows.every((r) => !r.finished && r.dnfReason === 'ended'));
    assert.equal(rows.find((r) => r.name === 'Slowpoke')!.progress, Math.round((12 / host.room.race!.text.length) * 1000) / 1000);
  });

  test('malformed frames never crash the server', async () => {
    const c = track(await Client.connect(port));
    c.ws.send('not json');
    c.ws.send('null');
    c.ws.send('{"t":"join"}');
    c.ws.send('{"t":"nope"}');
    c.ws.send(Buffer.from([1, 2, 3]));
    c.send({ t: 'create', name: '😀'.repeat(50) });
    const j = (await c.waitFor((m) => m.t === 'joined')) as Extract<ServerMsg, { t: 'joined' }>;
    assert.ok(j.room.players[0]!.name.length <= 16 * 2);
  });

  test('health endpoint', async () => {
    const r = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(r.status, 200);
    assert.equal(((await r.json()) as { ok: boolean }).ok, true);
  });
});
