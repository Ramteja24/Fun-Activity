import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { createApp } from '../server/app';
import { NAME_MAX, type ResultRow, type RoomInfo } from '../shared/protocol';
import {
  FINISH_POINTS,
  isTeamId,
  nameKey,
  OTHER_FINISHER_POINTS,
  rankTeams,
  rosterTeamFor,
  TEAMS,
  TEAM_IDS,
  teamPointsFor,
  winningTeams,
  zeroPoints,
  type TeamId,
} from '../shared/teams';
import { Sim, Typist } from './helpers/room-sim';
import { Client, FAST, newRoom, sleep } from './helpers/ws-client';

// Team play: three teams the drivers pick themselves, points per race from the server's final results, a running match
// total that survives every race, and a match end that names the winning team — or a tie. The host never earns anything.

const pts = (info: RoomInfo) => Object.fromEntries(info.teams.map((t) => [t.id, t.points])) as Record<TeamId, number>;

// ------------------------------------------------------------------------------------------------ the rules
describe('team data and scoring rules', () => {
  test('the three teams and their member lists are exactly the ones supplied', () => {
    assert.deepEqual(TEAMS.map((t) => t.name), ['The Titans', 'The Vibe Tribe', 'Ctrl + Alt + Defeat']);
    assert.deepEqual(TEAMS.map((t) => t.members.length), [13, 14, 14]);
    const titans = TEAMS[0]!.members;
    assert.deepEqual(titans.slice(0, 3), ['Ramesh Namperumal', 'Kanishkaa', 'Joni']);
    assert.equal(titans.at(-1), 'Sravani Bethala');
    assert.equal(TEAMS[1]!.members[0], 'Sanjai');
    assert.equal(TEAMS[1]!.members.at(-1), 'Kavya');
    assert.ok(TEAMS[1]!.members.includes('Kailashnath Sharma'));
    assert.equal(TEAMS[2]!.members[0], 'Ram');
    assert.ok(TEAMS[2]!.members.includes('Srinath Chagaleti'));
    assert.equal(TEAMS[2]!.members.at(-1), 'Harshavarthan');
    const all = TEAMS.flatMap((t) => t.members.map(nameKey));
    assert.equal(new Set(all).size, all.length, 'nobody is on two lists');
    assert.equal(all.length, 41);
    for (const t of TEAMS) for (const m of t.members) assert.ok(m.length <= NAME_MAX, `${m} fits a player name`);
  });

  test('points per finishing place: 10 · 8 · 6 · 4 · 2, then 1 for every other finisher, 0 for anyone who did not finish', () => {
    assert.deepEqual([...FINISH_POINTS], [10, 8, 6, 4, 2]);
    assert.equal(OTHER_FINISHER_POINTS, 1);
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 20, 50].map((r) => teamPointsFor(r, true)), [10, 8, 6, 4, 2, 1, 1, 1, 1]);
    for (const rank of [1, 2, 5, 6, 30]) assert.equal(teamPointsFor(rank, false), 0, `a DNF in place ${rank} earns nothing`);
    assert.equal(teamPointsFor(0, true), 0);
    assert.equal(teamPointsFor(1.5, true), 0);
  });

  test('ranking: highest first, equal points share a rank (a tie stays a tie), the winner is whoever has the most — or everyone level at the top', () => {
    const r = rankTeams({ titans: 70, vibe: 95, ctrl: 130 });
    assert.deepEqual(r.map((t) => [t.id, t.rank, t.tied]), [['ctrl', 1, false], ['vibe', 2, false], ['titans', 3, false]]);
    assert.deepEqual(winningTeams({ titans: 70, vibe: 95, ctrl: 130 }), ['ctrl']);
    const tie = rankTeams({ titans: 100, vibe: 100, ctrl: 40 });
    assert.deepEqual(tie.map((t) => [t.id, t.rank, t.tied]), [['titans', 1, true], ['vibe', 1, true], ['ctrl', 3, false]]);
    assert.deepEqual(winningTeams({ titans: 100, vibe: 100, ctrl: 40 }).sort(), ['titans', 'vibe']);
    assert.deepEqual(winningTeams(zeroPoints()).sort(), [...TEAM_IDS].sort(), 'nothing scored: all three are level');
    assert.deepEqual(winningTeams({ titans: 5, vibe: 5, ctrl: 5 }).length, 3);
  });

  test('a name on a team list suggests that team (exact full name, any case) — and only suggests', () => {
    assert.equal(rosterTeamFor('srinath chagaleti'), 'ctrl');
    assert.equal(rosterTeamFor('  Ramesh   Patil '), 'titans');
    assert.equal(rosterTeamFor('KAVYA'), 'vibe');
    assert.equal(rosterTeamFor('Ram'), 'ctrl');
    assert.equal(rosterTeamFor('Ramesh'), null, 'a first name alone is not on any list');
    assert.equal(rosterTeamFor(''), null);
    assert.ok(isTeamId('titans') && !isTeamId('red') && !isTeamId(7));
  });
});

