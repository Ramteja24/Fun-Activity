import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import {
  ACTIVITIES,
  isScreen,
  nextActivity,
  overallLeaders,
  overallStandings,
  placementFor,
  POSE_POINTS,
  POSE_SPIN_MS,
  TRIVIA_LIMIT_MS,
  TRIVIA_POINTS,
  TRIVIA_QUESTIONS,
  type ActivityScore,
} from '../shared/activities';
import type { RoomInfo, TriviaInfo } from '../shared/protocol';
import { TEAM_IDS, zeroPoints, type TeamId } from '../shared/teams';
import { createApp } from '../server/app';
import { TRIVIA_BANK } from '../server/data/trivia-bank';
import { pickQuestions } from '../server/games/trivia';
import { Sim, Typist } from './helpers/room-sim';
import { Client, FAST, newRoom, sleep } from './helpers/ws-client';

// The Weekly Fun Activity: the dashboard, Funny Pose Challenge, Tech Trivia, per-activity scores and the overall leaderboard.
// TypeDrive's own behaviour is covered by the other test files (they run unchanged on top of this).

/** A small seeded random source, so a "random" test is the same every run. */
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

// ------------------------------------------------------------------------------------------------ the banks
describe('the question banks', () => {
  test('Tech Trivia’s bank: four distinct options per question, one right answer, every topic covered, the right answer not always in the same place', () => {
    assert.ok(TRIVIA_BANK.length >= 20);
    assert.equal(new Set(TRIVIA_BANK.map((q) => q.id)).size, TRIVIA_BANK.length);
    assert.equal(new Set(TRIVIA_BANK.map((q) => q.text)).size, TRIVIA_BANK.length);
    for (const q of TRIVIA_BANK) {
      assert.equal(q.options.length, 4, q.id);
      assert.equal(new Set(q.options).size, 4, `${q.id}: options are distinct`);
      assert.ok(q.options.every((o) => o.trim().length > 0));
      assert.ok([0, 1, 2, 3].includes(q.correct), q.id);
      assert.ok(q.explanation.length > 10, q.id);
    }
    const byCat = count(TRIVIA_BANK, (q) => q.category);
    assert.deepEqual(Object.keys(byCat).sort(), ['AI', 'Cloud', 'Git', 'Python', 'SQL', 'Software']);
    for (const n of Object.values(byCat)) assert.ok(n >= 4);
    const where = count(TRIVIA_BANK, (q) => String(q.correct));
    for (const i of ['0', '1', '2', '3']) assert.ok((where[i] ?? 0) >= 4, `option ${i} is the answer ${where[i]} times`);
    assert.equal(TRIVIA_QUESTIONS, 5);
  });

  test('the banks stay on the server: neither the answers nor the questions are imported by any client code', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    for (const dir of ['src', 'shared']) {
      for (const f of readdirSync(join(root, dir), { recursive: true, withFileTypes: true }).filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name))) {
        assert.doesNotMatch(readFileSync(join(f.parentPath, f.name), 'utf8'), /trivia-bank/, `${dir}/${f.name}`);
      }
    }
  });
});

// ------------------------------------------------------------------------------------------------ fair picking
describe('picking trivia questions', () => {
  test('questions: five from five different categories, none repeated until the bank would run short, then it starts over', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const used = new Set<string>();
      const rand = seeded(seed);
      const seen = new Set<string>();
      for (let quiz = 0; quiz < 4; quiz++) {
        const qs = pickQuestions(5, used, rand);
        assert.equal(qs.length, 5);
        assert.equal(new Set(qs.map((q) => q.category)).size, 5, 'five different topics');
        if (quiz < 3) for (const q of qs) assert.ok(!seen.has(q.id), `seed ${seed}: ${q.id} repeated in quiz ${quiz + 1}`);
        for (const q of qs) seen.add(q.id);
      }
    }
  });

  test('a question is worth TRIVIA_POINTS (10) to the team of the first correct answer, and nothing to anyone else', () => {
    assert.equal(TRIVIA_POINTS, 10);
  });
});

