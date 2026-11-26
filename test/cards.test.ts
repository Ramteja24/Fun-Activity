import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { CARDS_PER_ROUND, CARDS_PICK_MS, CARDS_POINTS, CARDS_PREVIEW_MS, CARDS_ROUNDS, CARDS_SHUFFLE_LEAD_MS, CARDS_SWAP_MS, CARDS_SWAPS } from '../shared/activities';
import { finalPosition, pairsOf } from '../shared/cards';
import type { CardsInfo, RoomInfo } from '../shared/protocol';
import { TEAM_IDS, zeroPoints } from '../shared/teams';
import { createApp, parseClientMsg } from '../server/app';
import { makeSwaps } from '../server/games/cards';
import { Sim } from './helpers/room-sim';
import { Client, FAST, newRoom, sleep } from './helpers/ws-client';

// Playing Cards — find the joker: the shuffle, the host-run round (show → preview → shuffle → pick → reveal → next), first-correct
// scoring, the five rounds, and the same over real sockets.

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('the shuffle', () => {
  test('a swap exchanges two positions, and the joker’s final position follows every swap', () => {
    assert.equal(finalPosition(0, []), 0);
    assert.equal(finalPosition(0, [[0, 2]]), 2);
    assert.equal(finalPosition(2, [[0, 2]]), 0);
    assert.equal(finalPosition(1, [[0, 2]]), 1, 'a card not in the swap stays put');
    assert.equal(finalPosition(0, [[0, 1], [1, 2], [0, 2]]), 0);
    // a two-pair step: 0↔1 and 2↔3 at the same moment
    assert.equal(finalPosition(0, [[0, 1, 2, 3]]), 1);
    assert.equal(finalPosition(3, [[0, 1, 2, 3]]), 2);
    assert.equal(finalPosition(1, [[0, 1, 2, 3]]), 0, 'moved once, not again by the second pair');
    assert.equal(finalPosition(4, [[0, 1, 2, 3]]), 4);
    // against a plain simulation of the table
    const rand = seeded(5);
    for (let r = 0; r < 50; r++) {
      const n = 3 + (r % 3);
      const swaps = makeSwaps(n, 14, rand);
      const table = Array.from({ length: n }, (_, i) => i);
      for (const step of swaps) for (const [a, b] of pairsOf(step)) [table[a], table[b]] = [table[b]!, table[a]!];
      for (let k = 0; k < n; k++) assert.equal(table[finalPosition(k, swaps)], k);
    }
  });

  test('every step moves two different cards (or two separate pairs), never the same first pair twice in a row', () => {
    const rand = seeded(9);
    let doubles = 0;
    for (let r = 0; r < 200; r++) {
      const n = 3 + (r % 3);
      const swaps = makeSwaps(n, 12, rand);
      assert.equal(swaps.length, 12);
      swaps.forEach((step, i) => {
        assert.ok(step.length === 2 || step.length === 4);
        if (n < 4) assert.equal(step.length, 2, 'with 3 cards one pair at a time');
        if (step.length === 4) doubles++;
        assert.equal(new Set(step).size, step.length, 'the pairs of a step never share a position');
        for (const [a, b] of pairsOf(step)) assert.ok(a >= 0 && b < n && a < b, `${a},${b} within ${n}`);
        const prev = swaps[i - 1];
        assert.ok(!prev || prev[0] !== step[0] || prev[1] !== step[1], 'no repeated pair');
      });
    }
    assert.ok(doubles > 300, `two pairs move at once often (${doubles} times)`);
  });

  test('it gets harder every round: more cards, more swaps, faster swaps', () => {
    assert.equal(CARDS_ROUNDS, 10);
    for (const list of [CARDS_PER_ROUND, CARDS_SWAPS, CARDS_SWAP_MS]) assert.equal(list.length, CARDS_ROUNDS);
    for (let i = 1; i < CARDS_ROUNDS; i++) {
      assert.ok(CARDS_PER_ROUND[i]! >= CARDS_PER_ROUND[i - 1]!);
      assert.ok(CARDS_SWAPS[i]! > CARDS_SWAPS[i - 1]!);
      assert.ok(CARDS_SWAP_MS[i]! < CARDS_SWAP_MS[i - 1]!);
    }
  });
});

