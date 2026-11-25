import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RaceEngine, type Banner } from '../src/game/engine';
import type { ClientMsg, RacerTuple, ServerMsg } from '../shared/protocol';

type State = Extract<ServerMsg, { t: 'state' }>;
// `assert.equal(x, null)` narrows `x` to null for the type checker; read the banner through a function instead.
const bannerOf = (e: RaceEngine): Banner | null => e.banner;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function setup(text: string, players: string[], goAt = 1000) {
  const clock = { t: 0 };
  const sent: ClientMsg[] = [];
  const e = new RaceEngine({
    send: (m) => {
      sent.push(m);
      return true;
    },
    now: () => clock.t,
  });
  e.setIdentity('me', 0);
  e.startRace(
    { id: 1, text, goAt },
    players.map((id) => ({ id, name: id.toUpperCase() })),
  );
  return { e, sent, clock };
}
const state = (racers: RacerTuple[], ack: number): State => ({ t: 'state', race: 1, racers, ack });
const type = (e: InstanceType<typeof RaceEngine>, s: string) => [...s].map((c) => e.handleChar(c));

test('keys before GO are ignored (nothing is sent)', () => {
  const { e, sent, clock } = setup('hello world', ['me', 'b']);
  clock.t = 500;
  assert.deepEqual(type(e, 'hel'), ['ignored', 'ignored', 'ignored']);
  assert.equal(sent.length, 0);
  clock.t = 1000;
  assert.equal(e.handleChar('h'), 'ok');
  assert.equal(sent.length, 1);
});

test('wrong key does not advance but is still sent (server counts it for accuracy)', () => {
  const { e, sent, clock } = setup('hello world', ['me']);
  clock.t = 1200;
  assert.equal(e.handleChar('x'), 'wrong');
  assert.equal(e.mePos, 0);
  assert.equal(e.errorFlash, true);
  assert.deepEqual(sent, [{ t: 'k', s: 1, c: 'x' }]);
  assert.equal(e.handleChar('h'), 'ok');
  assert.equal(e.mePos, 1);
});

test('reconciliation: unacked keys stay applied, keys the server dropped are rolled back', () => {
  const { e, clock } = setup('hello world', ['me', 'b']);
  clock.t = 1100;
  type(e, 'hello'); // predicted pos 5
  assert.equal(e.mePos, 5);
  e.applyState(state([['me', 2, 0, 0], ['b', 0, 0, 0]], 2)); // server has seen 2 keys; 3 still in flight
  assert.equal(e.mePos, 5, 'in-flight keys are replayed on top of the server position');
  e.applyState(state([['me', 3, 0, 0], ['b', 0, 0, 0]], 5)); // everything acked, but server only accepted 3
  assert.equal(e.mePos, 3, 'server dropped 2 keys → we roll back instead of drifting');
});

test('predicted finish is reverted if the server did not actually finish us (the bug found in manual testing)', () => {
  const { e, clock } = setup('hello world', ['me']);
  clock.t = 1100;
  type(e, 'hello world');
  assert.equal(e.localFinish, true);
  assert.equal(e.racing, false);
  e.applyState(state([['me', 9, 0, 0]], 11)); // server dropped the last two chars
  assert.equal(e.localFinish, false);
  assert.equal(e.mePos, 9);
  assert.equal(e.racing, true, 'we are allowed to keep typing');
  type(e, 'ld');
  assert.equal(e.localFinish, true);
  e.applyState(state([['me', 11, 40, 31_400]], 13));
  assert.equal(e.myFinMs, 31_400, 'server-confirmed finish time is what we show');
  assert.equal(e.localFinish, true);
});

test('state for another race is ignored', () => {
  const { e } = setup('hello world', ['me', 'b']);
  e.applyState({ t: 'state', race: 99, racers: [['b', 8, 50, 0]], ack: 0 });
  assert.equal(e.racers.get('b')!.pos, 0);
});