// ------------------------------------------------------------------------------------------------ the overall leaderboard
describe('the overall leaderboard', () => {
  const act = (id: ActivityScore['id'], points: Partial<Record<TeamId, number>>, status: ActivityScore['status'] = 'done'): ActivityScore => ({ id, status, points: { ...zeroPoints(), ...points } });

  test('placements add up: 1st 3 · 2nd 2 · 3rd 1 in each activity that has scored; the raw scale of an activity does not matter', () => {
    assert.deepEqual([1, 2, 3, 4].map(placementFor), [3, 2, 1, 0]);
    const rows = overallStandings([
      act('typedrive', { titans: 2400, vibe: 1800, ctrl: 900 }), // a big-scale game: Titans 1st, Vibe 2nd, Ctrl 3rd
      act('pose', { titans: 100, vibe: 300, ctrl: 200 }), // Vibe 1st, Ctrl 2nd, Titans 3rd
      act('trivia', { titans: 150, vibe: 100, ctrl: 450 }), // Ctrl 1st, Titans 2nd, Vibe 3rd
    ]);
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    assert.deepEqual([by.titans!.placement, by.vibe!.placement, by.ctrl!.placement], [3 + 1 + 2, 2 + 3 + 1, 1 + 2 + 3]);
    assert.ok(rows.every((r) => r.rank === 1 && r.tied && r.wins === 1), 'a perfect three-way tie: nobody is picked');
    assert.deepEqual(overallLeaders(rows).sort(), [...TEAM_IDS].sort());
  });

  test('a clear winner, the order, and the leaders', () => {
    const rows = overallStandings([act('typedrive', { titans: 500, vibe: 300, ctrl: 100 }), act('pose', { titans: 200, vibe: 100, ctrl: 0 }), act('trivia', { titans: 0, vibe: 0, ctrl: 0 }, 'pending')]);
    assert.deepEqual(rows.map((r) => [r.id, r.placement, r.rank, r.tied]), [['titans', 6, 1, false], ['vibe', 4, 2, false], ['ctrl', 2, 3, false]]);
    assert.deepEqual(overallLeaders(rows), ['titans']);
  });

  test('an activity nothing has scored in adds nothing; before anything scores there is no leader', () => {
    const none = overallStandings([act('typedrive', {}, 'pending'), act('pose', {}, 'live'), act('trivia', {}, 'live')]);
    assert.ok(none.every((r) => r.placement === 0));
    assert.deepEqual(overallLeaders(none), []);
    const one = overallStandings([act('typedrive', {}, 'pending'), act('pose', { vibe: 100 }, 'live'), act('trivia', {}, 'pending')]);
    assert.deepEqual(one.map((r) => [r.id, r.placement]), [['titans', 2], ['vibe', 3], ['ctrl', 2]], 'two teams on 0 share 2nd');
  });

  test('level on placements: more activity wins ranks higher; still level after that is shown as a tie', () => {
    // vibe: 1st + 3rd (4), titans: 2nd + 2nd (4) — equal placements, but vibe has a win
    const rows = overallStandings([act('typedrive', { vibe: 10, titans: 5, ctrl: 1 }), act('pose', { titans: 5, vibe: 1, ctrl: 10 })]);
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    assert.equal(by.vibe!.placement, 3 + 1);
    assert.equal(by.titans!.placement, 2 + 2);
    assert.ok(by.vibe!.rank < by.titans!.rank || by.vibe!.wins > by.titans!.wins);
  });

  test('the three activities, in the order they are played, and how they link', () => {
    assert.deepEqual(ACTIVITIES.map((a) => a.name), ['TypeDrive', 'Funny Pose Challenge', 'Tech Trivia']);
    assert.deepEqual(ACTIVITIES.map((a) => a.id), ['typedrive', 'pose', 'trivia']);
    assert.equal(nextActivity('typedrive'), 'pose');
    assert.equal(nextActivity('pose'), 'trivia');
    assert.equal(nextActivity('trivia'), null);
    assert.ok(isScreen('hub') && isScreen('pose') && !isScreen('chess') && !isScreen(3));
  });
});