describe('a round in a room', () => {
  let sim: Sim | null = null;
  afterEach(() => {
    sim?.destroy();
    sim = null;
  });

  /** A room on Playing Cards with six participants (two per team): A1 A2 (Titans), B1 B2 (Vibe), C1 C2 (Ctrl). */
  const room = (seed = 21) => {
    sim = new Sim({}, 8, false, { activity: null, rand: seeded(seed) });
    for (const [n, t] of [['A1', 'titans'], ['A2', 'titans'], ['B1', 'vibe'], ['B2', 'vibe'], ['C1', 'ctrl'], ['C2', 'ctrl']] as const) sim.join(n, t);
    sim.room.setActivity(sim.room.hostId, 'cards');
    return sim;
  };
  const cards = (s: Sim): CardsInfo => s.room.roomInfo().cards!;
  const host = (s: Sim) => s.room.hostId;
  /** Show the joker and wait out the preview and the shuffle. */
  const toPick = (s: Sim) => {
    s.room.cardsCommand(host(s), 'show');
    s.advance(CARDS_PREVIEW_MS + 20);
    const c = cards(s);
    s.advance(CARDS_SHUFFLE_LEAD_MS + c.swaps!.length * c.swapMs + 20);
  };

  test('only the host runs it; it opens face down and tells nobody where the joker is until the preview', () => {
    const s = room();
    assert.equal(s.room.cardsCommand(s.get('A1').p.id, 'start'), false, 'a participant cannot start it');
    assert.equal(s.room.cardsCommand(host(s), 'start'), true);
    const c = cards(s);
    assert.deepEqual([c.stage, c.round, c.rounds, c.cards], ['ready', 1, CARDS_ROUNDS, CARDS_PER_ROUND[0]]);
    assert.equal(c.start, undefined, 'the joker is not shown before the preview');
    assert.equal(c.swaps, undefined);
    assert.equal(s.room.cardsCommand(s.get('B1').p.id, 'show'), false);
    assert.equal(s.room.cardsCommand(host(s), 'show'), true);
    assert.equal(cards(s).stage, 'preview');
    assert.ok(Number.isInteger(cards(s).start));
    assert.equal(cards(s).swaps, undefined, 'the shuffle is sent when it starts');
  });

  test('the round runs by itself from the preview to picking, on the server’s clock; picks count only while picking', () => {
    const s = room();
    s.room.cardsCommand(host(s), 'start');
    s.room.cardsCommand(host(s), 'show');
    assert.equal(s.room.cardPick(s.get('A1').p, 1, 0), false, 'not during the preview');
    s.advance(CARDS_PREVIEW_MS + 20);
    const c = cards(s);
    assert.equal(c.stage, 'shuffle');
    assert.equal(c.swaps!.length, CARDS_SWAPS[0]);
    assert.equal(c.swapMs, CARDS_SWAP_MS[0]);
    assert.ok(c.startsAt! > s.now(), 'a short lead so every screen starts together');
    assert.equal(s.room.cardPick(s.get('A1').p, 1, 0), false, 'not during the shuffle');
    s.advance(CARDS_SHUFFLE_LEAD_MS + c.swaps!.length * c.swapMs + 20);
    assert.equal(cards(s).stage, 'pick');
    assert.equal(cards(s).eligible, 6);
  });

  test('players have 10 seconds to pick: the clock starts when the shuffle stops, and at zero the cards turn over by themselves', () => {
    assert.equal(CARDS_PICK_MS, 10_000);
    const s = room();
    s.room.cardsCommand(host(s), 'start');
    toPick(s);
    const c = cards(s);
    assert.equal(c.stage, 'pick');
    assert.equal(c.pickMs, CARDS_PICK_MS);
    assert.ok(c.pickEndsAt! > s.now() && c.pickEndsAt! <= s.now() + CARDS_PICK_MS, 'one server timestamp every screen counts down to');
    const joker = finalPosition(c.start!, c.swaps!);
    assert.ok(s.room.cardPick(s.get('B1').p, 1, joker));
    s.advance(c.pickEndsAt! - s.now() - 10);
    assert.equal(cards(s).stage, 'pick', 'still open just before the end');
    s.advance(20);
    const done = cards(s);
    assert.equal(done.stage, 'reveal', 'time is up: revealed without the host');
    assert.equal(done.pickEndsAt, undefined);
    assert.equal(done.reveal!.first!.name, 'B1');
    assert.deepEqual(done.reveal!.gained, { titans: 0, vibe: CARDS_POINTS, ctrl: 0 });
    assert.equal(s.room.cardPick(s.get('A1').p, 1, joker), false, 'no picks after the time is up');
    // the host revealing sooner stops the clock: it never reveals (or scores) a second time
    assert.ok(s.room.cardsCommand(host(s), 'next'));
    toPick(s);
    assert.ok(s.room.cardsCommand(host(s), 'reveal'));
    s.advance(CARDS_PICK_MS * 2);
    assert.equal(cards(s).history.length, 2);
    assert.equal(cards(s).stage, 'reveal');
  });

  test('only the FIRST correct pick scores: 10 points for that player’s team, nothing for anyone else', () => {
    const s = room();
    s.room.cardsCommand(host(s), 'start');
    toPick(s);
    const c = cards(s);
    const joker = finalPosition(c.start!, c.swaps!);
    const wrong = (joker + 1) % c.cards;
    assert.equal(s.room.cardPick(s.get('B1').p, 1, wrong), true, 'a wrong pick first');
    s.advance(100);
    assert.equal(s.room.cardPick(s.get('C1').p, 1, joker), true, 'the first right one');
    s.advance(100);
    assert.equal(s.room.cardPick(s.get('A1').p, 1, joker), true, 'right, but later');
    assert.equal(s.room.cardPick(s.get('C1').p, 1, wrong), false, 'one pick per round, final');
    assert.equal(s.room.cardPick(s.get(Sim.HOST).p, 1, joker), false, 'the host does not play');
    assert.equal(s.room.cardPick(s.get('A2').p, 2, joker), false, 'only for this round');
    assert.equal(s.room.cardPick(s.get('A2').p, 1, 99), false, 'only a real card');
    assert.equal(cards(s).picked, 3);
    assert.equal(s.room.cardsCommand(s.get('A1').p.id, 'reveal'), false, 'only the host reveals');
    assert.equal(s.room.cardsCommand(host(s), 'reveal'), true);
    const r = cards(s).reveal!;
    assert.equal(r.joker, joker);
    assert.deepEqual(r.first, { id: s.get('C1').p.id, name: 'C1', team: 'ctrl' });
    assert.deepEqual(r.gained, { titans: 0, vibe: 0, ctrl: CARDS_POINTS });
    assert.equal(r.picks[joker], 2);
    assert.equal(r.picks[wrong], 1);
    assert.deepEqual(cards(s).scores, { titans: 0, vibe: 0, ctrl: CARDS_POINTS });
    assert.equal(s.room.cardsCommand(host(s), 'reveal'), false, 'scored once');
  });

  test('equal timestamps go to whoever arrived first; nobody right means nobody scores', () => {
    const s = room(33);
    s.room.cardsCommand(host(s), 'start');
    toPick(s);
    let c = cards(s);
    let joker = finalPosition(c.start!, c.swaps!);
    s.room.cardPick(s.get('B2').p, 1, joker); // same instant…
    s.room.cardPick(s.get('A2').p, 1, joker); // …but B2 arrived first
    s.room.cardsCommand(host(s), 'reveal');
    assert.equal(cards(s).reveal!.first!.name, 'B2');
    s.room.cardsCommand(host(s), 'next');
    toPick(s);
    c = cards(s);
    joker = finalPosition(c.start!, c.swaps!);
    s.room.cardPick(s.get('A1').p, 2, (joker + 1) % c.cards);
    s.room.cardsCommand(host(s), 'reveal');
    assert.equal(cards(s).reveal!.first, undefined);
    assert.deepEqual(cards(s).reveal!.gained, zeroPoints());
  });

  test('five rounds, more cards as it goes, then it is over; the score is the activity’s own and feeds the overall leaderboard', () => {
    const s = room(44);
    s.room.cardsCommand(host(s), 'start');
    for (let round = 1; round <= CARDS_ROUNDS; round++) {
      assert.equal(cards(s).round, round);
      assert.equal(cards(s).cards, CARDS_PER_ROUND[round - 1]);
      toPick(s);
      const c = cards(s);
      // the Titans find it every time
      s.room.cardPick(s.get('A1').p, round, finalPosition(c.start!, c.swaps!));
      s.room.cardsCommand(host(s), 'reveal');
      assert.equal(s.room.cardsCommand(host(s), 'next'), true);
    }
    const done = cards(s);
    assert.equal(done.stage, 'over');
    assert.equal(done.history.length, CARDS_ROUNDS);
    assert.deepEqual(done.scores, { titans: CARDS_ROUNDS * CARDS_POINTS, vibe: 0, ctrl: 0 });
    assert.equal(s.room.cardsCommand(host(s), 'next'), false);
    const info: RoomInfo = s.room.roomInfo();
    const act = info.activities.find((a) => a.id === 'cards')!;
    assert.equal(act.status, 'done');
    assert.deepEqual(act.points, done.scores);
    const by = Object.fromEntries(info.overall.map((r) => [r.id, r.points]));
    assert.deepEqual([by.titans, by.vibe, by.ctrl], [CARDS_ROUNDS * CARDS_POINTS, 0, 0], 'the points go straight onto the overall scoreboard');
    // a fresh game replaces the score
    assert.equal(s.room.cardsCommand(host(s), 'start'), true);
    assert.deepEqual(cards(s).scores, zeroPoints());
    assert.equal(s.room.cardsCommand(host(s), 'reset'), true);
    assert.equal(s.room.roomInfo().cards, null);
  });

  test('teams are fixed while it is on', () => {
    const s = room();
    assert.equal(s.room.setTeam(s.get('A1').p, 'vibe'), false);
    s.room.setActivity(host(s), 'hub');
    assert.equal(s.room.setTeam(s.get('A1').p, 'vibe'), true);
  });
});