test('lanes: you are always lane 0; the other four lanes go to the closest rivals out of 12', () => {
  const ids = ['me', ...Array.from({ length: 11 }, (_, i) => `r${i}`)];
  const { e, clock } = setup('x'.repeat(200), ids);
  clock.t = 1100;
  // me at 60; rivals spread at 5,15,25,...
  e.mePos = 60;
  const racers: RacerTuple[] = [['me', 60, 0, 0], ...ids.slice(1).map((id, i): RacerTuple => [id, 5 + i * 10, 0, 0])];
  e.applyState(state(racers, 0));
  for (let i = 0; i < 3; i++) e.tick();
  assert.equal(e.lanes[0], 'me');
  const chosen = e.lanes.slice(1) as string[];
  assert.equal(new Set(chosen).size, 4);
  // Closest to 60: r5 (55) and r6 (65) tie at 5, then r4 (45) / r7 (75) at 15, then r3 (35) / r8 (85) at 25.
  // Lane hysteresis lets a rival from the initial grid stay while still in the 6 closest, so check that bound:
  assert.ok(chosen.includes('r5') && chosen.includes('r6'), 'the two nearest rivals are always shown');
  assert.ok(chosen.every((id) => ['r3', 'r4', 'r5', 'r6', 'r7', 'r8'].includes(id)), `all within the 6 closest: ${chosen}`);

  // The race moves on: I surge to 120 with new rivals near me → old neighbours are replaced.
  e.mePos = 120;
  const moved: RacerTuple[] = [['me', 120, 0, 0], ...ids.slice(1).map((id, i): RacerTuple => [id, i === 9 ? 112 : i === 10 ? 127 : 5 + i * 10, 0, 0])];
  e.applyState(state(moved, 0));
  for (let i = 0; i < 9; i++) e.tick();
  const after = e.lanes.slice(1) as string[];
  assert.ok(after.includes('r9') && after.includes('r10'), `new neighbours take lanes: ${after}`);
  assert.equal(new Set(after).size, 4);
  assert.equal(e.lanes[0], 'me');
});

test('lanes are sticky: a rival keeps their lane while still among the closest', () => {
  const ids = ['me', 'a', 'b', 'c', 'd', 'e', 'f'];
  const { e, clock } = setup('x'.repeat(200), ids);
  clock.t = 1100;
  e.mePos = 50;
  const mk = (pos: Record<string, number>): RacerTuple[] => ids.map((id) => [id, id === 'me' ? 50 : pos[id]!, 0, 0]);
  e.applyState(state(mk({ a: 48, b: 52, c: 45, d: 55, e: 20, f: 90 }), 0));
  for (let i = 0; i < 3; i++) e.tick();
  const before = e.lanes.slice();
  // tiny reshuffle of who is closest must not move cars between lanes
  e.applyState(state(mk({ a: 47, b: 53, c: 44, d: 56, e: 21, f: 89 }), 0));
  for (let i = 0; i < 3; i++) e.tick();
  assert.deepEqual(e.lanes, before);
});

test('standings and rank: finished racers rank above unfinished; my place uses my predicted position', () => {
  const { e, clock } = setup('x'.repeat(100), ['me', 'a', 'b']);
  clock.t = 1100;
  e.mePos = 30;
  e.applyState(state([['b', 50, 0, 0], ['me', 30, 0, 0], ['a', 10, 0, 0]], 0));
  e.tick();
  assert.equal(e.hud.rank, 2);
  assert.deepEqual(e.standings().map((s) => s.id), ['b', 'me', 'a']);
  e.mePos = 60; // I overtake b locally before the server knows
  e.tick();
  assert.equal(e.hud.rank, 1);
  e.applyState(state([['a', 100, 70, 22_000], ['b', 50, 0, 0], ['me', 30, 0, 0]], 0)); // a finished
  assert.equal(e.standings()[0]!.id, 'a');
});