// ------------------------------------------------------------------------------------------------ the room
describe('the dashboard and the activities in a room', () => {
  let sim: Sim | null = null;
  afterEach(() => {
    sim?.destroy();
    sim = null;
  });

  /** A room on the dashboard with six participants (two per team): A1 A2 (Titans), B1 B2 (Vibe), C1 C2 (Ctrl). */
  const lobby = (seed = 11, cfg = {}) => {
    sim = new Sim(cfg, 8, false, { activity: null, rand: seeded(seed) });
    for (const [n, t] of [['A1', 'titans'], ['A2', 'titans'], ['B1', 'vibe'], ['B2', 'vibe'], ['C1', 'ctrl'], ['C2', 'ctrl']] as const) sim.join(n, t);
    return sim;
  };
  const host = (s: Sim) => s.room.hostId;
  const info = (s: Sim): RoomInfo => s.room.roomInfo();
  const trivia = (s: Sim): TriviaInfo => info(s).trivia!;

  test('a new room opens on the dashboard with the three activities in order, none started, every score at zero', () => {
    sim = new Sim({}, 8, false, { activity: null });
    const i = info(sim);
    assert.equal(i.activity, 'hub');
    assert.deepEqual(i.activities.map((a) => [a.id, a.status]), [['typedrive', 'pending'], ['pose', 'pending'], ['trivia', 'pending']]);
    assert.ok(i.activities.every((a) => TEAM_IDS.every((t) => a.points[t] === 0)));
    assert.deepEqual(i.overall.map((r) => r.placement), [0, 0, 0]);
    assert.equal(i.pose, null);
    assert.equal(i.trivia, null);
    assert.equal(sim.room.roomInfo().teams.length, 3, 'the same three teams as TypeDrive');
  });

  test('only the host moves the room between the dashboard and the activities, and every screen follows', () => {
    const s = lobby();
    s.room.broadcastRoom();
    assert.equal(s.room.setActivity(s.get('A1').p.id, 'pose'), false, 'a participant cannot');
    assert.equal(s.room.setActivity(host(s), 'chess'), false, 'not an activity');
    assert.equal(info(s).activity, 'hub');
    assert.equal(s.room.setActivity(host(s), 'pose'), true);
    for (const e of s.entries.values()) assert.equal(e.conn.room!.activity, 'pose', `${e.p.name} was taken along`);
    assert.equal(s.room.setActivity(host(s), 'trivia'), true);
    assert.equal(s.room.setActivity(host(s), 'hub'), true);
    assert.equal(s.room.setActivity(host(s), 'hub'), true, 'already there is fine');
  });

  test('TypeDrive races only start from TypeDrive, cannot be left mid-race, and its points are its own', () => {
    const s = lobby();
    assert.equal(s.start(), false, 'not from the dashboard');
    assert.equal(s.room.setActivity(host(s), 'typedrive'), true);
    assert.equal(s.start(), true);
    assert.equal(s.room.setActivity(host(s), 'hub'), false, 'not during the countdown');
    s.advanceToGo();
    assert.equal(s.room.setActivity(host(s), 'pose'), false, 'not mid-race');
    const typists = ['C1', 'B1', 'A1', 'C2', 'B2', 'A2'].map((n, i) => new Typist(s, n, { msPerChar: 60 + i * 10 }));
    s.runUntil((s.text.length * 130) / 1000 + 70, typists);
    assert.equal(s.phase, 'results');
    assert.equal(s.room.setActivity(host(s), 'hub'), true, 'between races the host can go back');
    const i = info(s);
    assert.deepEqual(i.activities[0]!.points, { titans: 60, vibe: 95, ctrl: 130 });
    assert.deepEqual(i.activities[1]!.points, zeroPoints());
    assert.deepEqual(i.activities[2]!.points, zeroPoints());
    assert.equal(i.activities[0]!.status, 'live');
    assert.equal(s.room.setActivity(host(s), 'typedrive'), true, 'and come back to the results where they were');
    assert.equal(info(s).phase, 'results');
    assert.deepEqual(i.overall.map((r) => [r.id, r.placement]), [['titans', 1], ['vibe', 2], ['ctrl', 3]]);
  });

  test('team membership is fixed while Funny Pose Challenge or Tech Trivia is on, but free on the dashboard', () => {
    const s = lobby(4);
    assert.equal(s.room.setTeam(s.get('A1').p, 'vibe'), true, 'on the dashboard');
    assert.equal(s.room.setTeam(s.get('A1').p, 'titans'), true);
    s.room.setActivity(host(s), 'pose');
    assert.equal(s.room.setTeam(s.get('A1').p, 'vibe'), false);
    s.room.setActivity(host(s), 'trivia');
    assert.equal(s.room.setTeam(s.get('A1').p, 'vibe'), false);
    s.room.setActivity(host(s), 'hub');
    assert.equal(s.room.setTeam(s.get('A1').p, 'vibe'), true);
  });

  // ---------------------------------------------------------------------------------------------- Tech Trivia
  test('Tech Trivia: the host starts it; five questions, one at a time, four options, a timer, and no answer in the payload', () => {
    const s = lobby(31);
    s.room.setActivity(host(s), 'trivia');
    assert.equal(s.room.triviaCommand(s.get('A1').p.id, 'start'), false, 'a participant cannot');
    assert.equal(s.room.triviaCommand(host(s), 'start'), true);
    const t = trivia(s);
    assert.equal(t.stage, 'question');
    assert.equal(t.total, TRIVIA_QUESTIONS);
    assert.equal(t.index, 0);
    assert.equal(t.question.options.length, 4);
    assert.equal(t.endsAt, s.now() + TRIVIA_LIMIT_MS);
    assert.equal(t.eligible, 6);
    assert.equal(t.answered, 0);
    assert.equal(t.reveal, undefined, 'the right answer is withheld until the reveal');
    assert.ok(!JSON.stringify(t).includes('explanation'));
    assert.equal(s.room.triviaCommand(host(s), 'next'), false, 'nothing to move on from yet');
    assert.equal(s.room.triviaCommand(host(s), 'start'), false, 'a quiz is already running');
  });

  test('answers: one per question and final, only from participants who were here when it opened, only valid options for the question in play', () => {
    const s = lobby(32);
    s.room.setActivity(host(s), 'trivia');
    s.room.triviaCommand(host(s), 'start');
    const a1 = s.get('A1').p;
    assert.equal(s.room.triviaAnswer(s.get(Sim.HOST).p, 0, 0), false, 'the host does not answer');
    assert.equal(s.room.triviaAnswer(a1, 1, 0), false, 'not the question in play');
    assert.equal(s.room.triviaAnswer(a1, 0, 4), false, 'not an option');
    assert.equal(s.room.triviaAnswer(a1, 0, -1), false);
    assert.equal(s.room.triviaAnswer(a1, 0, 1.5), false);
    assert.equal(s.room.triviaAnswer(a1, 0, 2), true);
    assert.equal(s.room.triviaAnswer(a1, 0, 3), false, 'an answer is final');
    const late = s.join('Late', 'ctrl');
    assert.equal(s.room.triviaAnswer(late.p, 0, 0), false, 'someone who arrives after the question opened cannot answer it');
    s.advance(200);
    assert.equal(trivia(s).answered, 1);
    assert.deepEqual(trivia(s).answeredByTeam.titans, { answered: 1, eligible: 2 });
    assert.deepEqual(trivia(s).answeredByTeam.vibe, { answered: 0, eligible: 2 });
    assert.equal(trivia(s).reveal, undefined, 'nobody learns what others picked, or the answer, early');
  });

  /** The right option index of the question in play: read from the server's own bank, as the host would know it. */
  const right = (s: Sim) => TRIVIA_BANK.find((q) => q.text === trivia(s).question.text)!.correct;

  test('scoring: only the FIRST correct answer scores — 10 for that player’s team, 0 for everyone else; recorded once, at the reveal', () => {
    const s = lobby(33);
    s.room.setActivity(host(s), 'trivia');
    s.room.triviaCommand(host(s), 'start');
    const ok = right(s);
    const wrong = (ok + 1) % 4;
    // A2 answers first but wrong (never scores); B1 is the first correct; C1 and C2 are correct later.
    assert.ok(s.room.triviaAnswer(s.get('A2').p, 0, wrong));
    s.advance(1000);
    assert.ok(s.room.triviaAnswer(s.get('B1').p, 0, ok));
    s.advance(1000);
    assert.ok(s.room.triviaAnswer(s.get('C1').p, 0, ok));
    assert.ok(s.room.triviaAnswer(s.get('C2').p, 0, ok));
    s.advance(TRIVIA_LIMIT_MS); // the clock runs out: A1 and B2 never answered
    const t = trivia(s);
    assert.equal(t.stage, 'reveal');
    const r = t.reveal!;
    assert.equal(r.correct, ok);
    assert.deepEqual(r.first, { id: s.get('B1').p.id, name: 'B1', team: 'vibe' });
    assert.deepEqual(r.gained, { titans: 0, vibe: 10, ctrl: 0 }, 'two Ctrl players right, but later: no points');
    assert.deepEqual(r.tally, { titans: { correct: 0, eligible: 2 }, vibe: { correct: 1, eligible: 2 }, ctrl: { correct: 2, eligible: 2 } });
    assert.equal(r.picks[ok], 3);
    assert.equal(r.picks[wrong], 1);
    assert.ok(r.explanation && r.explanation.length > 10);
    assert.deepEqual(t.scores, r.gained, 'the question’s points are now the quiz score');
    // once only
    assert.equal(s.room.triviaCommand(host(s), 'reveal'), false, 'already revealed');
    assert.equal(s.room.triviaAnswer(s.get('B2').p, 0, ok), false, 'too late');
    s.advance(60_000);
    assert.deepEqual(trivia(s).scores, r.gained, 'time passing changes nothing');
  });

  test('a tie on the clock goes to whoever arrived first; wrong answers never score; nobody right means 0 for every team', () => {
    const s = lobby(35);
    s.room.setActivity(host(s), 'trivia');
    s.room.triviaCommand(host(s), 'start');
    let ok = right(s);
    // same instant: C2 arrives before A1
    assert.ok(s.room.triviaAnswer(s.get('C2').p, 0, ok));
    assert.ok(s.room.triviaAnswer(s.get('A1').p, 0, ok));
    s.room.triviaCommand(host(s), 'reveal');
    assert.equal(trivia(s).reveal!.first!.name, 'C2');
    assert.deepEqual(trivia(s).reveal!.gained, { titans: 0, vibe: 0, ctrl: 10 });
    s.room.triviaCommand(host(s), 'next');
    // question 2: everyone wrong
    ok = right(s);
    for (const [n, e] of s.entries) if (n !== Sim.HOST) s.room.triviaAnswer(e.p, 1, (ok + 1) % 4);
    const t = trivia(s);
    assert.equal(t.stage, 'reveal', 'everyone answered, so it closed at once');
    assert.equal(t.reveal!.first, undefined, 'nobody got it right');
    assert.deepEqual(t.reveal!.gained, { titans: 0, vibe: 0, ctrl: 0 });
    assert.deepEqual(t.scores, { titans: 0, vibe: 0, ctrl: 10 });
  });

  test('a whole quiz: 5 questions from different topics, the host moves it on, scores add up once each, then the final leaderboard and top players', () => {
    const s = lobby(34);
    s.room.setActivity(host(s), 'trivia');
    s.room.triviaCommand(host(s), 'start');
    const cats = new Set<string>();
    let total = zeroPoints();
    const everyone = [...s.entries].filter(([n]) => n !== Sim.HOST);
    for (let q = 0; q < TRIVIA_QUESTIONS; q++) {
      const t = trivia(s);
      assert.equal(t.index, q);
      cats.add(t.question.category);
      const ok = right(s);
      for (const [n, e] of everyone) {
        // Titans always right, Vibe right on even questions, Ctrl always wrong
        const choice = n.startsWith('A') ? ok : n.startsWith('B') && q % 2 === 0 ? ok : (ok + 1) % 4;
        s.room.triviaAnswer(e.p, q, choice);
      }
      assert.equal(trivia(s).stage, 'reveal');
      const gained = trivia(s).reveal!.gained;
      for (const tm of TEAM_IDS) total[tm] += gained[tm];
      assert.deepEqual(trivia(s).scores, total);
      assert.equal(s.room.triviaCommand(host(s), 'next'), true);
    }
    assert.equal(cats.size, 5, 'five different topics');
    const done = trivia(s);
    assert.equal(done.stage, 'over');
    assert.equal(done.history.length, 5);
    assert.deepEqual(done.scores, total);
    assert.equal(done.scores.ctrl, 0);
    // the Titans answer first every time, so A1 wins every question; Vibe is right on even questions, but later
    assert.deepEqual(done.scores, { titans: 5 * TRIVIA_POINTS, vibe: 0, ctrl: 0 });
    assert.equal(done.top!.length, 5);
    assert.deepEqual(done.top!.map((p) => p.points), [...done.top!.map((p) => p.points)].sort((a, b) => b - a));
    assert.equal(done.top![0]!.name, 'A1', 'top players are ranked by questions won');
    assert.equal(done.top![0]!.points, 5 * TRIVIA_POINTS);
    assert.equal(done.top![0]!.correct, 5);
    assert.ok(done.top!.slice(1).every((p) => p.points === 0), 'right but not first scores nothing');
    assert.equal(s.room.triviaCommand(host(s), 'next'), false);
    // Tech Trivia's score is its own
    const i = info(s);
    assert.deepEqual(i.activities[2]!.points, total);
    assert.equal(i.activities[2]!.status, 'done');
    assert.deepEqual(i.activities[0]!.points, zeroPoints());
    assert.deepEqual(i.activities[1]!.points, zeroPoints());
    assert.equal(overallLeaders(i.overall)[0], 'titans');
    // a second quiz uses different questions and replaces the scores
    s.room.triviaCommand(host(s), 'start');
    assert.equal(trivia(s).session, 2);
    assert.deepEqual(trivia(s).scores, zeroPoints());
  });

  test('the host can reveal a question early; nobody answering scores nothing and is not a problem', () => {
    const s = lobby(35);
    s.room.setActivity(host(s), 'trivia');
    s.room.triviaCommand(host(s), 'start');
    s.advance(3000);
    assert.equal(s.room.triviaCommand(host(s), 'reveal'), true);
    assert.equal(trivia(s).stage, 'reveal');
    assert.deepEqual(trivia(s).reveal!.gained, zeroPoints());
    assert.equal(s.room.triviaCommand(host(s), 'next'), true);
    assert.equal(trivia(s).index, 1);
    assert.equal(trivia(s).answered, 0);
    assert.equal(trivia(s).endsAt, s.now() + TRIVIA_LIMIT_MS, 'a fresh clock for the next question');
  });

  test('a participant who answered correctly first and then dropped still wins the question for their team', () => {
    const s = lobby(36);
    s.room.setActivity(host(s), 'trivia');
    s.room.triviaCommand(host(s), 'start');
    const ok = right(s);
    s.room.triviaAnswer(s.get('A1').p, 0, ok);
    s.disconnect('A1');
    s.disconnect('A2');
    s.advance(TRIVIA_LIMIT_MS);
    const r = trivia(s).reveal!;
    assert.deepEqual(r.tally.titans, { correct: 1, eligible: 2 });
    assert.equal(r.first!.name, 'A1');
    assert.deepEqual(r.gained, { titans: 10, vibe: 0, ctrl: 0 });
  });

  test('scores for the three activities stay apart and the overall leaderboard adds the placements', () => {
    const s = lobby(50, {});
    // TypeDrive: Ctrl wins
    s.room.setActivity(host(s), 'typedrive');
    s.start();
    s.advanceToGo();
    const typists = ['C1', 'B1', 'A1', 'C2', 'B2', 'A2'].map((n, i) => new Typist(s, n, { msPerChar: 60 + i * 10 }));
    s.runUntil((s.text.length * 130) / 1000 + 70, typists);
    s.room.endMatch(host(s));
    // Funny Pose Challenge: the host picks each round's team — Titans complete all three of theirs, Vibe one of two, Ctrl none of three
    s.room.setActivity(host(s), 'pose');
    s.room.poseCommand(host(s), { op: 'start' });
    const rounds: [TeamId, boolean][] = [['titans', true], ['vibe', true], ['ctrl', false], ['titans', true], ['vibe', false], ['ctrl', false], ['titans', true], ['ctrl', false]];
    for (const [team, completed] of rounds) {
      const h = host(s);
      s.room.poseCommand(h, { op: 'team', team });
      s.advance(POSE_SPIN_MS); // the spinner picks the player
      s.room.poseCommand(h, { op: 'begin' });
      s.room.poseCommand(h, { op: 'reveal' });
      s.room.poseCommand(h, { op: completed ? 'done' : 'notdone' });
      s.room.poseCommand(h, { op: 'next' });
    }
    // Tech Trivia: Vibe scores most
    s.room.setActivity(host(s), 'trivia');
    s.room.triviaCommand(host(s), 'start');
    for (let q = 0; q < TRIVIA_QUESTIONS; q++) {
      const ok = right(s);
      for (const [n, e] of s.entries) if (n !== Sim.HOST) s.room.triviaAnswer(e.p, q, n.startsWith('B') ? ok : (ok + 1) % 4);
      s.room.triviaCommand(host(s), 'next');
    }
    s.room.setActivity(host(s), 'hub');
    const i = info(s);
    assert.deepEqual(i.activities.map((a) => a.status), ['done', 'done', 'done']);
    const [td, em, tr] = i.activities.map((a) => a.points) as [Record<TeamId, number>, Record<TeamId, number>, Record<TeamId, number>];
    assert.deepEqual(td, { titans: 60, vibe: 95, ctrl: 130 });
    assert.deepEqual(em, { titans: 3 * POSE_POINTS, vibe: POSE_POINTS, ctrl: 0 });
    assert.ok(tr.vibe > 0 && tr.titans === 0 && tr.ctrl === 0);
    // placements: TypeDrive ctrl 3 / vibe 2 / titans 1; Funny Pose titans 3 / vibe 2 / ctrl 1; Trivia vibe 3 / (titans & ctrl share 2nd: 2 each)
    const by = Object.fromEntries(i.overall.map((r) => [r.id, r]));
    assert.deepEqual([by.titans!.placement, by.vibe!.placement, by.ctrl!.placement], [1 + 3 + 2, 2 + 2 + 3, 3 + 1 + 2]);
    assert.equal(by.vibe!.rank, 1);
    assert.equal(by.vibe!.tied, false);
    assert.deepEqual(overallLeaders(i.overall), ['vibe']);
    assert.ok(by.titans!.tied && by.ctrl!.tied && by.titans!.rank === 2, 'level on points and wins: shown as a tie for second, not ordered arbitrarily');
  });

  test('the snapshot stays small with 50 participants in the middle of a trivia question', () => {
    sim = new Sim({}, 8, true, { activity: null, rand: seeded(60) });
    for (let i = 0; i < 50; i++) sim.join(`P${String(i).padStart(2, '0')}`);
    sim.room.setActivity(host(sim), 'trivia');
    sim.room.triviaCommand(host(sim), 'start');
    for (let i = 0; i < 30; i++) sim.room.triviaAnswer(sim.get(`P${String(i).padStart(2, '0')}`).p, 0, i % 4);
    const bytes = JSON.stringify(sim.room.roomInfo()).length;
    assert.ok(bytes < 16_000, `${bytes} bytes`);
  });
});

