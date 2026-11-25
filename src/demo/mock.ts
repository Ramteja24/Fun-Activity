import { calcScore, calcWpm, trophiesFor } from '../../shared/game';
import type { PlayerInfo, RacerTuple, ResultRow, RoomInfo, TeamStanding } from '../../shared/protocol';
import { VEHICLE_COUNT } from '../../shared/protocol';
import { rankTeams, TEAM_IDS, TEAMS, teamPointsFor, zeroPoints, type TeamId } from '../../shared/teams';

// The 40-player demo's make-believe room: players, a race and its results, all made up here from nothing but numbers. Nothing in this
// file talks to the server, reads a real room or touches a player record — it only builds the same shapes the server sends, so the
// real lobby, race and results screens can be shown with a full team in them (see src/demo/session.ts).

export const DEMO_HOST_ID = 'demo-host';
export const DEMO_HOST_NAME = 'Srinath Chagaleti';
export const DEMO_CODE = 'DEMO';
export const DEMO_DRIVERS = 40;
export const DEMO_RACE_ID = 1;
/** "Driver view" shows the screen of the driver who finishes this far down (1-based): in the middle of the field, so places change both ways. */
export const DEMO_VIEWER_PLACE = 20;

/** A made-up passage in the same length range as the real ones (300–350 characters). */
export const DEMO_TEXT =
  'The morning shift starts quietly. Coffee machines hum, keyboards warm up, and somewhere a build finishes without a single warning. By ten the whole floor is moving: tickets close, meetings begin on time, and a small team ships the feature everyone asked for. Nothing waits, nobody hurries, and that is the rhythm of a good day at work.';

export interface DemoDriver {
  id: string;
  name: string;
  team: TeamId;
  /** 0..VEHICLE_COUNT-1: every driver has a different car. */
  vehicle: number;
  /** How fast they type, in words per minute. */
  wpm: number;
  accuracy: number;
  /** A phase for the small ups and downs of their pace. */
  phase: number;
  /** When they cross the line, in ms from GO. */
  finishMs: number;
}

/** A small, repeatable random-number generator: the same demo every time. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How many drivers go to each team (in the order of `TEAMS`): as even as it gets, the odd ones going to The Vibe Tribe first. 40 → 13, 14, 13. */
export function teamSplit(count: number): number[] {
  const base = Math.floor(count / TEAMS.length);
  const extra = count - base * TEAMS.length;
  const sizes = TEAMS.map(() => base);
  // bay 2 first, then bay 1, then bay 3
  for (const bay of [1, 0, 2].slice(0, extra)) sizes[bay]! += 1;
  return sizes;
}

/** Where the passage ends up for a given pace: characters typed after `raceMs`, a steady pace with a small, smooth wobble (never going backwards). */
export function charsAt(d: Pick<DemoDriver, 'wpm' | 'phase'>, raceMs: number): number {
  const t = Math.max(0, raceMs) / 1000;
  const wobble = 4 * (Math.sin(t * 0.7 + d.phase) - Math.sin(d.phase));
  return Math.max(0, ((d.wpm * 5) / 60) * t + wobble);
}

function finishTime(d: Pick<DemoDriver, 'wpm' | 'phase'>, len: number): number {
  let ms = 0;
  while (charsAt(d, ms) < len && ms < 600_000) ms += 25;
  return Math.max(1, ms);
}

/**
 * The drivers of a demo room, with the speed each of them types at. The names are taken from the three teams' reference lists (so
 * the lobby shows long, real-looking names and nobody is "waiting to join"), minus the host, who spectates and never races. Each
 * driver gets their own car. Pure: no randomness beyond a fixed seed.
 */
export function demoDrivers(count = DEMO_DRIVERS, len = DEMO_TEXT.length): DemoDriver[] {
  const rnd = mulberry32(40);
  const sizes = teamSplit(count);
  const out: DemoDriver[] = [];
  TEAMS.forEach((def, bay) => {
    const pool = def.members.filter((m) => m !== DEMO_HOST_NAME);
    for (let k = 0; k < sizes[bay]!; k++) {
      const i = out.length;
      const wpm = Math.round((46 + rnd() * 58) * 10) / 10; // 46 – 104 WPM
      const d: DemoDriver = {
        id: `demo-d${String(i + 1).padStart(2, '0')}`,
        name: pool[k] ?? `Driver ${i + 1}`,
        team: def.id,
        vehicle: i % VEHICLE_COUNT,
        wpm,
        accuracy: Math.round((92.5 + rnd() * 7) * 10) / 10,
        phase: rnd() * Math.PI * 2,
        finishMs: 0,
      };
      d.finishMs = finishTime(d, len);
      out.push(d);
    }
  });
  return out;
}

/** The driver whose screen "Driver view" shows. */
export const demoViewer = (drivers: readonly DemoDriver[]): DemoDriver | null =>
  [...drivers].sort((a, b) => a.finishMs - b.finishMs || a.id.localeCompare(b.id))[Math.min(DEMO_VIEWER_PLACE, drivers.length) - 1] ?? null;