test('position banners are announced for net, settled changes only', async () => {
  const { e, clock } = setup('x'.repeat(200), ['me', 'a', 'b']);
  clock.t = 1100;
  e.tick(); // establishes the starting rank
  e.applyState(state([['a', 5, 0, 0], ['me', 0, 0, 0], ['b', 0, 0, 0]], 0)); // a overtakes
  e.tick();
  assert.equal(bannerOf(e), null, 'not announced until the rank has settled');
  await sleep(330);
  e.tick();
  assert.equal(bannerOf(e)?.kind, 'lost');
  assert.match(bannerOf(e)!.title, /OVERTAKEN! #2/);
  assert.match(bannerOf(e)!.sub, /-1 Position • A passed you! ACCELERATE!/);

  // I retake the lead after the cooldown: crown banner naming the car I passed
  await sleep(1000);
  e.mePos = 30;
  e.tick();
  await sleep(330);
  e.tick();
  assert.equal(bannerOf(e)?.kind, 'lead');
  assert.match(bannerOf(e)!.title, /IN THE LEAD! P1 LEADER/);
  assert.match(bannerOf(e)!.sub, /\+1 Position • You overtook A!/);
});

// ------------------------------------------------------------------------------------------------ keystroke delivery
function offlineSetup(text = 'hello world') {
  const net = { online: true };
  const sent: { s: number; c: string; at: number }[] = [];
  const clock = { t: 0 };
  const e = new RaceEngine({
    send: (m) => {
      if (!net.online) return false;
      if (m.t === 'k') sent.push({ s: m.s, c: m.c, at: performance.now() });
      return true;
    },
    now: () => clock.t,
  });
  e.setIdentity('me', 0);
  e.startRace({ id: 1, text, goAt: 100 }, [{ id: 'me', name: 'Me' }]);
  clock.t = 200;
  return { e, net, sent, clock };
}

test('REGRESSION — keys typed while the socket is down are queued and re-sent, in order, after the rejoin (they used to vanish)', async () => {
  const { e, net, sent } = offlineSetup();
  type(e, 'he'); // delivered (seq 1, 2)
  net.online = false; // Wi-Fi blip / stale-socket close
  type(e, 'llo wo'); // typed offline: the car moves, nothing leaves the browser
  assert.equal(e.mePos, 8);
  assert.equal(sent.length, 2, 'nothing was sent while offline');

  // The server only processed key 1 before the socket died (key 2 was still in flight).
  net.online = true;
  e.setIdentity('me', 1);
  type(e, 'r'); // the user keeps typing during the flush — it must queue behind the backlog, not jump ahead
  await new Promise((r) => setTimeout(r, 400));

  const resent = sent.slice(2);
  assert.deepEqual(resent.map((k) => k.s), [2, 3, 4, 5, 6, 7, 8, 9], 'everything after the server’s last seen key, once each, in order');
  assert.equal(resent.map((k) => k.c).join(''), 'ello wor');
  for (let i = 1; i < resent.length; i++) assert.ok(resent[i]!.at - resent[i - 1]!.at >= 20, 'paced so the server rate limit never drops one');
  assert.equal(e.mePos, 9, 'the local position was never rolled back');

  // the server acknowledges everything: position agrees
  e.applyState(state([['me', 9, 0, 0]], 9));
  assert.equal(e.mePos, 9);
});

test('REGRESSION — a whole passage typed offline is delivered after reconnect and the server finish is honoured', async () => {
  const { e, net, sent } = offlineSetup('go now');
  net.online = false;
  type(e, 'go now');
  assert.equal(e.localFinish, true);
  assert.equal(sent.length, 0);
  net.online = true;
  e.setIdentity('me', 0);
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(sent.map((k) => k.c).join(''), 'go now');
  e.applyState(state([['me', 6, 50, 4200]], 6)); // server: finished at 4.2 s
  assert.equal(e.myFinMs, 4200);
  assert.equal(e.localFinish, true);
});

test('an unacknowledged key is never dropped from the queue until the server acks it (acked keys are released)', () => {
  const { e, net, sent } = offlineSetup();
  type(e, 'hel');
  net.online = false;
  type(e, 'lo');
  e.applyState(state([['me', 2, 0, 0]], 2)); // acks 1-2; keys 3-5 still owed
  net.online = true;
  e.setIdentity('me', 2);
  assert.equal(e.mePos, 5);
  assert.ok(sent.length >= 4, 'the first owed key goes out immediately on rejoin');
  assert.equal(sent[sent.length - 1]!.s, 3);
});

test('rejoining as a different player discards the previous player’s queue', () => {
  const { e, net, sent } = offlineSetup();
  net.online = false;
  type(e, 'hel');
  net.online = true;
  e.setIdentity('someone-else', 0);
  assert.equal(sent.length, 0, 'nothing from the old identity is sent');
});

test('word completion fires a boom and boxes the finished word', () => {
  const { e, clock } = setup('go now', ['me']);
  clock.t = 1100;
  const boom0 = e.boomSeq;
  type(e, 'go');
  assert.equal(e.boomSeq, boom0, 'not until the space is typed');
  type(e, ' ');
  assert.equal(e.boomSeq, boom0 + 1);
  assert.equal(e.wordFlash, 0);
  type(e, 'now');
  assert.equal(e.boomSeq, boom0 + 2, 'last word completes on the final character');
  assert.equal(e.wordFlash, 1);
});