// ------------------------------------------------------------------------------------------------ over real sockets
describe('the activities over real WebSockets', () => {
  test('the dashboard first; the host takes everyone to Tech Trivia; answers, auto-reveal and scoring come from the server, and the right answer arrives only at the reveal', async () => {
    const app = createApp({ config: { ...FAST } });
    const port = await app.listen(0, '127.0.0.1');
    const sockets: Client[] = [];
    try {
      const { host, drivers, all } = await newRoom(port, [{ name: 'Tia', team: 'titans' }, { name: 'Vic', team: 'vibe' }, { name: 'Cy', team: 'ctrl' }], 'Host', 'hub');
      sockets.push(...all);
      await sleep(80);
      for (const c of all) assert.equal(c.room.activity, 'hub', 'everyone lands on the dashboard');
      assert.deepEqual(host.room.activities.map((a) => a.id), ['typedrive', 'pose', 'trivia']);

      // a driver cannot move the room; garbage is ignored
      drivers[0]!.send({ t: 'activity', activity: 'trivia' });
      host.send({ t: 'activity', activity: 'chess' });
      await sleep(100);
      assert.equal(host.room.activity, 'hub');

      host.send({ t: 'activity', activity: 'trivia' });
      await Promise.all(all.map((c) => c.waitFor((m) => m.t === 'room' && m.room.activity === 'trivia')));
      host.send({ t: 'trivia', op: 'start' });
      await Promise.all(all.map((c) => c.waitFor((m) => m.t === 'room' && m.room.trivia?.stage === 'question')));
      const q = host.room.trivia!;
      for (const c of all) assert.deepEqual(c.room.trivia!.question, q.question, 'everyone sees the same question');
      assert.equal(q.reveal, undefined);
      const raw = JSON.stringify(drivers[0]!.msgs.filter((m) => m.t === 'room').at(-1));
      assert.ok(!raw.includes('"correct"'), 'no right answer in what a player receives');

      const bank = TRIVIA_BANK.find((x) => x.text === q.question.text)!;
      drivers[0]!.send({ t: 'answer', q: 0, choice: bank.correct });
      drivers[0]!.send({ t: 'answer', q: 0, choice: (bank.correct + 1) % 4 }); // a second answer is ignored
      drivers[1]!.send({ t: 'answer', q: 0, choice: (bank.correct + 1) % 4 });
      host.send({ t: 'answer', q: 0, choice: bank.correct }); // the host does not play
      await sleep(400); // the answer count is batched
      assert.equal(host.room.trivia!.answered, 2);
      drivers[2]!.send({ t: 'answer', q: 0, choice: bank.correct });
      await Promise.all(all.map((c) => c.waitFor((m) => m.t === 'room' && m.room.trivia?.stage === 'reveal')));
      const r = host.room.trivia!.reveal!;
      assert.equal(r.correct, bank.correct);
      assert.deepEqual(r.gained, { titans: 10, vibe: 0, ctrl: 0 }, 'the first correct answer (a Titan) wins; the later Ctrl answer scores nothing');
      assert.equal(r.first!.team, 'titans');
      for (const c of all) assert.deepEqual(c.room.trivia!.scores, r.gained);
      assert.deepEqual(host.room.activities[2]!.points, r.gained);

      // the host moves on; a late answer to the old question is refused
      host.send({ t: 'trivia', op: 'next' });
      await Promise.all(all.map((c) => c.waitFor((m) => m.t === 'room' && m.room.trivia?.index === 1)));
      drivers[1]!.send({ t: 'answer', q: 0, choice: 0 });
      await sleep(100);
      assert.equal(host.room.trivia!.answered, 0);
    } finally {
      for (const c of sockets) c.close();
      await app.close();
    }
  });
});