describe('Playing Cards over real WebSockets', () => {
  test('only well-formed messages pass', () => {
    assert.deepEqual(parseClientMsg(JSON.stringify({ t: 'cards', op: 'show' })), { t: 'cards', op: 'show' });
    assert.equal(parseClientMsg(JSON.stringify({ t: 'cards', op: 'peek' })), null);
    assert.deepEqual(parseClientMsg(JSON.stringify({ t: 'cardpick', round: 1, card: 2 })), { t: 'cardpick', round: 1, card: 2 });
    for (const bad of [{ round: 0, card: 1 }, { round: 1, card: -1 }, { round: 1.5, card: 1 }, { round: 1, card: '2' }, { round: 1 }]) {
      assert.equal(parseClientMsg(JSON.stringify({ t: 'cardpick', ...bad })), null, JSON.stringify(bad));
    }
  });

  test('every screen gets the same shuffle and timing; the first correct pick scores for its team; a reconnect lands back in the round', async () => {
    const app = createApp({ config: { ...FAST } });
    const port = await app.listen(0, '127.0.0.1');
    const sockets: Client[] = [];
    try {
      const { host, drivers, all, code } = await newRoom(port, [{ name: 'Tia', team: 'titans' }, { name: 'Vic', team: 'vibe' }, { name: 'Cy', team: 'ctrl' }], 'Host', 'cards');
      sockets.push(...all);
      const [tia, vic, cy] = drivers as [Client, Client, Client];
      const everyone = (pred: (r: RoomInfo) => boolean, ms = 12_000) => Promise.all(all.map((c) => c.waitFor((m) => m.t === 'room' && pred(m.room), ms)));

      tia.send({ t: 'cards', op: 'start' }); // a participant cannot
      await sleep(80);
      assert.equal(host.room.cards, null);
      host.send({ t: 'cards', op: 'start' });
      await everyone((r) => r.cards?.stage === 'ready');
      host.send({ t: 'cards', op: 'show' });
      await everyone((r) => r.cards?.stage === 'shuffle');
      const c = host.room.cards!;
      for (const x of all) {
        assert.deepEqual(x.room.cards!.swaps, c.swaps, 'the same shuffle on every screen');
        assert.equal(x.room.cards!.startsAt, c.startsAt, 'from the same moment');
        assert.equal(x.room.cards!.start, c.start);
      }
      await everyone((r) => r.cards?.stage === 'pick');
      const joker = finalPosition(c.start!, c.swaps!);
      vic.send({ t: 'cardpick', round: 1, card: (joker + 1) % c.cards });
      await sleep(30);
      cy.send({ t: 'cardpick', round: 1, card: joker });
      await sleep(30);
      tia.send({ t: 'cardpick', round: 1, card: joker });
      await host.waitFor((m) => m.t === 'room' && m.room.cards?.picked === 3, 3000);

      // Tia drops and comes back with her token: she is back in the same round, her pick kept
      const token = tia.token;
      tia.close();
      const back = await Client.connect(port);
      sockets.push(back);
      back.send({ t: 'join', room: code, name: 'Tia', token });
      await back.waitFor((m) => m.t === 'joined');
      assert.equal(back.room.cards!.stage, 'pick');
      assert.equal(back.room.cards!.picked, 3);

      host.send({ t: 'cards', op: 'reveal' });
      await Promise.all([host, vic, cy, back].map((x) => x.waitFor((m) => m.t === 'room' && m.room.cards?.stage === 'reveal')));
      const r = host.room.cards!.reveal!;
      assert.equal(r.joker, joker);
      assert.equal(r.first!.name, 'Cy');
      assert.deepEqual(r.gained, { titans: 0, vibe: 0, ctrl: 10 });
      assert.deepEqual(host.room.activities.find((a) => a.id === 'cards')!.points, { titans: 0, vibe: 0, ctrl: 10 });
      for (const t of TEAM_IDS) assert.equal(vic.room.cards!.scores[t], r.gained[t], 'everyone sees the same score');
    } finally {
      for (const c of sockets) c.close();
      await app.close();
    }
  });
});
