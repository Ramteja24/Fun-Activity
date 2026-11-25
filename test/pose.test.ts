import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { POSE_PERFORM_MS, POSE_POINTS, POSE_ROUNDS, POSE_SPIN_MS } from '../shared/activities';
import type { PoseInfo, RoomInfo } from '../shared/protocol';
import { figureJoints, FIGURE_VIEW, POSE_BANK, poseById } from '../shared/poses';
import { TEAM_IDS, zeroPoints, type TeamId } from '../shared/teams';
import { createApp, parseClientMsg } from '../server/app';
import { pickPoses } from '../server/games/pose';
import { Sim } from './helpers/room-sim';
import { Client, FAST, newRoom, sleep } from './helpers/ws-client';

// The Funny Pose Challenge: the bank of 24 poses, how a session deals them, and the host-run round (choose a team → the spinner picks a
// player at random → start round → reveal pose → mark completed / not completed → next round), in a room and over real sockets.

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
const count = <T>(items: readonly T[], key: (t: T) => string) => {
  const m: Record<string, number> = {};
  for (const i of items) m[key(i)] = (m[key(i)] ?? 0) + 1;
  return m;
};

// ------------------------------------------------------------------------------------------------ the bank
describe('the 24 poses', () => {
  test('24 different poses, each with a title, a clear instruction, a category and an expression emoji', () => {
    assert.equal(POSE_BANK.length, 24);
    assert.equal(new Set(POSE_BANK.map((p) => p.id)).size, 24, 'unique ids');
    assert.equal(new Set(POSE_BANK.map((p) => p.title)).size, 24, 'unique titles');
    assert.equal(new Set(POSE_BANK.map((p) => p.cue)).size, 24, 'unique instructions');
    assert.deepEqual(Object.keys(count(POSE_BANK, (p) => p.category)).sort(), ['Attitude', 'Dance Moves', 'Heroes', 'Reactions', 'Sleepy & Thinking']);
    for (const p of POSE_BANK) {
      assert.ok(p.title.length >= 4 && p.cue.length >= 30, p.id);
      assert.ok(/\p{Extended_Pictographic}/u.test(p.badge), `${p.id} has an emoji badge`);
      assert.equal(poseById(p.id), p);
    }
    assert.equal(poseById('nope'), undefined);
    assert.ok(POSE_ROUNDS < POSE_BANK.length && POSE_ROUNDS === 8, 'a session uses 8 of the 24');
  });

  test('the poses the brief names are all there: confused, shocked, laughing, crying dramatically, superhero, sleeping, funny dance', () => {
    const titles = POSE_BANK.map((p) => p.title.toLowerCase()).join(' | ');
    for (const word of ['confused', 'shocked', 'laughing', 'crying', 'superhero', 'sleeping', 'dance']) assert.ok(titles.includes(word), word);
  });

  test('every pose has its own visual reference: a distinct figure that stays inside the picture', () => {
    assert.equal(new Set(POSE_BANK.map((p) => JSON.stringify(p.figure))).size, 24, 'no two poses are drawn the same');
    for (const p of POSE_BANK) {
      for (const [name, pt] of Object.entries(figureJoints(p.figure))) {
        assert.ok(pt.x >= 6 && pt.x <= FIGURE_VIEW.width - 6 && pt.y >= 6 && pt.y <= FIGURE_VIEW.height - 6, `${p.id}.${name} is at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)}), outside the picture`);
      }
    }
  });

  test('a session’s 8 poses are spread over the categories and never repeat across sessions until the bank runs short', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const used = new Set<string>();
      const rand = seeded(seed);
      const sessions = [pickPoses(8, used, rand), pickPoses(8, used, rand), pickPoses(8, used, rand)];
      sessions.forEach((s, i) => {
        assert.equal(new Set(s.map((p) => p.id)).size, 8);
        if (i < 2) {
          const cats = count(s, (p) => p.category);
          assert.equal(Object.keys(cats).length, 5, `session ${i + 1}: all five categories appear ${JSON.stringify(cats)}`);
          assert.ok(Math.max(...Object.values(cats)) <= 2);
        }
      });
      assert.equal(new Set(sessions.flat().map((p) => p.id)).size, 24, 'three sessions use the whole bank once');
      assert.equal(pickPoses(8, used, rand).length, 8, 'the bank starts over instead of running dry');
    }
  });
});

