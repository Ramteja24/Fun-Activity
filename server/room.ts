import { randomBytes } from 'node:crypto';
import { calcAccuracy, calcScore, calcWpm, liveWpm, sanitizeName, trophiesFor } from '../shared/game';
import {
  VEHICLE_COUNT,
  type Contribution,
  type DnfReason,
  type ErrorCode,
  type MatchInfo,
  type Phase,
  type RacerTuple,
  type ResultRow,
  type RoomInfo,
  type ServerMsg,
  type TeamStanding,
} from '../shared/protocol';
import { isTeamId, rankTeams, TEAMS, teamPointsFor, winningTeams, zeroPoints, type TeamId } from '../shared/teams';
import { DEFAULT_DIFFICULTY, isDifficulty, type Difficulty } from '../shared/difficulty';
import { isScreen, overallStandings, type ActivityScore, type ActivityStatus, type Screen } from '../shared/activities';
import type { RoomConfig } from './config';
import { newPoseMemory, PoseSession } from './games/pose';
import type { Eligible } from './games/shared';
import { CardsSession } from './games/cards';
import { TriviaSession } from './games/trivia';
import { passagesFor } from './passages';

/** A transport-agnostic connection (a WebSocket in production, a stub in unit tests). */
export interface Conn {
  send(msg: ServerMsg): void;
  /** An already-encoded message (a broadcast is encoded once, not once per player). Optional: test fakes only implement `send`. */
  sendRaw?(json: string): void;
  close(): void;
}

/** Send a broadcast that has been encoded once; a connection without `sendRaw` gets the decoded message. */
function sendEncoded(conn: Conn, json: string): void {
  if (conn.sendRaw) conn.sendRaw(json);
  else conn.send(JSON.parse(json) as ServerMsg);
}

export interface Player {
  id: string;
  token: string;
  name: string;
  vehicle: number;
  conn: Conn | null;
  connected: boolean;
  disconnectedAt: number | null;
  joinedAt: number;
  trophies: number;
  /** Explicitly left mid-race: kept for the results, then removed. */
  left: boolean;
  /** The team this driver picked. null: the host (who only watches) or a driver who has not picked yet (and so does not race). */
  team: TeamId | null;
  // ---- per-race state (all authoritative) ----
  racing: boolean;
  pos: number;
  correct: number;
  wrong: number;
  keyTimes: number[];
  keyWindow: number[];
  /** Server time of the last keystroke accepted from this racer (correct or not). 0 = none yet. */
  lastKeyAt: number;
  lastSeq: number;
  /** Finish time in ms from GO, 0 = not finished. */
  finishMs: number;
  rank: number;
  row: ResultRow | null;
}

interface RaceRuntime {
  id: number;
  text: string;
  goAt: number;
  difficulty: Difficulty;
  finishOrder: string[];
  firstFinishAt: number | null;
  /** Team points for this race have been recorded (they are recorded exactly once, from the final results). */
  scored: boolean;
}

/** One racer's result in one race, as recorded for team scoring. The match's team totals are always the sum of these. */
interface LedgerEntry {
  raceId: number;
  playerId: string;
  name: string;
  team: TeamId;
  points: number;
}

export type JoinResult =
  | { ok: true; player: Player; resumed: boolean }
  | { ok: false; code: ErrorCode; msg: string };

const round1 = (n: number) => Math.round(n * 10) / 10;

export class Room {
  readonly players = new Map<string, Player>();
  hostId = '';
  phase: Phase = 'lobby';
  difficulty: Difficulty = DEFAULT_DIFFICULTY;
  race: RaceRuntime | null = null;
  lastActivity: number;

