import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { createApp, type App } from '../server/app';
import type { RoomConfig } from '../server/config';
import type { ResultRow } from '../shared/protocol';
import { BrowserLike } from './helpers/browser-like';
import { FAST, sleep } from './helpers/ws-client';

// Real race engine + real WebSocket + real server. Network trouble is injected between them.
// The host is a spectator (they watch and run the room but never race), so every racer here is a driver.

describe('client ↔ server: a valid finish is never lost', () => {
  let app: App | null = null;
  const clients: BrowserLike[] = [];
  afterEach(async () => {
    for (const c of clients.splice(0)) c.close();
    await app?.close();
    app = null;
  });

  /** A spectating host ("Host") plus one driver per name. */
  async function setup(config: Partial<RoomConfig>, names: string[]) {
    app = createApp({ config: { ...FAST, raceMaxMs: 20_000, idleDnfMs: 3000, racerOfflineMs: 5000, ...config } });
    const port = await app.listen(0, '127.0.0.1');
    const host = new BrowserLike(port, 'Host');
    clients.push(host);
    await host.connect({ create: true });
    // a new room opens on the activity dashboard; these tests are about TypeDrive
    host.send({ t: 'activity', activity: 'typedrive' });
    await host.until(() => host.room?.activity === 'typedrive');
    const drivers: BrowserLike[] = [];
    for (const n of names) {
      const d = new BrowserLike(port, n);
      clients.push(d);
      await d.connect({ code: host.room!.code });
      drivers.push(d);
    }
    return { host, drivers, all: [host, ...drivers] };
  }

  const startRace = async (host: BrowserLike, all: BrowserLike[]) => {
    host.send({ t: 'start' });
    await Promise.all(all.map((c) => c.until(() => c.room?.phase === 'racing')));
  };
  const resultsFor = (c: BrowserLike) => c.room!.results as ResultRow[];

  test('5a. with 80–160 ms of latency in both directions, both racers finish: engine and server agree, nobody is DNF', async () => {
    const { host, drivers, all } = await setup({}, ['Asha', 'Ben']);
    const [asha, ben] = drivers as [BrowserLike, BrowserLike];
    for (const c of all) c.latencyMs = 120;
    await startRace(host, all);
    assert.ok(all.every((c) => c.engine.len >= 300 && c.engine.len <= 350), 'the real client engine is racing a 300–350 character passage');
    await Promise.all([asha.typeAll(8), ben.typeAll(11)]);
    await Promise.all(all.map((c) => c.until(() => c.room?.phase === 'results', 10_000)));

    const rows = resultsFor(host);
    assert.deepEqual(rows.map((r) => r.name).sort(), ['Asha', 'Ben'], 'both drivers are listed — the host is not'); // order = who crossed first: not controlled here
    assert.ok(rows.every((r) => r.finished && r.dnfReason === undefined && r.accuracy === 100), 'both finished, nobody is DNF');
    assert.deepEqual(rows.map((r) => r.rank), [1, 2]);
    for (const c of all) assert.deepEqual(resultsFor(c), rows, `${c.name} received identical results`);
    for (const c of drivers) {
      assert.equal(c.engine.mePos, c.engine.len, 'client position agrees with the finished passage');
      assert.deepEqual(c.finish, rows.find((r) => r.id === c.me), 'the finish row the client saw equals its results row');
    }
    assert.equal(host.finish, null, 'the host got no finish row');
  });

  test('5b. the connection is severed mid-race and the racer keeps typing offline: after reconnecting, every key arrives and the finish counts', async () => {
    const { host, drivers, all } = await setup({}, ['Asha', 'Ben']);
    const [asha, ben] = drivers as [BrowserLike, BrowserLike];
    await startRace(host, all);
    const ashaRun = asha.typeAll(10);
    const benTyping = ben.typeAll(10); // Ben types at a steady pace the whole time

    await ben.until(() => ben.engine.mePos >= 40);
    ben.sever(); // Wi-Fi drops; Ben has no idea and keeps typing
    await sleep(700); // ~70 keys typed into the void
    const typedOffline = ben.engine.mePos;
    assert.ok(typedOffline >= 60, `Ben typed on while offline (position ${typedOffline}, was ~40 when the socket dropped)`);
    await ben.connect(); // reconnect: token resume → the backlog is re-sent
    await Promise.all([ashaRun, benTyping]);
    await Promise.all(all.map((c) => c.until(() => c.room?.phase === 'results', 10_000)));

    const rows = resultsFor(host);
    const benRow = rows.find((r) => r.name === 'Ben')!;
    assert.equal(benRow.finished, true, 'the keys typed offline were delivered; Ben is not DNF');
    assert.equal(benRow.dnfReason, undefined);
    assert.equal(benRow.accuracy, 100, 'no key was lost or duplicated');
    assert.equal(rows.find((r) => r.name === 'Asha')!.finished, true);
    assert.deepEqual(resultsFor(ben), rows);
  });

  test('5c. the server drops a burst of keys (rate limit) after the client predicted a finish: the client reconciles, keeps typing and still finishes', async () => {
    // 16 keys/s over a ~345-character passage takes ~21 s, so this test allows itself a longer deadline than the default 20 s.
    const { host, drivers, all } = await setup({ maxKeysPerSecond: 20, raceMaxMs: 60_000 }, ['Asha', 'Ben']);
    const [asha, ben] = drivers as [BrowserLike, BrowserLike];
    await startRace(host, all);
    const text = ben.engine.text;
    // Ben "types" the whole passage in a few hundred ms — superhuman. The server only accepts ~20 of those keys.
    for (let i = 0; i < text.length; i++) ben.engine.handleChar(text[i]!);
    assert.equal(ben.engine.localFinish, true, 'the client optimistically thinks it finished');
    await ben.until(() => !ben.engine.localFinish, 4000); // first state message reconciles: not actually finished
    assert.ok(ben.engine.mePos < text.length, `rolled back to the server position (${ben.engine.mePos}/${text.length})`);
    // He carries on at a human pace (16 keys/s, under the 20/s limit used here) and genuinely finishes
    await Promise.all([ben.typeAll(60), asha.typeAll(60)]);
    await Promise.all(all.map((c) => c.until(() => c.room?.phase === 'results', 10_000)));
    const rows = resultsFor(host);
    assert.ok(rows.every((r) => r.finished), 'both finished');
    assert.equal(rows.find((r) => r.name === 'Ben')!.dnfReason, undefined);
  });

  test('5d. a page refresh mid-race (new engine, same token) resumes at the server position and finishes', async () => {
    const { host, drivers, all } = await setup({}, ['Asha', 'Ben']);
    const [asha, old] = drivers as [BrowserLike, BrowserLike];
    await startRace(host, all);
    const ashaRun = asha.typeAll(12);
    await old.typeAll(10, () => old.engine.mePos >= 60);
    await sleep(100);
    const { token, me } = old;
    old.close();

    // "Refresh": a brand-new engine/socket, same session token
    const fresh = new BrowserLike(old['port' as keyof BrowserLike] as unknown as number, 'Ben');
    clients.push(fresh);
    fresh.token = token;
    fresh.room = old.room;
    await fresh.connect();
    assert.equal(fresh.me, me);
    await fresh.until(() => fresh.engine.mePos >= 55, 4000);
    await Promise.all([ashaRun, fresh.typeAll(10)]);
    await Promise.all([host, fresh].map((c) => c.until(() => c.room?.phase === 'results', 10_000)));
    const row = resultsFor(host).find((r) => r.name === 'Ben')!;
    assert.equal(row.finished, true);
    assert.equal(row.accuracy, 100);
  });

  test('6. two or more clients receive identical final results (including a genuine DNF), and each knows its own row', async () => {
    const { host, drivers, all } = await setup({}, ['Asha', 'Ben', 'Chitra']);
    await startRace(host, all);
    const [asha, ben, chitra] = drivers as [BrowserLike, BrowserLike, BrowserLike];
    chitra.engine.handleChar(chitra.engine.text[0]!); // Chitra types one character, then walks away
    await Promise.all([asha.typeAll(8), ben.typeAll(14)]);
    await Promise.all(all.map((c) => c.until(() => c.room?.phase === 'results', 10_000)));
    const rows = resultsFor(host);
    assert.deepEqual(rows.map((r) => [r.name, r.finished, r.dnfReason]), [['Asha', true, undefined], ['Ben', true, undefined], ['Chitra', false, 'inactive']]);
    for (const c of all) assert.deepEqual(resultsFor(c), rows);
  });

  test('7. the host leaving mid-race (they are only watching) interrupts nobody: the race goes on, no driver becomes host, nobody is DNF', async () => {
    const { host, drivers, all } = await setup({}, ['Asha', 'Ben', 'Chitra']);
    await startRace(host, all);
    const [asha, ben, chitra] = drivers as [BrowserLike, BrowserLike, BrowserLike];
    await asha.typeAll(8, () => asha.engine.mePos >= 25);

    // The (spectating) host exits the race mid-way
    host.send({ t: 'leave' });
    await ben.until(() => !!ben.room && ben.room.players.every((p) => p.name !== 'Host'), 4000);
    assert.equal(ben.room?.hostId, '', 'the room waits for the admin: no driver is made host');
    assert.equal(ben.room?.phase, 'racing', 'race continues for every driver');
    assert.ok(ben.room!.players.every((p) => p.name !== 'Host'), 'the host is gone from the room');

    // Every driver finishes normally
    await Promise.all([asha.typeAll(8), ben.typeAll(11), chitra.typeAll(14)]);
    await Promise.all(drivers.map((c) => c.until(() => c.room?.phase === 'results', 10_000)));
    const rows = resultsFor(ben);
    assert.deepEqual(
      rows.map((r) => [r.name, r.finished, r.dnfReason]),
      [
        ['Asha', true, undefined],
        ['Ben', true, undefined],
        ['Chitra', true, undefined],
      ],
    );
    assert.deepEqual(resultsFor(chitra), rows);
  });

  test('7b. a driver exiting mid-race leaves cleanly without interrupting the others’ races (DNF "left")', async () => {
    const { host, drivers, all } = await setup({}, ['Asha', 'Ben', 'Chitra']);
    await startRace(host, all);
    const [asha, ben, chitra] = drivers as [BrowserLike, BrowserLike, BrowserLike];
    await asha.typeAll(8, () => asha.engine.mePos >= 25);
    asha.send({ t: 'leave' });
    await ben.until(() => !!ben.room?.players.some((p) => p.name === 'Asha' && !p.connected), 4000);
    assert.equal(ben.room?.phase, 'racing', 'race continues for the remaining drivers');
    assert.equal(ben.room?.hostId, host.me, 'the host is still the host');

    await Promise.all([ben.typeAll(8), chitra.typeAll(12)]);
    await Promise.all([host, ben, chitra].map((c) => c.until(() => c.room?.phase === 'results', 10_000)));
    const rows = resultsFor(host);
    assert.deepEqual(
      rows.map((r) => [r.name, r.finished, r.dnfReason]),
      [
        ['Ben', true, undefined],
        ['Chitra', true, undefined],
        ['Asha', false, 'left'],
      ],
    );
    assert.deepEqual(resultsFor(chitra), rows);
  });

  test('8. the real client engine of the host is a spectator: no car, no WPM, no position, no banners — it follows the five leaders', async () => {
    const { host, drivers, all } = await setup({}, ['Asha', 'Ben', 'Chitra']);
    await startRace(host, all);
    const [asha, ben, chitra] = drivers as [BrowserLike, BrowserLike, BrowserLike];
    assert.equal(host.engine.spectating, true);
    for (const d of drivers) assert.equal(d.engine.spectating, false, `${d.name} is racing`);
    assert.equal(host.engine.racers.has(host.me), false, 'no racer entry for the host');
    assert.equal(host.engine.racers.size, 3, 'the host sees all three drivers');

    // the host's keystrokes go nowhere: the engine ignores them and the server would too
    assert.equal(host.engine.handleChar(host.engine.text[0]!), 'ignored');
    assert.equal(host.engine.mePos, 0);

    const running = Promise.all([asha.typeAll(8), ben.typeAll(20), chitra.typeAll(40)]);
    await host.until(() => (host.engine.standings()[0]?.pos ?? 0) >= 30, 6000);
    host.engine.tick();
    host.engine.tick();
    host.engine.tick(); // lanes are refreshed every third tick
    const stand = host.engine.standings();
    assert.equal(stand[0]!.id, asha.me, 'the fastest driver leads the live standings the host sees');
    assert.deepEqual(
      host.engine.lanes.filter(Boolean).sort(),
      [asha.me, ben.me, chitra.me].sort(),
      'the lanes show the leading drivers (never the host)',
    );
    assert.ok(!host.engine.lanes.includes(host.me));
    assert.equal(host.engine.hud.rank, 0, 'no position for the host');
    assert.equal(host.engine.banner, null, 'no overtake banners for a spectator');
    assert.ok(host.engine.hud.total === 3);
    host.engine.frame(0.05);
    assert.ok(host.engine.cameraPos() > 0, 'the camera follows the leader');

    await running;
    await Promise.all(all.map((c) => c.until(() => c.room?.phase === 'results', 10_000)));
    assert.deepEqual(resultsFor(host).map((r) => r.name), ['Asha', 'Ben', 'Chitra']);
  });
});