// ------------------------------------------------------------------------------------------------ the messages
describe('the pose messages', () => {
  test('plain steps and choosing a team parse; there is no message for choosing a player; anything malformed is dropped', () => {
    for (const op of ['start', 'begin', 'respin', 'reveal', 'done', 'notdone', 'next', 'reset']) assert.deepEqual(parseClientMsg(`{"t":"pose","op":"${op}"}`), { t: 'pose', op });
    assert.deepEqual(parseClientMsg('{"t":"pose","op":"team","team":"vibe"}'), { t: 'pose', op: 'team', team: 'vibe' });
    for (const bad of ['{"t":"pose"}', '{"t":"pose","op":"team"}', '{"t":"pose","op":"team","team":"reds"}', '{"t":"pose","op":"player","id":"abc123"}', '{"t":"pose","op":"back"}', '{"t":"pose","op":"spin"}', '{"t":"pose","op":"correct"}', '{"t":"emoji","op":"start"}']) {
      assert.equal(parseClientMsg(bad), null, bad);
    }
  });
});

// ------------------------------------------------------------------------------------------------ in a room
describe('the Funny Pose Challenge in a room', () => {
  let sim: Sim | null = null;
  afterEach(() => {
    sim?.destroy();
    sim = null;
  });

  /** A room on the pose activity with six participants: A1 A2 (Titans), B1 B2 (Vibe), C1 C2 (Ctrl). */
  const room = (seed = 11) => {
    sim = new Sim({}, 8, false, { activity: 'pose', rand: seeded(seed) });
    for (const [n, t] of [['A1', 'titans'], ['A2', 'titans'], ['B1', 'vibe'], ['B2', 'vibe'], ['C1', 'ctrl'], ['C2', 'ctrl']] as const) sim.join(n, t);
    return sim;
  };
  /** A room whose Titans have `n` players (A1…An), plus one Vibe player. */
  const bigTeam = (n: number, seed: number) => {
    sim = new Sim({}, 8, false, { activity: 'pose', rand: seeded(seed) });
    for (let i = 1; i <= n; i++) sim.join(`A${i}`, 'titans');
    sim.join('B1', 'vibe');
    return sim;
  };
  const host = (s: Sim) => s.room.hostId;
  const info = (s: Sim): RoomInfo => s.room.roomInfo();
  const pose = (s: Sim): PoseInfo => info(s).pose!;
  const cmd = (s: Sim, c: { op: string; team?: string }) => s.room.poseCommand(host(s), c);
  const nameOf = (s: Sim, id: string | undefined) => [...s.entries.entries()].find(([, e]) => e.p.id === id)?.[0];
  /** The host chooses a team and the spinner runs to a stop; returns the name of the player it picked. */
  const spin = (s: Sim, team: TeamId): string => {
    assert.ok(cmd(s, { op: 'team', team }), `choose ${team}`);
    assert.equal(pose(s).stage, 'spin');
    s.advance(POSE_SPIN_MS);
    assert.equal(pose(s).stage, 'selected');
    return nameOf(s, pose(s).player?.id)!;
  };
  const finishRound = (s: Sim, completed: boolean) => {
    assert.ok(cmd(s, { op: 'begin' }));
    assert.ok(cmd(s, { op: 'reveal' }));
    assert.ok(cmd(s, { op: completed ? 'done' : 'notdone' }));
    assert.ok(cmd(s, { op: 'next' }));
  };
  /** A whole round, marked as given; returns who performed. */
  const playRound = (s: Sim, team: TeamId, completed: boolean): string => {
    const who = spin(s, team);
    finishRound(s, completed);
    return who;
  };

  test('only the host, on the pose activity, with someone to play, can start it; the session opens on "choose a team" with nothing picked', () => {
    sim = new Sim({}, 8, false, { activity: null, rand: seeded(3) });
    assert.equal(cmd(sim, { op: 'start' }), false, 'not on the pose screen yet');
    sim.room.setActivity(host(sim), 'pose');
    assert.equal(cmd(sim, { op: 'start' }), false, 'nobody to play');
    sim.join('A1', 'titans');
    assert.equal(sim.room.poseCommand(sim.get('A1').p.id, { op: 'start' }), false, 'a participant cannot run it');
    assert.equal(cmd(sim, { op: 'bogus' }), false);
    assert.equal(cmd(sim, { op: 'start' }), true);
    assert.equal(cmd(sim, { op: 'start' }), false, 'a session is already running');
    const p = pose(sim);
    assert.deepEqual([p.stage, p.round, p.rounds, p.team, p.player, p.pool], ['pick', 1, POSE_ROUNDS, null, null, []]);
    assert.equal(p.poseId, undefined);
  });

  test('the host chooses only the team: the player is picked by the server from that team — and the host has no way to choose one', () => {
    const s = room(5);
    cmd(s, { op: 'start' });
    assert.equal(cmd(s, { op: 'begin' }), false, 'a round cannot start before a team is chosen and the spinner has landed');
    assert.equal(s.room.poseCommand(host(s), { op: 'player' }), false, 'there is no "choose a player" command');
    assert.equal(s.room.poseCommand(host(s), { op: 'back' }), false, 'and no "change player" either');
    assert.equal(cmd(s, { op: 'team', team: 'reds' }), false, 'not a team');
    assert.equal(cmd(s, { op: 'team', team: 'vibe' }), true);
    const p = pose(s);
    assert.equal(p.stage, 'spin', 'the spinner starts the moment the team is chosen');
    assert.equal(p.team, 'vibe');
    assert.ok(p.player && ['B1', 'B2'].includes(nameOf(s, p.player.id)!), 'the picked player is on the chosen team');
    assert.deepEqual(p.pool.map((x) => x.name).sort(), ['B1', 'B2'], 'the reel scrolls through everyone eligible on it');
    assert.equal(p.spinStartedAt, s.now());
    assert.equal(p.spinMs, POSE_SPIN_MS);
    assert.equal(cmd(s, { op: 'begin' }), false, 'not while the spinner is still spinning');
    assert.equal(cmd(s, { op: 'team', team: 'ctrl' }), false, 'the team cannot be changed mid-spin');
    s.advance(POSE_SPIN_MS - 1);
    assert.equal(pose(s).stage, 'spin');
    s.advance(1);
    assert.equal(pose(s).stage, 'selected', 'it lands after exactly the spin time, and the host can then start the round');
    assert.equal(cmd(s, { op: 'begin' }), true);
    assert.equal(pose(s).stage, 'ready');
  });

  test('the pick is genuinely random: over many spins every player of the team comes up, and not in a fixed order', () => {
    const s = bigTeam(6, 77);
    cmd(s, { op: 'start' });
    const seen: string[] = [];
    for (let i = 0; i < 240; i++) {
      seen.push(spin(s, 'titans'));
      assert.ok(cmd(s, { op: 'team', team: 'vibe' }), 'switching team abandons the spin (no turn is used)');
      s.advance(POSE_SPIN_MS);
    }
    const by = count(seen, (n) => n);
    assert.deepEqual(Object.keys(by).sort(), ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']);
    for (const n of Object.values(by)) assert.ok(n >= 20 && n <= 60, `each of six players about 40 times, got ${JSON.stringify(by)}`);
    assert.ok(new Set(seen.slice(0, 41).map((n, i) => n + seen[i + 1])).size > 10, 'not a repeating pattern');
  });

  test('fairness: nobody is picked again until everyone eligible on the team has had a turn — over several cycles', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      sim?.destroy();
      const s = bigTeam(4, seed);
      cmd(s, { op: 'start' });
      const seq: string[] = [];
      for (let r = 0; r < POSE_ROUNDS; r++) seq.push(playRound(s, 'titans', r % 2 === 0));
      for (let w = 0; w < POSE_ROUNDS; w += 4) assert.equal(new Set(seq.slice(w, w + 4)).size, 4, `seed ${seed}: ${seq.join(' ')}`);
    }
  });

  test('the rotation carries over to the next session in the same room, and someone who joins late goes first', () => {
    const s = bigTeam(4, 31);
    cmd(s, { op: 'start' });
    const first: string[] = [];
    for (let r = 0; r < 6; r++) first.push(playRound(s, 'titans', true)); // one full cycle of four, then two of the next
    assert.equal(new Set(first.slice(0, 4)).size, 4);
    assert.ok(cmd(s, { op: 'reset' }));
    cmd(s, { op: 'start' });
    const waiting = ['A1', 'A2', 'A3', 'A4'].filter((n) => !first.slice(4, 6).includes(n)).sort();
    const next2 = [spin(s, 'titans')];
    finishRound(s, true);
    next2.push(spin(s, 'titans'));
    assert.deepEqual([...next2].sort(), waiting, 'the two who had not had a turn in that cycle go next');
    // a newcomer has had no turns at all, so the spinner lands on them first
    finishRound(s, true);
    s.join('Late', 'titans');
    assert.equal(spin(s, 'titans'), 'Late');
  });

  test('a spin the host abandons by choosing another team costs nobody their turn — only a round that really starts counts', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      sim?.destroy();
      const s = room(seed);
      cmd(s, { op: 'start' });
      spin(s, 'titans');
      assert.equal(cmd(s, { op: 'team', team: 'titans' }), false, 'choosing the same team again does not re-spin (no fishing for a player)');
      spin(s, 'vibe'); // switch while a player is selected
      s.advance(0);
      spin(s, 'titans'); // …and back again
      const performer = spin(s, 'ctrl');
      assert.ok(performer.startsWith('C'));
      finishRound(s, true);
      // Titans and Vibe were spun but never started, so nobody there has played; Ctrl's second turn must go to the OTHER Ctrl player
      const other = spin(s, 'ctrl');
      assert.notEqual(other, performer, `seed ${seed}: ctrl's second turn goes to the other player`);
    }
  });

  test('only a connected participant of the chosen team is ever picked: never the host, another team, or someone who dropped or left', () => {
    for (let seed = 1; seed <= 40; seed++) {
      sim?.destroy();
      const s = bigTeam(4, seed);
      cmd(s, { op: 'start' });
      s.disconnect('A2');
      s.room.leave(s.get('A3').p);
      const who = spin(s, 'titans');
      assert.ok(who === 'A1' || who === 'A4', `seed ${seed}: picked ${who}`);
      assert.ok(pose(s).pool.every((x) => ['A1', 'A4'].includes(nameOf(s, x.id)!)), 'and the reel only shows people who are here');
      assert.notEqual(pose(s).player?.id, host(s));
    }
  });

  test('if the picked player drops while the spinner is still spinning it simply spins again among whoever is still here', () => {
    const s = room(9);
    cmd(s, { op: 'start' });
    cmd(s, { op: 'team', team: 'ctrl' });
    const first = nameOf(s, pose(s).player!.id)!;
    const other = first === 'C1' ? 'C2' : 'C1';
    s.disconnect(first);
    s.advance(POSE_SPIN_MS);
    assert.equal(pose(s).stage, 'spin', 'it runs again');
    assert.equal(nameOf(s, pose(s).player!.id), other);
    s.advance(POSE_SPIN_MS);
    assert.equal(pose(s).stage, 'selected');
    assert.equal(nameOf(s, pose(s).player!.id), other, 'the gone player is not the one that landed');
  });

  test('if the picked player is gone by the time the host starts the round, it does not start with them — it spins again, or back to choosing a team if nobody is left', () => {
    const s = room(12);
    cmd(s, { op: 'start' });
    const first = spin(s, 'vibe');
    s.disconnect(first);
    assert.equal(cmd(s, { op: 'begin' }), false, 'the round does not start with someone who has gone');
    assert.equal(pose(s).stage, 'spin');
    const second = nameOf(s, pose(s).player!.id)!;
    assert.notEqual(second, first);
    s.advance(POSE_SPIN_MS);
    s.disconnect(second);
    assert.equal(cmd(s, { op: 'begin' }), false);
    assert.deepEqual([pose(s).stage, pose(s).team, pose(s).player], ['pick', null, null], 'nobody on the team is left: choose a team again');
    assert.equal(cmd(s, { op: 'team', team: 'vibe' }), false, 'a team with nobody here cannot be chosen');
    assert.equal(cmd(s, { op: 'team', team: 'titans' }), true);
  });

  test('a participant cannot choose a team, start, reveal or mark anything', () => {
    const s = room();
    cmd(s, { op: 'start' });
    const a = s.get('A1').p.id;
    for (const c of [{ op: 'team', team: 'titans' }, { op: 'begin' }, { op: 'reveal' }, { op: 'done' }, { op: 'next' }, { op: 'reset' }]) assert.equal(s.room.poseCommand(a, c), false, c.op);
    assert.deepEqual([pose(s).stage, pose(s).team], ['pick', null]);
  });

  test('a round runs in order — team, spinner, start, reveal, mark, next — and every step out of order is refused', () => {
    const s = room();
    cmd(s, { op: 'start' });
    for (const op of ['begin', 'reveal', 'done', 'notdone', 'next']) assert.equal(cmd(s, { op }), false, `${op} while choosing`);
    spin(s, 'titans');
    for (const op of ['reveal', 'done', 'notdone', 'next']) assert.equal(cmd(s, { op }), false, `${op} before the round has started`);
    assert.equal(cmd(s, { op: 'begin' }), true);
    assert.equal(cmd(s, { op: 'team', team: 'vibe' }), false, 'no re-choosing once the round has started');
    for (const op of ['begin', 'done', 'notdone', 'next']) assert.equal(cmd(s, { op }), false, `${op} before the pose is revealed`);
    assert.equal(cmd(s, { op: 'reveal' }), true);
    assert.equal(cmd(s, { op: 'reveal' }), false, 'revealed once');
    assert.equal(cmd(s, { op: 'next' }), false, 'a verdict comes first');
    assert.equal(cmd(s, { op: 'done' }), true);
    for (const op of ['done', 'notdone', 'reveal']) assert.equal(cmd(s, { op }), false, `${op} after the verdict`);
    assert.equal(cmd(s, { op: 'next' }), true);
    assert.deepEqual([pose(s).stage, pose(s).round, pose(s).team, pose(s).player, pose(s).pool], ['pick', 2, null, null, []], 'the next round starts with nothing chosen');
  });

  test('which pose a round has stays hidden until the host reveals it — it is nowhere in what any screen is sent, spinner included', () => {
    const s = room();
    s.room.broadcastRoom();
    cmd(s, { op: 'start' });
    const hasPose = (text: string) => POSE_BANK.some((p) => text.includes(p.title) || text.includes(p.cue) || text.includes(`"${p.id}"`));
    const seen = () => [...s.entries.values()].map((e) => JSON.stringify(e.conn.last('room')));
    cmd(s, { op: 'team', team: 'titans' });
    for (const text of seen()) assert.equal(hasPose(text), false, 'not while spinning');
    s.advance(POSE_SPIN_MS);
    cmd(s, { op: 'begin' });
    assert.equal(pose(s).poseId, undefined);
    for (const text of seen()) assert.equal(hasPose(text), false, 'not before the reveal');
    cmd(s, { op: 'reveal' });
    const shown = pose(s).poseId!;
    assert.ok(poseById(shown), 'a real pose from the bank');
    for (const e of s.entries.values()) assert.equal(e.conn.room!.pose!.poseId, shown, `${e.p.name} sees the same pose`);
    assert.equal(pose(s).endsAt, s.now() + POSE_PERFORM_MS, 'the performing clock starts at the reveal');
  });

  test('scoring: 10 points to the performer’s team for a completed pose, 0 if not, recorded once; other teams are untouched', () => {
    const s = room();
    cmd(s, { op: 'start' });
    spin(s, 'vibe');
    cmd(s, { op: 'begin' });
    cmd(s, { op: 'reveal' });
    assert.deepEqual(pose(s).scores, zeroPoints());
    assert.equal(cmd(s, { op: 'done' }), true);
    assert.equal(cmd(s, { op: 'done' }), false, 'a round is marked once');
    assert.equal(cmd(s, { op: 'notdone' }), false);
    assert.deepEqual(pose(s).scores, { titans: 0, vibe: POSE_POINTS, ctrl: 0 });
    assert.deepEqual([pose(s).result, pose(s).gained, POSE_POINTS], ['completed', 10, 10]);
    cmd(s, { op: 'next' });
    spin(s, 'ctrl');
    cmd(s, { op: 'begin' });
    cmd(s, { op: 'reveal' });
    cmd(s, { op: 'notdone' });
    assert.deepEqual(pose(s).scores, { titans: 0, vibe: 10, ctrl: 0 });
    assert.deepEqual([pose(s).result, pose(s).gained], ['not_completed', 0]);
    assert.deepEqual(pose(s).history.map((h) => [h.team, h.completed, h.points]), [['vibe', true, 10], ['ctrl', false, 0]]);
    s.advance(120_000);
    assert.deepEqual(pose(s).scores, { titans: 0, vibe: 10, ctrl: 0 }, 'time passing changes nothing');
    assert.deepEqual(info(s).activities[1]!.points, { titans: 0, vibe: 10, ctrl: 0 }, 'it is the activity’s own score');
  });

  test('a whole session: 8 rounds, the host picks each team, the spinner each player; the team scores follow the host’s results', () => {
    const s = room(21);
    cmd(s, { op: 'start' });
    const plan: [TeamId, boolean][] = [['titans', true], ['vibe', true], ['ctrl', false], ['titans', false], ['vibe', true], ['ctrl', true], ['titans', true], ['ctrl', true]];
    const expected = zeroPoints();
    const performers: [TeamId, string][] = [];
    plan.forEach(([team, completed], i) => {
      assert.equal(pose(s).round, i + 1);
      assert.equal(pose(s).stage, 'pick');
      performers.push([team, playRound(s, team, completed)]);
      if (completed) expected[team] += POSE_POINTS;
      assert.deepEqual(pose(s).scores, expected);
    });
    const done = pose(s);
    assert.equal(done.stage, 'over', 'the 8th "next" ends the session');
    assert.equal(done.history.length, 8);
    for (const [team, who] of performers) assert.ok(who.startsWith(team === 'titans' ? 'A' : team === 'vibe' ? 'B' : 'C'), `${who} plays for ${team}`);
    for (const t of ['titans', 'ctrl'] as const) {
      const mine = performers.filter(([team]) => team === t).map(([, who]) => who);
      assert.equal(new Set(mine.slice(0, 2)).size, 2, `${t}: nobody twice before everyone`);
    }
    assert.equal(new Set(done.history.map((h) => h.poseId)).size, 8, 'eight different poses');
    assert.deepEqual(done.turns, { titans: 3, vibe: 2, ctrl: 3 });
    assert.deepEqual(done.scores, { titans: 20, vibe: 20, ctrl: 20 }, 'level on points: the screen shows a tie');
    assert.equal(cmd(s, { op: 'next' }), false);
    assert.equal(cmd(s, { op: 'team', team: 'vibe' }), false, 'nothing to choose once it is over');
    assert.equal(info(s).activities[1]!.status, 'done');
    assert.ok(done.history.every((h) => h.player.id !== host(s)), 'the host never performed');
  });

  test('every screen sees the same spinner, the same pick and the same start time', () => {
    const s = room(8);
    cmd(s, { op: 'start' });
    cmd(s, { op: 'team', team: 'ctrl' });
    s.advance(1500);
    s.room.broadcastRoom();
    const views = [...s.entries.values()].map((e) => e.conn.room!.pose!);
    for (const v of views) assert.deepEqual(v, views[0]!, 'identical on every screen');
    assert.equal(views[0]!.stage, 'spin');
    assert.equal(views[0]!.spinStartedAt, s.now() - 1500, 'the animation is timed from one server timestamp');
  });

  test('a second session starts fresh with different poses; the old one can be thrown away; the other scores are untouched', () => {
    const s = room(13);
    const play = () => {
      cmd(s, { op: 'start' });
      for (let r = 0; r < POSE_ROUNDS; r++) playRound(s, TEAM_IDS[r % 3]!, true);
      return pose(s);
    };
    const first = play();
    assert.equal(first.session, 1);
    assert.equal(Object.values(first.scores).reduce((a, b) => a + b, 0), POSE_ROUNDS * POSE_POINTS);
    const second = play();
    assert.equal(second.session, 2);
    assert.equal(Object.values(second.scores).reduce((a, b) => a + b, 0), POSE_ROUNDS * POSE_POINTS, 'replaced, not added to');
    const seen = new Set(first.history.map((h) => h.poseId));
    assert.ok(second.history.every((h) => !seen.has(h.poseId)), 'no pose repeats from the first session');
    cmd(s, { op: 'start' });
    cmd(s, { op: 'team', team: 'titans' }); // a spinner is running…
    assert.equal(cmd(s, { op: 'reset' }), true);
    s.advance(POSE_SPIN_MS * 2); // …and nothing happens when its timer would have fired
    assert.equal(info(s).pose, null);
    assert.deepEqual(info(s).activities[1]!.points, zeroPoints());
    assert.deepEqual(info(s).activities[0]!.points, zeroPoints(), 'TypeDrive’s score is its own');
  });

  test('re-spin: when the picked person is away the host spins again — never onto anyone skipped this round, and it costs nobody a turn', () => {
    const s = bigTeam(4, 71);
    cmd(s, { op: 'start' });
    assert.equal(cmd(s, { op: 'respin' }), false, 'nothing to re-spin before a team is chosen');
    cmd(s, { op: 'team', team: 'titans' });
    assert.equal(cmd(s, { op: 'respin' }), false, 'not while the spinner is still running');
    s.advance(POSE_SPIN_MS);
    const skipped: string[] = [];
    for (let i = 0; i < 3; i++) {
      const away = pose(s).player!.id;
      skipped.push(away);
      assert.equal(cmd(s, { op: 'respin' }), true);
      assert.equal(pose(s).stage, 'spin', 'the spinner runs again for the same team');
      assert.equal(pose(s).team, 'titans');
      assert.ok(!skipped.includes(pose(s).player!.id), 'never lands on anyone skipped this round');
      s.advance(POSE_SPIN_MS);
    }
    // all but one skipped: the last one is picked; skipping them too falls back to anyone but them
    const lastOne = pose(s).player!.id;
    assert.equal(cmd(s, { op: 'respin' }), true);
    assert.notEqual(pose(s).player!.id, lastOne);
    s.advance(POSE_SPIN_MS);
    assert.deepEqual([...s.room.roomInfo().pose!.history], [], 'nothing scored');
    assert.equal(cmd(s, { op: 'begin' }), true);
    assert.equal(cmd(s, { op: 'respin' }), false, 'not once the round has started');
  });

  test('re-spin is refused when the person picked is the only one on their team', () => {
    const s = bigTeam(2, 72);
    cmd(s, { op: 'start' });
    cmd(s, { op: 'team', team: 'vibe' }); // B1 is the only Vibe player
    s.advance(POSE_SPIN_MS);
    assert.equal(pose(s).player!.name, 'B1');
    assert.equal(cmd(s, { op: 'respin' }), false);
    assert.equal(pose(s).stage, 'selected', 'nothing changed');
  });

  test('re-spin costs nobody a turn: the skipped person comes up again in a later round before anyone who has played', () => {
    const s = bigTeam(2, 73);
    cmd(s, { op: 'start' });
    cmd(s, { op: 'team', team: 'titans' });
    s.advance(POSE_SPIN_MS);
    const away = pose(s).player!.id;
    cmd(s, { op: 'respin' });
    s.advance(POSE_SPIN_MS);
    const played = pose(s).player!.id;
    assert.notEqual(played, away);
    cmd(s, { op: 'begin' });
    cmd(s, { op: 'reveal' });
    cmd(s, { op: 'done' });
    cmd(s, { op: 'next' });
    cmd(s, { op: 'team', team: 'titans' });
    s.advance(POSE_SPIN_MS);
    assert.equal(pose(s).player!.id, away, 'the person skipped earlier has had no turn yet, so they come up first');
  });

  test('the host can leave for the dashboard mid-spin and come back to the landed pick; an admin who drops mid-round finishes it on return', () => {
    const s = room(2);
    cmd(s, { op: 'start' });
    cmd(s, { op: 'team', team: 'titans' });
    s.room.setActivity(host(s), 'hub');
    s.advance(POSE_SPIN_MS);
    s.room.setActivity(host(s), 'pose');
    assert.equal(pose(s).stage, 'selected', 'the spinner finished while the host was away');
    cmd(s, { op: 'begin' });
    cmd(s, { op: 'reveal' });
    s.room.leave(s.get(Sim.HOST).p);
    assert.equal(s.room.hostId, '', 'no driver takes over');
    assert.equal(s.room.poseCommand(s.get('A1').p.id, { op: 'done' }), false, 'a driver cannot mark the round');
    const back = s.room.join('Admin', { send() {}, close() {} }, undefined, undefined, true);
    assert.ok(back.ok);
    assert.equal(s.room.poseCommand(s.room.hostId, { op: 'done' }), true, 'the admin, back, finishes the round');
  });

  test('team membership is fixed while the Funny Pose Challenge is on', () => {
    const s = room(4);
    assert.equal(s.room.setTeam(s.get('A1').p, 'vibe'), false);
    s.room.setActivity(host(s), 'hub');
    assert.equal(s.room.setTeam(s.get('A1').p, 'vibe'), true, 'free on the dashboard');
  });
});