/** The order the drivers walk into the lobby: mixed across the teams, the same every time. */
export function arrivalOrder(drivers: readonly DemoDriver[]): DemoDriver[] {
  const rnd = mulberry32(7);
  const order = [...drivers];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

const hostPlayer = (): PlayerInfo => ({ id: DEMO_HOST_ID, name: DEMO_HOST_NAME, vehicle: 0, connected: true, host: true, trophies: 0, racing: false, team: null });

const driverPlayer = (d: DemoDriver, racing: boolean, trophies = 0): PlayerInfo => ({
  id: d.id,
  name: d.name,
  vehicle: d.vehicle,
  connected: true,
  host: false,
  trophies,
  racing,
  team: d.team,
});

export interface DemoRoomOptions {
  phase: RoomInfo['phase'];
  /** Who is in the room (the lobby fills up one by one). */
  present: readonly DemoDriver[];
  difficulty?: RoomInfo['difficulty'];
  goAt?: number;
  results?: ResultRow[];
}

/** The team standings for a set of final rows (what the server's `room.teams` and `match.last.gained` hold after a race). */
export function teamTotals(rows: readonly ResultRow[]): { standings: TeamStanding[]; gained: Record<TeamId, number> } {
  const gained = zeroPoints();
  for (const r of rows) if (r.team) gained[r.team] += r.teamPoints;
  const ranked = rankTeams(gained);
  const standings: TeamStanding[] = TEAMS.map((def) => {
    const r = ranked.find((x) => x.id === def.id)!;
    return { id: def.id, name: def.name, points: r.points, rank: r.rank, tied: r.tied };
  });
  return { standings, gained };
}

/** The room as the server would send it, for the lobby, the race or the results of the demo. */
export function demoRoom(o: DemoRoomOptions): RoomInfo {
  const racing = o.phase === 'countdown' || o.phase === 'racing' || o.phase === 'results';
  const rows = o.results ?? [];
  const trophies = new Map(rows.map((r) => [r.id, r.trophies]));
  const totals = rows.length ? teamTotals(rows) : null;
  // before any race has been scored the three teams are level on nothing
  const level: TeamStanding[] = TEAMS.map((t) => ({ id: t.id, name: t.name, points: 0, rank: 1, tied: true }));
  return {
    code: DEMO_CODE,
    phase: o.phase,
    difficulty: o.difficulty ?? 'medium',
    capacity: 50,
    hostId: DEMO_HOST_ID,
    players: [hostPlayer(), ...o.present.map((d) => driverPlayer(d, racing, trophies.get(d.id) ?? 0))],
    race: racing ? { id: DEMO_RACE_ID, text: DEMO_TEXT, goAt: o.goAt ?? 0, difficulty: o.difficulty ?? 'medium' } : null,
    teams: totals ? totals.standings : level,
    match: { races: totals ? 1 : 0, ended: false, last: totals ? { raceId: DEMO_RACE_ID, gained: totals.gained } : null },
    ...(o.phase === 'results' ? { results: rows } : {}),
    activity: 'typedrive',
    activities: [],
    overall: [],
    pose: null,
    cards: null,
    trivia: null,
  };
}

/** The server's live `state` for a moment of the race: everyone's place in the passage, pace and finish time, leader first. */
export function demoRacers(drivers: readonly DemoDriver[], raceMs: number, len = DEMO_TEXT.length): RacerTuple[] {
  const list = drivers.map((d, i) => {
    const done = raceMs >= d.finishMs;
    const pos = done ? len : Math.min(len - 1, Math.floor(charsAt(d, raceMs)));
    const pace = done ? calcWpm(len, d.finishMs) : d.wpm * (1 + 0.07 * Math.sin(raceMs / 900 + d.phase));
    return { d, i, pos, fin: done ? d.finishMs : 0, wpm: Math.round(pace) };
  });
  list.sort((a, b) => {
    if (a.fin > 0 && b.fin > 0) return a.fin - b.fin || a.i - b.i;
    if (a.fin > 0) return -1;
    if (b.fin > 0) return 1;
    return b.pos - a.pos || a.i - b.i;
  });
  return list.map((r): RacerTuple => [r.d.id, r.pos, r.wpm, r.fin]);
}

/** When the last driver crosses the line. */
export const lastFinishMs = (drivers: readonly DemoDriver[]): number => Math.max(0, ...drivers.map((d) => d.finishMs));

/** The final results as the server scores them: places by finish time, then each driver's WPM, accuracy, score, trophies and team points. */
export function demoResults(drivers: readonly DemoDriver[], len = DEMO_TEXT.length): ResultRow[] {
  const order = [...drivers].sort((a, b) => a.finishMs - b.finishMs || a.id.localeCompare(b.id));
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return order.map((d, i): ResultRow => {
    const rank = i + 1;
    const wpm = calcWpm(len, d.finishMs);
    return {
      id: d.id,
      name: d.name,
      rank,
      finished: true,
      progress: 1,
      wpm: round1(wpm),
      accuracy: round1(d.accuracy),
      timeMs: d.finishMs,
      score: calcScore(wpm, d.accuracy, 1),
      trophies: trophiesFor(rank, true),
      team: d.team,
      teamPoints: teamPointsFor(rank, true),
    };
  });
}

/** The team ids in play order, re-exported so the demo's tests do not need two imports. */
export const DEMO_TEAMS = TEAM_IDS;