// ------------------------------------------------------------------------------------------------ the room
describe('teams in a room', () => {
  let sim: Sim | null = null;
  afterEach(() => {
    sim?.destroy();
    sim = null;
  });

  /** Six drivers on three teams: A1 A2 (Titans), B1 B2 (Vibe), C1 C2 (Ctrl). */
  const six = (cfg = {}) => {
    sim = new Sim(cfg);
    for (const [n, t] of [['A1', 'titans'], ['A2', 'titans'], ['B1', 'vibe'], ['B2', 'vibe'], ['C1', 'ctrl'], ['C2', 'ctrl']] as const) sim.join(n, t);
    return sim;
  };
  /** Run one race to its end; `ms` = milliseconds per character for each driver (fastest finishes first); `stops` drivers type this many characters and stop. */
  const race = (s: Sim, ms: Record<string, number>, stops: Record<string, number> = {}) => {
    assert.equal(s.start(), true);
    s.advanceToGo();
    const typists = Object.entries(ms).map(([n, m]) => new Typist(s, n, { msPerChar: m, ...(stops[n] !== undefined ? { stopAfter: stops[n] } : {}) }));
    const slowest = Math.max(...Object.values(ms));
    s.runUntil((s.text.length * slowest) / 1000 + 70, typists);
    assert.equal(s.phase, 'results');
    return s.room.roomInfo();
  };

  test('nobody is assigned a team: a driver must pick one to join (the host needs none), and a returning player keeps theirs', () => {
    sim = new Sim();
    const none = sim.room.join('Nameless', { send() {}, close() {} });
    assert.ok(!none.ok && none.code === 'bad_team');
    const bogus = sim.room.join('Bogus', { send() {}, close() {} }, undefined, 'purple');
    assert.ok(!bogus.ok && bogus.code === 'bad_team');
    assert.equal(sim.room.players.size, 1, 'only the host is in the room: refused drivers are not added');
    assert.equal(sim.get(Sim.HOST).p.team, null, 'the host has no team');
    const a = sim.join('Asha', 'vibe');
    assert.equal(a.p.team, 'vibe');
    // a phone that reconnects — by token or by name — is the same driver on the same team, with no team sent
    sim.disconnect('Asha');
    sim.reconnect('Asha');
    assert.equal(sim.get('Asha').p.team, 'vibe');
    sim.disconnect('Asha');
    const byName = sim.room.join('asha', { send() {}, close() {} });
    assert.ok(byName.ok && byName.player.team === 'vibe');
  });

  test('every client sees the same teams: the picks of each player, the three teams with 0 points and no rank yet', () => {
    const s = six();
    s.room.broadcastRoom();
    const infos = [...s.entries.values()].map((e) => e.conn.room!);
    for (const info of infos) {
      assert.deepEqual(info.teams.map((t) => [t.id, t.name, t.points]), [['titans', 'The Titans', 0], ['vibe', 'The Vibe Tribe', 0], ['ctrl', 'Ctrl + Alt + Defeat', 0]]);
      assert.deepEqual(info.players.filter((p) => p.team === 'titans').map((p) => p.name), ['A1', 'A2']);
      assert.deepEqual(info.players.filter((p) => p.team === 'vibe').map((p) => p.name), ['B1', 'B2']);
      assert.deepEqual(info.players.filter((p) => p.team === 'ctrl').map((p) => p.name), ['C1', 'C2']);
      assert.equal(info.players.find((p) => p.host)!.team, null);
      assert.equal(info.match.races, 0);
      assert.equal(info.match.ended, false);
      assert.ok(info.teams.every((t) => t.tied && t.rank === 1), 'level before any race');
    }
    assert.deepEqual(infos[0], infos[3], 'identical for everyone');
  });

  test('a join, a leave and a switch each reach every connected player at once', () => {
    const s = six();
    const watcher = s.get('C2');
    const before = watcher.conn.msgs.filter((m) => m.t === 'room').length;
    s.join('D1', 'titans');
    s.room.broadcastRoom(); // what the socket layer does after every join
    assert.ok(watcher.conn.msgs.filter((m) => m.t === 'room').length > before);
    assert.deepEqual(watcher.conn.room!.players.filter((p) => p.team === 'titans').map((p) => p.name), ['A1', 'A2', 'D1']);
    assert.equal(s.room.setTeam(s.get('A2').p, 'ctrl'), true);
    assert.deepEqual(watcher.conn.room!.players.filter((p) => p.team === 'titans').map((p) => p.name), ['A1', 'D1']);
    assert.deepEqual(watcher.conn.room!.players.filter((p) => p.team === 'ctrl').map((p) => p.name), ['A2', 'C1', 'C2']);
    s.room.leave(s.get('D1').p);
    assert.deepEqual(watcher.conn.room!.players.filter((p) => p.team === 'titans').map((p) => p.name), ['A1']);
  });

  test('scoring: 10 / 8 / 6 / 4 / 2 / 1 by finishing place from the server’s final results; each team’s total is its drivers’ sum', () => {
    const s = six();
    s.join('A3', 'titans');
    // finish order: C1, B1, A1, C2, B2, A2, A3
    const info = race(s, { C1: 60, B1: 70, A1: 80, C2: 90, B2: 100, A2: 110, A3: 120 });
    const rows = info.results as ResultRow[];
    assert.deepEqual(rows.map((r) => [r.name, r.rank, r.teamPoints]), [['C1', 1, 10], ['B1', 2, 8], ['A1', 3, 6], ['C2', 4, 4], ['B2', 5, 2], ['A2', 6, 1], ['A3', 7, 1]]);
    assert.deepEqual(rows.map((r) => r.team), ['ctrl', 'vibe', 'titans', 'ctrl', 'vibe', 'titans', 'titans']);
    assert.deepEqual(pts(info), { titans: 6 + 1 + 1, vibe: 8 + 2, ctrl: 10 + 4 });
    assert.deepEqual(info.teams.map((t) => [t.id, t.rank]), [['titans', 3], ['vibe', 2], ['ctrl', 1]]);
    assert.deepEqual(info.match.last, { raceId: 1, gained: { titans: 8, vibe: 10, ctrl: 14 } });
    assert.equal(info.match.races, 1);
    assert.equal(info.match.ended, false);
    for (const e of s.entries.values()) assert.deepEqual(pts(e.conn.room!), pts(info), 'every client gets the same totals');
  });

  test('a driver who does not finish earns 0 — whatever their position in the results — and a finisher after them still gets full points', () => {
    const s = six();
    // C1 wins; A1 types 20 characters and stops (DNF "inactive"); everyone else finishes
    const info = race(s, { C1: 60, B1: 70, B2: 80, C2: 90, A2: 100, A1: 70 }, { A1: 20 });
    const rows = info.results as ResultRow[];
    const a1 = rows.find((r) => r.name === 'A1')!;
    assert.equal(a1.finished, false);
    assert.equal(a1.teamPoints, 0);
    assert.deepEqual(rows.filter((r) => r.finished).map((r) => [r.name, r.teamPoints]), [['C1', 10], ['B1', 8], ['B2', 6], ['C2', 4], ['A2', 2]]);
    assert.deepEqual(pts(info), { titans: 2, vibe: 8 + 6, ctrl: 10 + 4 });
  });

  test('only racers score: the host, a spectator who joined late and a driver who had not picked a team all earn nothing', () => {
    const s = six();
    assert.equal(s.start(), true);
    s.advanceToGo();
    const late = s.join('Late', 'titans'); // joins mid-race: watches
    const typists = ['C1', 'B1', 'A1', 'C2', 'B2', 'A2'].map((n, i) => new Typist(s, n, { msPerChar: 60 + i * 10 }));
    s.runUntil((s.text.length * 130) / 1000 + 70, typists);
    const info = s.room.roomInfo();
    assert.equal(s.phase, 'results');
    const rows = info.results as ResultRow[];
    assert.ok(rows.every((r) => r.name !== Sim.HOST && r.name !== 'Late'));
    assert.equal(rows.length, 6);
    assert.equal(pts(info).titans + pts(info).vibe + pts(info).ctrl, 10 + 8 + 6 + 4 + 2 + 1, 'only the six racers’ points exist');
    assert.equal(late.p.team, 'titans');
    assert.ok(!info.match.contributions!.some((c) => c.name === Sim.HOST || c.name === 'Late'));
  });

  test('points are recorded once per race: nothing re-adds them — broadcasts, reconnects, back to lobby, the next race starting, or a repeated call', () => {
    const s = six();
    const info = race(s, { C1: 60, B1: 70, A1: 80, C2: 90, B2: 100, A2: 110 });
    const after = pts(info);
    for (let i = 0; i < 5; i++) s.room.broadcastRoom();
    s.disconnect('A1');
    s.reconnect('A1');
    assert.deepEqual(pts(s.room.roomInfo()), after);
    // calling the scoring routine again with the same final results is a no-op
    (s.room as unknown as { recordTeamPoints(rows: ResultRow[]): void }).recordTeamPoints(info.results as ResultRow[]);
    assert.deepEqual(pts(s.room.roomInfo()), after, 'a second call for the same race changes nothing');
    assert.equal(s.room.roomInfo().match.races, 1);
    assert.equal(s.room.backToLobby(s.room.hostId), true);
    assert.deepEqual(pts(s.room.roomInfo()), after, 'back to the lobby keeps the points');
    assert.equal(s.room.roomInfo().match.races, 1);
  });

  test('team points persist across races and are never reset between them; contributions add up per driver', () => {
    const s = six();
    const one = race(s, { C1: 60, B1: 70, A1: 80, C2: 90, B2: 100, A2: 110 });
    assert.deepEqual(pts(one), { titans: 6 + 1, vibe: 8 + 2, ctrl: 10 + 4 });
    // race again straight from the results page, in a different order: A2 wins
    const two = race(s, { A2: 60, A1: 70, C2: 80, B2: 90, B1: 100, C1: 110 });
    assert.deepEqual(pts(two), { titans: 7 + 10 + 8, vibe: 10 + 4 + 2, ctrl: 14 + 6 + 1 });
    assert.deepEqual(two.match.last, { raceId: 2, gained: { titans: 18, vibe: 6, ctrl: 7 } });
    assert.equal(two.match.races, 2);
    // …and again after a visit to the lobby
    assert.equal(s.room.backToLobby(s.room.hostId), true);
    assert.deepEqual(pts(s.room.roomInfo()), pts(two));
    const three = race(s, { B1: 60, B2: 70, A1: 80, A2: 90, C1: 100, C2: 110 });
    assert.deepEqual(pts(three), { titans: 25 + 6 + 4, vibe: 16 + 10 + 8, ctrl: 21 + 2 + 1 });
    assert.equal(three.match.races, 3);
    const c = three.match.contributions!;
    assert.equal(c.reduce((sum, x) => sum + x.points, 0), pts(three).titans + pts(three).vibe + pts(three).ctrl, 'contributions add up to the team totals');
    assert.deepEqual(c.find((x) => x.name === 'A2'), { team: 'titans', id: s.get('A2').p.id, name: 'A2', points: 1 + 10 + 4, races: 3 });
    assert.deepEqual(c.map((x) => x.points), [...c.map((x) => x.points)].sort((a, b) => b - a), 'best contributor first');
  });

  test('switching teams: allowed between races, refused mid-race / for the host / after the match, and points already earned stay with the old team', () => {
    const s = six();
    assert.equal(s.room.setTeam(s.get('B2').p, 'bogus'), false, 'not a team');
    assert.equal(s.room.setTeam(s.get(Sim.HOST).p, 'titans'), false, 'the host has no team');
    assert.equal(s.start(), true);
    assert.equal(s.room.setTeam(s.get('A1').p, 'vibe'), false, 'not during the countdown');
    s.advanceToGo();
    assert.equal(s.room.setTeam(s.get('A1').p, 'vibe'), false, 'not mid-race');
    const typists = ['C1', 'B1', 'A1', 'C2', 'B2', 'A2'].map((n, i) => new Typist(s, n, { msPerChar: 60 + i * 10 }));
    s.runUntil((s.text.length * 130) / 1000 + 70, typists);
    const one = s.room.roomInfo();
    assert.deepEqual(pts(one), { titans: 7, vibe: 10, ctrl: 14 });
    // between races A1 (who scored 6 for the Titans) moves to the Vibe Tribe
    assert.equal(s.room.setTeam(s.get('A1').p, 'vibe'), true);
    assert.deepEqual(pts(s.room.roomInfo()), pts(one), 'the 6 points stay with The Titans');
    const two = race(s, { A1: 60, B1: 70, C1: 80, A2: 90, B2: 100, C2: 110 });
    // A1 wins (10) and B1 is 2nd (8), B2 5th (2) — all Vibe Tribe now; C1 3rd (6) and C2 6th (1) are Ctrl; A2 4th (4) is the only Titan
    assert.deepEqual(two.match.last!.gained, { titans: 4, vibe: 10 + 8 + 2, ctrl: 6 + 1 }, 'A1 now scores for the Vibe Tribe');
    const a1 = two.match.contributions!.filter((c) => c.name === 'A1');
    assert.deepEqual(a1.map((c) => [c.team, c.points]).sort(), [['titans', 6], ['vibe', 10]], 'A1’s contributions are kept per team');
  });

  test('a driver who leaves or drops keeps what they earned; one who leaves mid-race is a DNF that scores 0', () => {
    const s = six();
    assert.equal(s.start(), true);
    s.advanceToGo();
    const typists = [new Typist(s, 'C1', { msPerChar: 60 }), new Typist(s, 'B1', { msPerChar: 70 }), new Typist(s, 'A1', { msPerChar: 80 }), new Typist(s, 'C2', { msPerChar: 90 }), new Typist(s, 'B2', { msPerChar: 100 }), new Typist(s, 'A2', { msPerChar: 110 })];
    s.runUntil(10, typists);
    s.room.leave(s.get('A2').p); // leaves mid-race
    s.runUntil((s.text.length * 100) / 1000 + 70, typists);
    assert.equal(s.phase, 'results');
    const info = s.room.roomInfo();
    const rows = info.results as ResultRow[];
    assert.deepEqual(rows.find((r) => r.name === 'A2'), { ...rows.find((r) => r.name === 'A2')!, finished: false, dnfReason: 'left', teamPoints: 0 });
    assert.deepEqual(pts(info), { titans: 6, vibe: 8 + 2, ctrl: 10 + 4 }, 'five finishers scored; A2 added nothing');
    // C1 disconnects after the results: their points are still there, and in the contributions
    s.disconnect('C1');
    assert.equal(pts(s.room.roomInfo()).ctrl, 14);
    assert.equal(s.room.roomInfo().match.contributions!.find((c) => c.name === 'C1')!.points, 10);
    // A2 has left the room entirely, but their (zero) entry and name remain in the match
    assert.ok(![...s.room.players.values()].some((p) => p.name === 'A2'));
    assert.ok(info.match.contributions!.some((c) => c.name === 'A2' && c.points === 0 && c.team === 'titans'));
  });

  test('a driver with no team does not race and scores nothing until they pick one (nobody picks for them)', () => {
    sim = new Sim();
    for (const [n, t] of [['Asha', 'vibe'], ['Ben', 'ctrl']] as const) sim.join(n, t);
    // a driver whose team was never set (only possible for a player record made outside the join form)
    const asha = sim.get('Asha');
    asha.p.team = null;
    assert.equal(sim.start(), true);
    assert.deepEqual(sim.room.roomInfo().players.filter((p) => p.racing).map((p) => p.name), ['Ben'], 'only drivers on a team race');
    sim.advanceToGo();
    const ben = new Typist(sim, 'Ben', { msPerChar: 100 });
    sim.runUntil((sim.text.length * 100) / 1000 + 3, [ben]);
    assert.equal(sim.phase, 'results');
    assert.deepEqual(pts(sim.room.roomInfo()), { titans: 0, vibe: 0, ctrl: 10 });
    // they choose a team themselves, then race next round
    assert.equal(sim.room.setTeam(asha.p, 'titans'), true);
    assert.equal(sim.start(), true);
    assert.deepEqual(sim.room.roomInfo().players.filter((p) => p.racing).map((p) => p.name).sort(), ['Asha', 'Ben']);
  });

  test('ending the match: only the host, only between races, only after a race has been scored; the leading team wins', () => {
    const s = six();
    assert.equal(s.room.endMatch(s.room.hostId), false, 'nothing scored yet');
    assert.equal(s.start(), true);
    assert.equal(s.room.endMatch(s.room.hostId), false, 'not during a race');
    s.advanceToGo();
    const typists = ['C1', 'B1', 'A1', 'C2', 'B2', 'A2'].map((n, i) => new Typist(s, n, { msPerChar: 60 + i * 10 }));
    s.runUntil((s.text.length * 130) / 1000 + 70, typists);
    assert.equal(s.room.endMatch(s.get('A1').p.id), false, 'a driver cannot end the match');
    assert.equal(s.room.roomInfo().match.ended, false);
    assert.equal(s.room.endMatch(s.room.hostId), true);
    const info = s.room.roomInfo();
    assert.equal(info.match.ended, true);
    assert.deepEqual(info.match.winners, ['ctrl'], 'Ctrl + Alt + Defeat have the most points');
    assert.deepEqual(pts(info), { titans: 7, vibe: 10, ctrl: 14 });
    assert.ok(info.match.contributions!.length === 6);
    assert.equal(s.room.endMatch(s.room.hostId), false, 'already ended');
    for (const e of s.entries.values()) assert.deepEqual(e.conn.room!.match.winners, ['ctrl'], 'every client sees the winner');
    // once the match is over nothing can add to it
    assert.equal(s.start(), false);
    assert.equal(s.room.setTeam(s.get('A1').p, 'vibe'), false);
  });

  test('a tie is a tie: when teams finish level at the top there is no winner picked — every leader is listed', () => {
    sim = new Sim();
    sim.join('T1', 'titans');
    sim.join('V1', 'vibe');
    sim.join('K1', 'ctrl');
    // one race: T1 first (10), V1 second (8), K1 third (6) …
    race(sim, { T1: 60, V1: 70, K1: 80 });
    // … a second race flips it so two teams are level at the top: V1 first (10), T1 second (8), K1 third (6) → T 18, V 18, K 12
    const info = race(sim, { V1: 60, T1: 70, K1: 80 });
    assert.deepEqual(pts(info), { titans: 18, vibe: 18, ctrl: 12 });
    assert.deepEqual(info.teams.map((t) => [t.id, t.rank, t.tied]), [['titans', 1, true], ['vibe', 1, true], ['ctrl', 3, false]]);
    assert.equal(sim.room.endMatch(sim.room.hostId), true);
    assert.deepEqual(sim.room.roomInfo().match.winners!.slice().sort(), ['titans', 'vibe']);
  });

  test('a match in which nobody finishes a race ends level at 0–0–0: a three-way tie, not a random winner', () => {
    const s = six();
    assert.equal(s.start(), true);
    s.advanceToGo();
    s.advance(s.room.race!.goAt - s.now() + 5000);
    assert.equal(s.room.endByHost(s.room.hostId), true, 'the host ends the race before anyone typed a thing');
    const info = s.room.roomInfo();
    assert.deepEqual(pts(info), { titans: 0, vibe: 0, ctrl: 0 });
    assert.ok((info.results as ResultRow[]).every((r) => !r.finished && r.teamPoints === 0));
    assert.equal(s.room.endMatch(s.room.hostId), true);
    assert.equal(s.room.roomInfo().match.winners!.length, 3);
  });

  test('a new match: only the host, only after the old one ended; points back to zero, teams as picked, races start again', () => {
    const s = six();
    race(s, { C1: 60, B1: 70, A1: 80, C2: 90, B2: 100, A2: 110 });
    assert.equal(s.room.newMatch(s.room.hostId), false, 'the match is still on');
    assert.equal(s.room.endMatch(s.room.hostId), true);
    assert.equal(s.room.newMatch(s.get('C1').p.id), false, 'a driver cannot reset it');
    assert.equal(s.room.newMatch(s.room.hostId), true);
    const info = s.room.roomInfo();
    assert.equal(info.phase, 'lobby');
    assert.deepEqual(pts(info), { titans: 0, vibe: 0, ctrl: 0 });
    assert.equal(info.match.races, 0);
    assert.equal(info.match.ended, false);
    assert.equal(info.match.last, null);
    assert.equal(info.match.contributions, undefined);
    assert.deepEqual(info.players.filter((p) => p.team === 'titans').map((p) => p.name), ['A1', 'A2'], 'everyone keeps their team');
    // and it all works again from zero
    const next = race(s, { A1: 60, A2: 70, B1: 80, B2: 90, C1: 100, C2: 110 });
    assert.deepEqual(pts(next), { titans: 10 + 8, vibe: 6 + 4, ctrl: 2 + 1 });
    assert.equal(next.match.races, 1);
  });

  test('the payload stays small: with 50 drivers and a scored race the room snapshot is a few kilobytes', () => {
    sim = new Sim({}, 8, true);
    for (let i = 0; i < 50; i++) sim.join(`Driver${String(i).padStart(2, '0')}`);
    assert.ok(JSON.stringify(sim.room.roomInfo()).length < 14_000, `${JSON.stringify(sim.room.roomInfo()).length} bytes in the lobby`);
    const typists = [] as Typist[];
    assert.equal(sim.start(), true);
    sim.advanceToGo();
    for (let i = 0; i < 50; i++) typists.push(new Typist(sim, `Driver${String(i).padStart(2, '0')}`, { msPerChar: 60 + i * 2 }));
    sim.runUntil((sim.text.length * 160) / 1000 + 20, typists);
    const info = sim.room.roomInfo();
    assert.equal(info.match.contributions!.length, 50);
    assert.ok(JSON.stringify(info).length < 30_000, `${JSON.stringify(info).length} bytes with results and contributions`);
  });
});