  private raceCounter = 0;
  private readonly lastPassageByDifficulty: Record<Difficulty, number> = {
    easy: -1,
    medium: -1,
    hard: -1,
  };
  private results: ResultRow[] | null = null;
  // ---- the team match: lives across races, reset only by a new match ----
  private ledger: LedgerEntry[] = [];
  private matchRaces = 0;
  private matchEnded = false;
  private lastScored: { raceId: number; gained: Record<TeamId, number> } | null = null;
  // ---- the Weekly Fun Activity: what the room is showing, and the two other games ----
  /** The dashboard (`hub`) or one of the activities. Only the host changes it, and every screen follows. */
  activity: Screen = 'hub';
  private pose: PoseSession | null = null;
  private readonly poseMemory = newPoseMemory();
  private poseSessions = 0;
  private cards: CardsSession | null = null;
  private cardsSessions = 0;
  private trivia: TriviaSession | null = null;
  private readonly triviaUsed = new Set<string>();
  private triviaSessions = 0;
  private answersTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private goTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly code: string,
    private readonly cfg: RoomConfig,
    private readonly clock: () => number = Date.now,
    private readonly rand: () => number = Math.random,
  ) {
    this.lastActivity = clock();
  }

  // ------------------------------------------------------------------ membership

  /**
   * `asHost`: the admin (checked by the app before calling) creating the room or coming back to it. Only the admin is ever
   * the host; everyone else joins as a driver, and a room whose admin is away waits for them.
   */
  join(rawName: unknown, conn: Conn, token?: string, rawTeam?: unknown, asHost = false): JoinResult {
    this.touch();
    if (token) {
      for (const p of this.players.values()) {
        if (p.token === token && !p.left) return this.attach(p, conn);
      }
    }
    const name = sanitizeName(rawName);
    if (!name) return { ok: false, code: 'bad_name', msg: 'Enter a name (1–16 characters).' };

    const lower = name.toLowerCase();
    for (const p of this.players.values()) {
      if (p.left || p.name.toLowerCase() !== lower) continue;
      const isHostSeat = p.id === this.hostId;
      // The host's seat is the admin's alone: typing the admin's name never takes it over.
      if (isHostSeat !== asHost) {
        if (asHost && !p.connected) continue;
        return { ok: false, code: 'name_taken', msg: `"${p.name}" is already in this room — pick another name.` };
      }
      // Same name as an offline player = that person coming back on a new tab/device.
      if (!p.connected) return this.attach(p, conn);
      return { ok: false, code: 'name_taken', msg: `"${p.name}" is already in this room — pick another name.` };
    }
    if (asHost) {
      // The admin on another tab or device: a live host is never replaced; an offline one is (the admin is back).
      const current = this.players.get(this.hostId);
      if (current?.connected) return { ok: false, code: 'host_present', msg: 'The admin is already hosting this room in another tab or on another device.' };
      if (current) this.players.delete(current.id);
    }
    // The host (the admin) is a spectator: they take no seat among the drivers, get no car, and never race. Everyone else
    // is a driver and counts toward the capacity.
    const isHost = asHost;
    // A driver always picks their team themself — nobody is ever assigned one. (The host watches and has no team.)
    const team: TeamId | null = isHost ? null : isTeamId(rawTeam) ? rawTeam : null;
    if (!isHost && team === null) return { ok: false, code: 'bad_team', msg: 'Pick your team to join the race.' };
    if (!isHost && this.activeCount() >= this.cfg.maxPlayers && !this.evictLongestOffline()) {
      return {
        ok: false,
        code: 'room_full',
        msg: `This room is full (${this.cfg.maxPlayers} players max). Ask the host to start a new room.`,
      };
    }

    const player: Player = {
      id: randomBytes(4).toString('hex'),
      token: randomBytes(16).toString('base64url'),
      name,
      vehicle: isHost ? 0 : this.pickVehicle(),
      conn,
      connected: true,
      disconnectedAt: null,
      joinedAt: this.clock(),
      trophies: 0,
      left: false,
      team,
      racing: false,
      pos: 0,
      correct: 0,
      wrong: 0,
      keyTimes: [],
      keyWindow: [],
      lastKeyAt: 0,
      lastSeq: 0,
      finishMs: 0,
      rank: 0,
      row: null,
    };
    this.players.set(player.id, player);
    if (isHost) this.hostId = player.id;
    return { ok: true, player, resumed: false };
  }

  private attach(p: Player, conn: Conn): JoinResult {
    if (p.conn && p.conn !== conn) p.conn.close(); // a newer tab/device replaces the old one
    p.conn = conn;
    p.connected = true;
    p.disconnectedAt = null;
    return { ok: true, player: p, resumed: true };
  }

  /** The socket closed. Ignored if the player already re-attached on a newer connection. */
  disconnect(p: Player, conn: Conn): void {
    if (p.conn !== conn) return;
    p.conn = null;
    p.connected = false;
    p.disconnectedAt = this.clock();
    this.touch();
    this.broadcastRoom();
  }

  /** The player chose to leave. */
  leave(p: Player): void {
    this.touch();
    p.conn = null;
    p.connected = false;
    p.left = true;
    p.disconnectedAt = this.clock();
    const inRace = (this.phase === 'countdown' || this.phase === 'racing') && p.racing;
    if (!inRace) this.players.delete(p.id);
    if (p.id === this.hostId) this.hostId = ''; // the room waits for the admin to come back
    this.broadcastRoom();
    if (this.phase === 'racing') this.checkEnd(this.clock());
  }

  kick(byId: string, targetId: string): void {
    if (byId !== this.hostId || byId === targetId) return;
    const target = this.players.get(targetId);
    if (!target) return;
    target.conn?.send({ t: 'kicked' });
    const conn = target.conn;
    this.leave(target);
    conn?.close();
  }

  /**
   * A driver picks or changes their team. Only between races (the lobby or the results page), never mid-race, never for
   * the host (who has no team), and not once the match has ended. Points a driver already earned stay with the team they
   * earned them for.
   */
  setTeam(p: Player, rawTeam: unknown): boolean {
    if (!isTeamId(rawTeam) || p.left || p.id === this.hostId || this.matchEnded) return false;
    if (this.phase !== 'lobby' && this.phase !== 'results') return false;
    if (this.activity === 'pose' || this.activity === 'cards' || this.activity === 'trivia') return false; // who is on which team is fixed while those games run
    if (p.team === rawTeam) return true;
    p.team = rawTeam;
    this.touch();
    this.broadcastRoom();
    return true;
  }

  /** Least-used look first (lowest index on ties): every driver's seat is distinct until the room outgrows the 50 looks. The host has no car and is not counted. */
  private pickVehicle(except?: Player): number {
    const uses = new Array<number>(VEHICLE_COUNT).fill(0);
    for (const p of this.players.values()) {
      if (p.id === this.hostId || p === except) continue;
      uses[p.vehicle] = (uses[p.vehicle] ?? 0) + 1;
    }
    let best = 0;
    for (let v = 1; v < VEHICLE_COUNT; v++) if (uses[v]! < uses[best]!) best = v;
    return best;
  }

  /**
   * A full room should not turn someone away because of a ghost seat: between races, free the seat of the player
   * who has been offline the longest. Never during a race (their progress and results still count).
   */
  private evictLongestOffline(): boolean {
    if (this.phase !== 'lobby' && this.phase !== 'results') return false;
    let victim: Player | null = null;
    for (const p of this.players.values()) {
      if (p.id === this.hostId || p.connected || p.left || p.disconnectedAt === null) continue; // the host holds no seat
      if (!victim || p.disconnectedAt < victim.disconnectedAt!) victim = p;
    }
    if (!victim) return false;
    this.players.delete(victim.id);
    return true;
  }

  /** Drivers: everyone who holds a seat — all players except the (spectating) host. This is what the capacity limits. */
  activeCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (!p.left && p.id !== this.hostId) n++;
    return n;
  }

  connectedCount(): number {
    let n = 0;
    for (const p of this.players.values()) if (p.connected) n++;
    return n;
  }

  // ------------------------------------------------------------------ race lifecycle

  /**
   * Host: select the difficulty level for upcoming TypeDrive races. Only the host can change it, and never mid-race
   * (a running race keeps the difficulty and passage it started with).
   */
  setDifficulty(byId: string, rawDifficulty: unknown): boolean {
    if (byId !== this.hostId || !isDifficulty(rawDifficulty)) return false;
    if (this.activity !== 'typedrive') return false;
    if (this.phase !== 'lobby' && this.phase !== 'results') return false;
    if (this.matchEnded) return false;
    if (this.difficulty === rawDifficulty) return true;
    this.difficulty = rawDifficulty;
    this.touch();
    this.broadcastRoom();
    return true;
  }

  start(byId: string, rawDifficulty?: unknown): boolean {
    if (byId !== this.hostId) return false;
    if (rawDifficulty !== undefined && !isDifficulty(rawDifficulty)) return false;
    if (this.activity !== 'typedrive') return false; // TypeDrive is only played from TypeDrive's own screens
    if (this.phase !== 'lobby' && this.phase !== 'results') return false;
    if (this.matchEnded) return false; // the match is over: a new match comes first
    this.pruneOffline();
    // Only drivers race — and only drivers who picked a team (their points have to go somewhere). The host watches and
    // runs the room, so a race needs at least one connected driver on a team.
    const racers = [...this.players.values()].filter((p) => p.connected && !p.left && p.id !== this.hostId && p.team !== null);
    if (racers.length === 0) return false;
    if (rawDifficulty !== undefined) this.difficulty = rawDifficulty;
    this.touch();

    const now = this.clock();
    const difficulty = this.difficulty;
    this.raceCounter += 1;
    this.race = {
      id: this.raceCounter,
      text: this.pickPassage(difficulty),
      goAt: now + this.cfg.countdownLeadMs,
      difficulty,
      finishOrder: [],
      firstFinishAt: null,
      scored: false,
    };
    this.results = null;
    const racing = new Set(racers.map((p) => p.id));
    for (const p of this.players.values()) {
      p.racing = racing.has(p.id);
      p.pos = 0;
      p.correct = 0;
      p.wrong = 0;
      p.keyTimes = [];
      p.keyWindow = [];
      p.lastKeyAt = 0;
      p.finishMs = 0;
      p.rank = 0;
      p.row = null;
    }
    this.phase = 'countdown';
    this.broadcastRoom();
    const id = this.race.id;
    this.goTimer = setTimeout(() => this.beginRace(id), this.cfg.countdownLeadMs);
    return true;
  }

  private pickPassage(difficulty: Difficulty): string {
    const pool = passagesFor(difficulty);
    const last = this.lastPassageByDifficulty[difficulty];
    let i = Math.floor(this.rand() * pool.length);
    if (pool.length > 1 && i === last) i = (i + 1) % pool.length;
    this.lastPassageByDifficulty[difficulty] = i;
    return pool[i]!;
  }

  private beginRace(raceId: number): void {
    if (!this.race || this.race.id !== raceId || this.phase !== 'countdown') return;
    if (this.goTimer) clearTimeout(this.goTimer);
    this.goTimer = null;
    this.phase = 'racing';
    this.tickTimer = setInterval(() => this.tick(), 100);
    this.tickTimer.unref?.();
    this.broadcastRoom();
  }

  /** One keystroke from a player. The only way progress ever changes. */
  key(p: Player, seq: number, ch: string): void {
    if (!Number.isSafeInteger(seq) || seq <= p.lastSeq || typeof ch !== 'string' || ch.length !== 1) return;
    p.lastSeq = seq; // always acked, even when the key itself is ignored — keeps client prediction in sync

    const race = this.race;
    if (!race || !p.racing || p.left || p.finishMs > 0) return;
    const now = this.clock();
    // Clients and the server timer can disagree by a few ms around GO; accept keys a hair early.
    if (this.phase === 'countdown' && now >= race.goAt - 40) this.beginRace(race.id);
    if (this.phase !== 'racing') return;

    const win = p.keyWindow;
    while (win.length > 0 && now - win[0]! > 1000) win.shift();
    if (win.length >= this.cfg.maxKeysPerSecond) return;
    win.push(now);

    p.lastKeyAt = now;
    this.touch();
    if (ch === race.text[p.pos]) {
      p.pos += 1;
      p.correct += 1;
      p.keyTimes.push(now);
    } else {
      p.wrong += 1;
    }
    if (p.pos >= race.text.length) this.finish(p, now);
  }

  private finish(p: Player, now: number): void {
    const race = this.race!;
    p.finishMs = Math.max(1, now - race.goAt);
    race.finishOrder.push(p.id);
    p.rank = race.finishOrder.length;
    if (race.firstFinishAt === null) race.firstFinishAt = now;
    p.row = this.rowFor(p, p.rank, true, p.finishMs);
    p.conn?.send({ t: 'finish', row: p.row });
    if (!this.checkEnd(now)) this.broadcastState(now);
  }

  private rowFor(p: Player, rank: number, finished: boolean, elapsedMs: number, dnfReason?: DnfReason): ResultRow {
    const len = this.race!.text.length;
    const progress = finished ? 1 : Math.min(1, p.pos / len);
    const wpm = calcWpm(finished ? len : p.pos, elapsedMs);
    const accuracy = calcAccuracy(p.correct, p.wrong);
    return {
      id: p.id,
      name: p.name,
      rank,
      finished,
      ...(!finished && dnfReason ? { dnfReason } : {}),
      progress: Math.round(progress * 1000) / 1000,
      wpm: round1(wpm),
      accuracy: round1(accuracy),
      timeMs: finished ? p.finishMs : null,
      score: calcScore(wpm, accuracy, progress),
      trophies: trophiesFor(rank, finished),
      team: p.team,
      teamPoints: p.team ? teamPointsFor(rank, finished) : 0,
    };
  }

  /**
   * Does this racer still hold the race open? Returns why not, or null if they are still in it.
   *
   * This is the complete list of ways a racer stops counting — there is deliberately NO rule of the form
   * "somebody else won, so everyone else is out":
   *   finished  – crossed the line
   *   left      – chose to leave
   *   offline   – disconnected for longer than `racerOfflineMs`
   *   inactive  – a winner exists and this racer has made no keystroke for `idleDnfMs`
   */
  private settledAs(p: Player, now: number): 'finished' | Exclude<DnfReason, 'deadline' | 'ended'> | null {
    if (p.finishMs > 0) return 'finished';
    if (p.left) return 'left';
    if (!p.connected && p.disconnectedAt !== null && now - p.disconnectedAt > this.cfg.racerOfflineMs) return 'offline';
    const first = this.race?.firstFinishAt ?? null;
    if (first !== null && now - Math.max(p.lastKeyAt, first) >= this.cfg.idleDnfMs) return 'inactive';
    return null;
  }

  /** What, if anything, ends the race right now. */
  private endCause(now: number): 'settled' | 'deadline' | null {
    const race = this.race;
    if (!race) return 'settled';
    if (now - race.goAt >= this.cfg.raceMaxMs) return 'deadline';
    for (const p of this.players.values()) {
      if (p.racing && this.settledAs(p, now) === null) return null; // someone is still genuinely racing
    }
    return 'settled';
  }

  private checkEnd(now: number): boolean {
    if (this.phase !== 'racing') return false;
    const cause = this.endCause(now);
    if (cause === null) return false;
    this.endRace(now, cause);
    return true;
  }

  private tick(): void {
    if (this.phase !== 'racing') return;
    const now = this.clock();
    if (this.checkEnd(now)) return;
    this.broadcastState(now);
  }

  /** Host: end the running race now. Everyone still unfinished is recorded as DNF (`ended`). */
  endByHost(byId: string): boolean {
    if (byId !== this.hostId || this.phase !== 'racing') return false;
    this.endRace(this.clock(), 'host');
    return true;
  }

  private endRace(now: number, cause: 'settled' | 'deadline' | 'host'): void {
    const race = this.race!;
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;

    const racers = [...this.players.values()].filter((p) => p.racing);
    const finishers = racers.filter((p) => p.finishMs > 0).sort((a, b) => a.finishMs - b.finishMs);
    const dnf = racers
      .filter((p) => p.finishMs === 0)
      .sort((a, b) => b.pos - a.pos || b.correct - a.correct || a.joinedAt - b.joinedAt);
    const elapsed = Math.max(1, now - race.goAt);
    const reasonFor = (p: Player): DnfReason => {
      const s = this.settledAs(p, now);
      if (s !== null && s !== 'finished') return s;
      return cause === 'host' ? 'ended' : 'deadline';
    };

    const rows: ResultRow[] = [];
    finishers.forEach((p, i) => rows.push(this.rowFor(p, i + 1, true, p.finishMs)));
    dnf.forEach((p, i) => rows.push(this.rowFor(p, finishers.length + i + 1, false, elapsed, reasonFor(p))));
    for (const row of rows) {
      const p = this.players.get(row.id);
      if (p) p.trophies += row.trophies;
    }
    this.recordTeamPoints(rows);
    this.results = rows;
    this.phase = 'results';
    for (const p of [...this.players.values()]) if (p.left) this.players.delete(p.id);
    this.touch();
    this.broadcastRoom();
  }

  /**
   * Add this race's team points to the match — from the final, server-computed results only, and exactly once per race
   * (`race.scored`). Only racers appear in the results, so the host, spectators and anyone who never raced earn nothing;
   * a racer who did not finish has `teamPoints` 0.
   */
  private recordTeamPoints(rows: ResultRow[]): void {
    const race = this.race;
    if (!race || race.scored) return;
    race.scored = true;
    const gained = zeroPoints();
    for (const row of rows) {
      if (!row.team) continue;
      this.ledger.push({ raceId: race.id, playerId: row.id, name: row.name, team: row.team, points: row.teamPoints });
      gained[row.team] += row.teamPoints;
    }
    this.matchRaces += 1;
    this.lastScored = { raceId: race.id, gained };
  }

  private teamTotals(): Record<TeamId, number> {
    const totals = zeroPoints();
    for (const e of this.ledger) totals[e.team] += e.points;
    return totals;
  }

  /** Per-driver contributions: points and races per (team, driver), best first. */
  private contributions(): Contribution[] {
    const byKey = new Map<string, Contribution>();
    for (const e of this.ledger) {
      const key = `${e.team}:${e.playerId}`;
      const c = byKey.get(key) ?? { team: e.team, id: e.playerId, name: e.name, points: 0, races: 0 };
      c.points += e.points;
      c.races += 1;
      byKey.set(key, c);
    }
    return [...byKey.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }

  /** Host: close the match. The team totals are final and the winner (or the tie) is declared. */
  endMatch(byId: string): boolean {
    if (byId !== this.hostId || this.activity !== 'typedrive' || this.matchEnded || this.matchRaces === 0) return false;
    if (this.phase !== 'lobby' && this.phase !== 'results') return false;
    this.matchEnded = true;
    this.touch();
    this.broadcastRoom();
    return true;
  }

  /** Host: after a match has ended, begin a fresh one — team points back to zero, everyone keeps the team they picked. */
  newMatch(byId: string): boolean {
    if (byId !== this.hostId || this.activity !== 'typedrive' || !this.matchEnded) return false;
    this.ledger = [];
    this.matchRaces = 0;
    this.lastScored = null;
    this.matchEnded = false;
    this.phase = 'lobby';
    this.race = null;
    this.results = null;
    for (const p of this.players.values()) {
      p.racing = false;
      p.row = null;
    }
    this.pruneOffline();
    this.touch();
    this.broadcastRoom();
    return true;
  }

  /** Host: results → lobby. */
  backToLobby(byId: string): boolean {
    if (byId !== this.hostId || this.activity !== 'typedrive' || this.phase !== 'results') return false;
    this.phase = 'lobby';
    this.race = null;
    this.results = null;
    for (const p of this.players.values()) {
      p.racing = false;
      p.row = null;
    }
    this.pruneOffline();
    this.touch();
    this.broadcastRoom();
    return true;
  }

  // ------------------------------------------------------------------ the activities

  /** Who can take part in the Funny Pose Challenge, Playing Cards and Tech Trivia: connected participants who picked a team. Never the host. */
  participants(): Eligible[] {
    return [...this.players.values()]
      .filter((p) => p.connected && !p.left && p.id !== this.hostId && p.team !== null)
      .map((p) => ({ id: p.id, name: p.name, team: p.team! }));
  }

  /**
   * Host: take the whole room to the dashboard or to an activity (every screen follows). TypeDrive cannot be left in the middle
   * of a race; the Funny Pose Challenge, Playing Cards and Tech Trivia keep their state, so the host can come back to them.
   */
  setActivity(byId: string, next: unknown): boolean {
    if (byId !== this.hostId || !isScreen(next)) return false;
    if (this.activity === 'typedrive' && (this.phase === 'countdown' || this.phase === 'racing')) return false;
    if (next === this.activity) return true;
    this.activity = next;
    this.touch();
    this.broadcastRoom();
    return true;
  }

  /**
   * Host: run the Funny Pose Challenge — choose the team (the spinner then picks its player at random; the host never chooses the
   * player), start the round, reveal the pose, mark it, go on. `start` begins a session (replacing a finished one), `reset` throws
   * the current session away.
   */
  poseCommand(byId: string, cmd: { op?: unknown; team?: unknown }): boolean {
    if (byId !== this.hostId || this.activity !== 'pose') return false;
    const s = this.pose;
    let ok: boolean;
    switch (cmd.op) {
      case 'start': {
        if (s && !s.over) return false;
        const fresh = PoseSession.create(
          { clock: this.clock, rand: this.rand, eligible: () => this.participants(), memory: this.poseMemory, changed: () => this.broadcastRoom() },
          this.poseSessions + 1,
        );
        if (!fresh) return false; // nobody is here to play
        this.poseSessions += 1;
        s?.dispose();
        this.pose = fresh;
        ok = true;
        break;
      }
      case 'reset':
        if (!s) return false;
        s.dispose();
        this.pose = null;
        ok = true;
        break;
      case 'team':
        ok = !!s?.selectTeam(cmd.team);
        break;
      case 'begin':
        ok = !!s?.begin();
        break;
      case 'respin':
        ok = !!s?.respinSkipping();
        break;
      case 'reveal':
        ok = !!s?.reveal();
        break;
      case 'done':
      case 'notdone':
        ok = !!s?.judge(cmd.op === 'done');
        break;
      case 'next':
        ok = !!s?.next();
        break;
      default:
        return false;
    }
    if (!ok) return false;
    this.touch();
    this.broadcastRoom();
    return true;
  }

  /**
   * Host: run Playing Cards. `start` begins a session (replacing a finished one), `show` turns the cards face up (the shuffle follows
   * by itself), `reveal` turns them over and scores the round, `next` moves on, `reset` throws the session away.
   */
  cardsCommand(byId: string, op: unknown): boolean {
    if (byId !== this.hostId || this.activity !== 'cards') return false;
    const s = this.cards;
    let ok: boolean;
    switch (op) {
      case 'start': {
        if (s && !s.over) return false;
        s?.dispose();
        this.cardsSessions += 1;
        this.cards = new CardsSession(
          { clock: this.clock, rand: this.rand, eligible: () => this.participants(), changed: () => this.broadcastRoom(), picked: () => this.scheduleAnswersBroadcast() },
          this.cardsSessions,
        );
        ok = true;
        break;
      }
      case 'reset':
        if (!s) return false;
        s.dispose();
        this.cards = null;
        ok = true;
        break;
      case 'show':
        ok = !!s?.show();
        break;
      case 'reveal':
        ok = !!s?.revealNow();
        break;
      case 'next':
        ok = !!s?.next();
        break;
      default:
        return false;
    }
    if (!ok) return false;
    this.touch();
    this.broadcastRoom();
    return true;
  }

  /** A participant picks the card they think the joker is under. */
  cardPick(p: Player, round: unknown, card: unknown): boolean {
    if (this.activity !== 'cards' || !this.cards || typeof round !== 'number' || typeof card !== 'number') return false;
    if (p.id === this.hostId || p.left || p.team === null) return false;
    return this.cards.pick({ id: p.id, name: p.name, team: p.team }, round, card);
  }

  /** Host: run Tech Trivia. `start` begins a quiz (replacing a finished one), `reveal` closes the question now, `next` moves on. */
  triviaCommand(byId: string, op: unknown): boolean {
    if (byId !== this.hostId || this.activity !== 'trivia') return false;
    const s = this.trivia;
    switch (op) {
      case 'start': {
        if (s && !s.over) return false;
        const fresh = TriviaSession.create(
          { clock: this.clock, rand: this.rand, eligible: () => this.participants(), used: this.triviaUsed, changed: () => this.broadcastRoom(), answered: () => this.scheduleAnswersBroadcast() },
          this.triviaSessions + 1,
        );
        if (!fresh) return false;
        this.triviaSessions += 1;
        s?.dispose();
        this.trivia = fresh;
        break;
      }
      case 'reset':
        if (!s) return false;
        s.dispose();
        this.trivia = null;
        break;
      case 'reveal':
        return !!s?.revealNow();
      case 'next':
        return !!s?.next();
      default:
        return false;
    }
    this.touch();
    this.broadcastRoom();
    return true;
  }

  /** A participant answers the trivia question in play. */
  triviaAnswer(p: Player, q: unknown, choice: unknown): boolean {
    if (this.activity !== 'trivia' || !this.trivia || typeof q !== 'number' || typeof choice !== 'number') return false;
    if (p.id === this.hostId || p.left || p.team === null) return false;
    return this.trivia.answer(p.id, q, choice);
  }

  /** Answers (and card picks) arrive in bursts: tell everyone how many are in a moment from now, not once per answer. */
  private scheduleAnswersBroadcast(): void {
    if (this.answersTimer) return;
    this.answersTimer = setTimeout(() => {
      this.answersTimer = null;
      this.broadcastRoom();
    }, 150);
    this.answersTimer.unref?.();
  }

  /** Each activity's own team points and status (scores are never mixed between activities). */
  private activityScores(): ActivityScore[] {
    const status = (live: boolean, done: boolean): ActivityStatus => (done ? 'done' : live ? 'live' : 'pending');
    return [
      { id: 'typedrive', status: status(this.activity === 'typedrive' || this.matchRaces > 0, this.matchEnded), points: this.teamTotals() },
      { id: 'pose', status: status(this.activity === 'pose' || !!this.pose, !!this.pose?.over), points: this.pose?.scores() ?? zeroPoints() },
      { id: 'cards', status: status(this.activity === 'cards' || !!this.cards, !!this.cards?.over), points: this.cards?.scores() ?? zeroPoints() },
      { id: 'trivia', status: status(this.activity === 'trivia' || !!this.trivia, !!this.trivia?.over), points: this.trivia?.scores() ?? zeroPoints() },
    ];
  }

  // ------------------------------------------------------------------ housekeeping

  private pruneOffline(): boolean {
    if (this.phase !== 'lobby' && this.phase !== 'results') return false;
    const now = this.clock();
    let changed = false;
    for (const p of [...this.players.values()]) {
      // the host's seat is kept, so the admin's browser can always resume it
      if (p.id !== this.hostId && !p.connected && p.disconnectedAt !== null && now - p.disconnectedAt >= this.cfg.lobbyPruneMs) {
        this.players.delete(p.id);
        changed = true;
      }
    }
    return changed;
  }

  /** Called periodically by the registry. Returns true when the room should be deleted. */
  sweep(): boolean {
    const now = this.clock();
    if (this.pruneOffline()) this.broadcastRoom();
    return this.connectedCount() === 0 && now - this.lastActivity > this.cfg.roomIdleMs;
  }

  dispose(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.goTimer) clearTimeout(this.goTimer);
    if (this.answersTimer) clearTimeout(this.answersTimer);
    this.pose?.dispose();
    this.cards?.dispose();
    this.trivia?.dispose();
    this.tickTimer = this.goTimer = this.answersTimer = null;
  }

  private touch(): void {
    this.lastActivity = this.clock();
  }

  // ------------------------------------------------------------------ outbound

  roomInfo(): RoomInfo {
    const activities = this.activityScores();
    return {
      code: this.code,
      phase: this.phase,
      difficulty: this.difficulty,
      capacity: this.cfg.maxPlayers,
      hostId: this.hostId,
      players: [...this.players.values()]
        .filter((p) => !p.left || p.racing)
        .map((p) => ({
          id: p.id,
          name: p.name,
          vehicle: p.vehicle,
          connected: p.connected,
          host: p.id === this.hostId,
          trophies: p.trophies,
          racing: p.racing,
          team: p.team,
        })),
      race: this.race ? { id: this.race.id, text: this.race.text, goAt: this.race.goAt, difficulty: this.race.difficulty } : null,
      teams: this.teamStandings(),
      match: this.matchInfo(),
      ...(this.phase === 'results' && this.results ? { results: this.results } : {}),
      activity: this.activity,
      activities,
      overall: overallStandings(activities),
      pose: this.pose?.info() ?? null,
      cards: this.cards?.info() ?? null,
      trivia: this.trivia?.info() ?? null,
    };
  }

  /** The three teams in a fixed order, each with its running total and rank (equal points share a rank). */
  private teamStandings(): TeamStanding[] {
    const ranked = new Map(rankTeams(this.teamTotals()).map((t) => [t.id, t]));
    return TEAMS.map((t) => {
      const r = ranked.get(t.id)!;
      return { id: t.id, name: t.name, points: r.points, rank: r.rank, tied: r.tied };
    });
  }

  private matchInfo(): MatchInfo {
    const showDetail = this.matchEnded || this.phase === 'results';
    return {
      races: this.matchRaces,
      ended: this.matchEnded,
      last: this.lastScored,
      ...(this.matchEnded ? { winners: winningTeams(this.teamTotals()) } : {}),
      ...(showDetail && this.ledger.length > 0 ? { contributions: this.contributions() } : {}),
    };
  }

  broadcastRoom(): void {
    const json = JSON.stringify({ t: 'room', room: this.roomInfo() } satisfies ServerMsg);
    for (const p of this.players.values()) if (p.conn) sendEncoded(p.conn, json);
  }

  private broadcastState(now: number): void {
    const race = this.race;
    if (!race) return;
    const len = race.text.length;
    const racers = [...this.players.values()].filter((p) => p.racing);
    racers.sort((a, b) => {
      if (a.finishMs > 0 && b.finishMs > 0) return a.finishMs - b.finishMs;
      if (a.finishMs > 0) return -1;
      if (b.finishMs > 0) return 1;
      return b.pos - a.pos || a.joinedAt - b.joinedAt;
    });
    const tuples: RacerTuple[] = racers.map((p) => [
      p.id,
      p.pos,
      Math.round(p.finishMs > 0 ? calcWpm(len, p.finishMs) : liveWpm(p.keyTimes, now, race.goAt)),
      p.finishMs,
    ]);
    // the racers are the same for everyone: encode them once; only the acknowledged keystroke differs per player
    const head = `{"t":"state","race":${JSON.stringify(race.id)},"racers":${JSON.stringify(tuples)},"ack":`;
    for (const p of this.players.values()) if (p.conn) sendEncoded(p.conn, `${head}${p.lastSeq}}`);
  }

  /** Resume payload for a (re)connecting player. */
  finishRowFor(p: Player): ResultRow | undefined {
    return this.race && p.row ? p.row : undefined;
  }
}