// ------------------------------------------------------------------------------------------------ over real sockets
describe('the Funny Pose Challenge over real WebSockets', () => {
  test('the host chooses the team, every screen runs the same spinner and lands on the same player, then the round continues; participants cannot choose', async () => {
    const app = createApp({ config: { ...FAST } });
    const port = await app.listen(0, '127.0.0.1');
    const sockets: Client[] = [];
    try {
      const { host, drivers, all } = await newRoom(port, [{ name: 'Tia', team: 'titans' }, { name: 'Tom', team: 'titans' }, { name: 'Vic', team: 'vibe' }, { name: 'Cy', team: 'ctrl' }], 'Host', 'pose');
      sockets.push(...all);
      const [tia, tom, vic] = drivers as [Client, Client, Client, Client];
      const everyone = (pred: (r: RoomInfo) => boolean, ms?: number) => Promise.all(all.map((c) => c.waitFor((m) => m.t === 'room' && pred(m.room), ms)));

      host.send({ t: 'pose', op: 'start' });
      await everyone((r) => r.pose?.stage === 'pick');
      tia.send({ t: 'pose', op: 'team', team: 'titans' }); // a participant cannot choose
      vic.send({ t: 'pose', op: 'player', id: tia.me }); // and there is no way to choose a player at all
      await sleep(100);
      assert.deepEqual([host.room.pose!.stage, host.room.pose!.team], ['pick', null]);

      host.send({ t: 'pose', op: 'team', team: 'titans' });
      await everyone((r) => r.pose?.stage === 'spin');
      const p = host.room.pose!;
      assert.ok([tia.me, tom.me].includes(p.player!.id), 'picked from the chosen team');
      for (const c of all) {
        assert.deepEqual(c.room.pose!.player, p.player, 'everyone has the same pick');
        assert.deepEqual(c.room.pose!.pool, p.pool);
        assert.equal(c.room.pose!.spinStartedAt, p.spinStartedAt, 'and the same start time to animate from');
      }
      host.send({ t: 'pose', op: 'begin' }); // too early
      await sleep(80);
      assert.equal(host.room.pose!.stage, 'spin');

      await everyone((r) => r.pose?.stage === 'selected', POSE_SPIN_MS + 2500);
      for (const c of all) assert.equal(c.room.pose!.player!.id, p.player!.id, 'the spinner landed on the player everyone was told about');
      host.send({ t: 'pose', op: 'begin' });
      await everyone((r) => r.pose?.stage === 'ready');
      assert.equal(JSON.stringify(all.map((c) => c.msgs.filter((m) => m.t === 'room').at(-1))).includes('"poseId"'), false, 'no pose before the reveal');
      host.send({ t: 'pose', op: 'reveal' });
      await everyone((r) => r.pose?.stage === 'posing');
      host.send({ t: 'pose', op: 'done' });
      await everyone((r) => r.pose?.stage === 'judged');
      assert.deepEqual(host.room.pose!.scores, { titans: POSE_POINTS, vibe: 0, ctrl: 0 });
      host.send({ t: 'pose', op: 'next' });
      await everyone((r) => r.pose?.round === 2 && r.pose.stage === 'pick');
    } finally {
      for (const c of sockets) c.close();
      await app.close();
    }
  });
});