// ------------------------------------------------------------------------------------------------ over real sockets
describe('teams over real WebSockets', () => {
  test('joining needs a team; every socket sees every join, switch and leave live, and the same standings', async () => {
    const app = createApp({ config: FAST });
    const port = await app.listen(0, '127.0.0.1');
    const sockets: Client[] = [];
    try {
      const { host, drivers, all, code } = await newRoom(port, [
        { name: 'Anita', team: 'vibe' },
        { name: 'Joni', team: 'titans' },
      ]);
      sockets.push(...all);

      // no team → refused with a clear message, and the socket can still try again
      const nameless = await Client.connect(port);
      sockets.push(nameless);
      nameless.send({ t: 'join', room: code, name: 'Nobody' });
      const err = await nameless.waitFor((m) => m.t === 'error');
      assert.equal(err.t === 'error' && err.code, 'bad_team');
      nameless.send({ t: 'join', room: code, name: 'Nobody', team: 'not-a-team' });
      assert.equal(((await nameless.waitFor((m) => m.t === 'error' && m.msg.length > 0)) as { code: string }).code, 'bad_team');
      nameless.send({ t: 'join', room: code, name: 'Nobody', team: 'ctrl' });
      await nameless.waitFor((m) => m.t === 'joined');
      await sleep(80);
      for (const c of [host, ...drivers, nameless]) {
        assert.deepEqual(c.room.players.filter((p) => !p.host).map((p) => [p.name, p.team]), [['Anita', 'vibe'], ['Joni', 'titans'], ['Nobody', 'ctrl']], 'the same roster on every socket');
      }

      // a switch is pushed to everybody
      nameless.send({ t: 'team', team: 'titans' });
      await host.waitFor((m) => m.t === 'room' && m.room.players.some((p) => p.name === 'Nobody' && p.team === 'titans'));
      await sleep(80);
      assert.deepEqual(drivers[0]!.room.players.filter((p) => p.team === 'titans').map((p) => p.name), ['Joni', 'Nobody']);
      // the host cannot take a team, and garbage is ignored
      host.send({ t: 'team', team: 'vibe' });
      nameless.send({ t: 'team', team: 'purple' });
      await sleep(100);
      assert.equal(host.room.players.find((p) => p.host)!.team, null);
      assert.equal(nameless.room.players.find((p) => p.name === 'Nobody')!.team, 'titans');

      // a leave is pushed to everybody
      nameless.send({ t: 'leave' });
      await host.waitFor((m) => m.t === 'room' && !m.room.players.some((p) => p.name === 'Nobody'));
      await sleep(80);
      assert.deepEqual(drivers[1]!.room.players.filter((p) => !p.host).map((p) => p.name), ['Anita', 'Joni']);
    } finally {
      for (const c of sockets) c.close();
      await app.close();
    }
  });

  test('a whole match over sockets: race, race again, end the match; everyone sees the same totals, the winner and the contributions; a new match starts from zero', async () => {
    const app = createApp({ config: { ...FAST, raceMaxMs: 20_000, idleDnfMs: 4000 } });
    const port = await app.listen(0, '127.0.0.1');
    const sockets: Client[] = [];
    try {
      const { host, drivers, all } = await newRoom(port, [
        { name: 'Titan', team: 'titans' },
        { name: 'Vibey', team: 'vibe' },
        { name: 'Ctrl', team: 'ctrl' },
      ]);
      sockets.push(...all);
      const [titan, vibey, ctrl] = drivers as [Client, Client, Client];
      const raceTo = async (order: [Client, Client, Client]) => {
        host.send({ t: 'start' });
        await Promise.all(all.map((c) => c.waitPhase('racing')));
        const text = host.room.race!.text;
        for (let i = 0; i < order.length; i++) {
          await sleep(60);
          await order[i]!.type(text);
        }
        await Promise.all(all.map((c) => c.waitPhase('results', 8000)));
      };

      await raceTo([titan, ctrl, vibey]);
      assert.deepEqual(host.room.results!.map((r) => [r.name, r.rank, r.team, r.teamPoints]), [['Titan', 1, 'titans', 10], ['Ctrl', 2, 'ctrl', 8], ['Vibey', 3, 'vibe', 6]]);
      assert.deepEqual(pts(host.room), { titans: 10, vibe: 6, ctrl: 8 });
      await raceTo([ctrl, titan, vibey]); // "race again": the totals carry over
      assert.deepEqual(pts(host.room), { titans: 18, vibe: 12, ctrl: 18 });
      for (const c of all) assert.deepEqual(pts(c.room), pts(host.room), `${c.me} sees the same totals`);
      assert.equal(host.room.match.races, 2);
      assert.deepEqual(host.room.teams.map((t) => [t.id, t.rank, t.tied]), [['titans', 1, true], ['vibe', 3, false], ['ctrl', 1, true]]);

      // a driver cannot end the match; the host can
      titan.send({ t: 'match_end' });
      await sleep(100);
      assert.equal(host.room.match.ended, false);
      host.send({ t: 'match_end' });
      await Promise.all(all.map((c) => c.waitFor((m) => m.t === 'room' && m.room.match.ended)));
      assert.deepEqual(host.room.match.winners!.slice().sort(), ['ctrl', 'titans'], 'the top two teams are level: a tie');
      const contributions = host.room.match.contributions!;
      assert.deepEqual(contributions.map((c) => [c.name, c.points, c.races]).sort(), [['Ctrl', 18, 2], ['Titan', 18, 2], ['Vibey', 12, 2]]);
      for (const c of all) assert.deepEqual(c.room.match, host.room.match, 'every client sees the same result');

      // nothing can start or be switched now…
      host.send({ t: 'start' });
      vibey.send({ t: 'team', team: 'ctrl' });
      await sleep(120);
      assert.equal(host.room.race!.id, 2);
      assert.equal(host.room.players.find((p) => p.name === 'Vibey')!.team, 'vibe');

      // …until the host starts a new match
      host.send({ t: 'match_new' });
      await Promise.all(all.map((c) => c.waitFor((m) => m.t === 'room' && !m.room.match.ended)));
      assert.equal(host.room.phase, 'lobby');
      assert.deepEqual(pts(host.room), { titans: 0, vibe: 0, ctrl: 0 });
      assert.equal(host.room.match.races, 0);
    } finally {
      for (const c of sockets) c.close();
      await app.close();
    }
  });
});
