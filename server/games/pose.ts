// Funny Pose Challenge. The host runs every round — but only chooses the TEAM. Choosing a team starts a spinner on every screen
// that picks one of its players at random; the host then starts the round, reveals the pose and marks whether it was completed.
// The chosen player copies the pose on the live call while everyone watches. The server owns every decision (who the spinner lands
// on, when it stops, what a verdict is worth) and every screen shows the same thing, timed from the server's clock.
//
// Picking a player, all decided here:
//  • only a connected participant on the chosen team can be picked — never the host, never someone who has left or dropped out;
//  • nobody is picked again until everyone eligible on the team has had a turn (random among those with the fewest turns), and the
//    count carries over from session to session in the room; someone who joins late has had no turns, so they come up first;
//  • a turn is counted when the round actually starts, so a spin the host abandons (by choosing another team) costs nobody theirs;
//  • if the picked player goes offline before the round starts, the spinner simply runs again among the people still here.
//
// Which pose a round uses is dealt when the session starts — 8 of the 24, spread over the categories, skipping poses used in earlier
// sessions until the bank would run short — and stays hidden until the host reveals it.
import { POSE_PERFORM_MS, POSE_POINTS, POSE_ROUNDS, POSE_SPIN_MS } from '../../shared/activities';
import type { Named, PoseInfo, PoseRound, PoseStage } from '../../shared/protocol';
import { POSE_BANK, type PoseChallenge } from '../../shared/poses';
import { isTeamId, zeroPoints, type TeamId } from '../../shared/teams';
import { shuffle, type Eligible, type Rand } from './shared';

/** What a room remembers between sessions, so poses and turns keep rotating over a whole fun session. */
export interface PoseMemory {
  usedPoses: Set<string>;
  /** Rounds each player has performed, by player id. */
  playerTurns: Map<string, number>;
}
export const newPoseMemory = (): PoseMemory => ({ usedPoses: new Set(), playerTurns: new Map() });

export interface PoseEnv {
  clock(): number;
  rand: Rand;
  /** Connected participants who picked a team (never the host, never anyone who has left). */
  eligible(): Eligible[];
  memory: PoseMemory;
  /** Something changed: send everyone the new state. */
  changed(): void;
}

/** A player of this team who has had the fewest turns (random among them): nobody repeats until everyone has played. */
export function pickPlayer(candidates: readonly Eligible[], turns: ReadonlyMap<string, number>, rand: Rand): Eligible | null {
  if (candidates.length === 0) return null;
  const fewest = Math.min(...candidates.map((c) => turns.get(c.id) ?? 0));
  const pool = candidates.filter((c) => (turns.get(c.id) ?? 0) === fewest);
  return pool[Math.floor(rand() * pool.length)]!;
}

/** `n` poses, spread over the categories, skipping those already used (the used list resets when the bank would run short). */
export function pickPoses(n: number, used: Set<string>, rand: Rand, bank: readonly PoseChallenge[] = POSE_BANK): PoseChallenge[] {
  if (bank.filter((p) => !used.has(p.id)).length < n) used.clear();
  const pool = shuffle(bank.filter((p) => !used.has(p.id)), rand);
  const byCategory = new Map<string, PoseChallenge[]>();
  for (const p of pool) byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), p]);
  const picked: PoseChallenge[] = [];
  while (picked.length < n) {
    for (const cat of shuffle([...byCategory.keys()], rand)) {
      const next = byCategory.get(cat)!.shift();
      if (next) picked.push(next);
      if (picked.length === n) break;
    }
    if ([...byCategory.values()].every((list) => list.length === 0)) break;
  }
  for (const p of picked) used.add(p.id);
  return shuffle(picked, rand);
}

export class PoseSession {
  private stage: PoseStage = 'pick';
  private round = 1;
  private team: TeamId | null = null;
  private player: Named | null = null;
  private pool: Named[] = [];
  /** People the host re-spun away this round (not at the meeting): the spinner does not land on them again this round. */
  private skipped = new Set<string>();
  private spinStartedAt = 0;
  private endsAt: number | undefined;
  private result: 'completed' | 'not_completed' | undefined;
  private gained: number | undefined;
  private readonly history: PoseRound[] = [];
  private readonly poses: PoseChallenge[];
  private timer: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    private readonly env: PoseEnv,
    readonly id: number,
    readonly rounds: number,
  ) {
    this.poses = pickPoses(rounds, env.memory.usedPoses, env.rand);
  }

  /** A new session on round 1 (choosing a team), or null when nobody eligible is here to play. */
  static create(env: PoseEnv, id: number, rounds = POSE_ROUNDS): PoseSession | null {
    return env.eligible().length === 0 ? null : new PoseSession(env, id, rounds);
  }

  /**
   * Host: choose the team that plays this round. The spinner starts at once and picks one of its players at random. Allowed while
   * choosing and after a spin has landed (to switch to a different team — choosing the same team again does nothing, so the host
   * cannot keep spinning for a player they like); the team must have someone here.
   */
  selectTeam(team: unknown): boolean {
    if ((this.stage !== 'pick' && this.stage !== 'selected') || !isTeamId(team)) return false;
    if (this.stage === 'selected' && team === this.team) return false;
    this.skipped.clear();
    return this.spin(team);
  }

  /**
   * Host: the picked person is away — spin again for the same team. It never lands on them, nor on anyone skipped earlier this round
   * (once everyone else has been skipped, any other member); a team of one cannot be re-spun. Costs nobody a turn.
   */
  respinSkipping(): boolean {
    if (this.stage !== 'selected' || !this.team || !this.player) return false;
    const away = this.player.id;
    const others = this.env.eligible().filter((e) => e.team === this.team && e.id !== away);
    if (others.length === 0) return false;
    this.skipped.add(away);
    return this.spin(this.team, away);
  }

  /** Pick a player of `team` now and start the spinner. False when nobody on the team is here. */
  private spin(team: TeamId, justSkipped?: string): boolean {
    const members = this.env.eligible().filter((e) => e.team === team);
    const fresh = members.filter((m) => !this.skipped.has(m.id));
    const candidates = fresh.length > 0 ? fresh : members.filter((m) => m.id !== justSkipped);
    const picked = pickPlayer(candidates, this.env.memory.playerTurns, this.env.rand);
    if (!picked) return false;
    this.clear();
    this.team = team;
    this.player = { id: picked.id, name: picked.name };
    this.pool = members.map((m) => ({ id: m.id, name: m.name }));
    this.stage = 'spin';
    this.spinStartedAt = this.env.clock();
    // the spinner stops (and the host can start the round) on every screen at once
    this.timer = setTimeout(() => this.landed(), POSE_SPIN_MS);
    this.timer.unref?.();
    return true;
  }

  /** The spinner has stopped. If the picked player has gone since, it runs again among whoever is still here. */
  private landed(): void {
    if (this.stage !== 'spin') return;
    this.timer = null;
    if (!this.stillHere()) this.respin();
    else this.stage = 'selected';
    this.env.changed();
  }

  private stillHere(): boolean {
    const { team, player } = this;
    return !!team && !!player && this.env.eligible().some((e) => e.id === player.id && e.team === team);
  }

  /** The picked player is no longer here: spin again for the same team, or — when nobody on it is left — back to choosing a team. */
  private respin(): void {
    if (this.team && this.spin(this.team)) return;
    this.team = null;
    this.player = null;
    this.pool = [];
    this.stage = 'pick';
  }

  /** Host: start the round with the player the spinner picked (the pose stays hidden). Counts as that player's turn. */
  begin(): boolean {
    if (this.stage !== 'selected' || !this.player) return false;
    if (!this.stillHere()) {
      this.respin(); // they left after the spinner landed: never start a round with someone who is gone
      this.env.changed();
      return false;
    }
    const turns = this.env.memory.playerTurns;
    turns.set(this.player.id, (turns.get(this.player.id) ?? 0) + 1);
    this.stage = 'ready';
    return true;
  }

  /** Host: show everyone the pose; the performing clock starts. */
  reveal(): boolean {
    if (this.stage !== 'ready') return false;
    this.stage = 'posing';
    this.endsAt = this.env.clock() + POSE_PERFORM_MS;
    return true;
  }

  /** Host: mark the round. Points go to the player's team — once: only a revealed, not yet judged round can be marked. */
  judge(completed: boolean): boolean {
    const pose = this.poses[this.round - 1];
    if (this.stage !== 'posing' || !this.team || !this.player || !pose) return false;
    const points = completed ? POSE_POINTS : 0;
    this.history.push({ round: this.round, poseId: pose.id, team: this.team, player: this.player, completed, points });
    this.stage = 'judged';
    this.result = completed ? 'completed' : 'not_completed';
    this.gained = points;
    return true;
  }

  /** Host: on to the next round (choosing a team again) — or, after the last, the end of the session. */
  next(): boolean {
    if (this.stage !== 'judged') return false;
    if (this.round >= this.rounds) {
      this.stage = 'over';
      return true;
    }
    this.round += 1;
    this.stage = 'pick';
    this.skipped.clear();
    this.team = null;
    this.player = null;
    this.pool = [];
    this.endsAt = undefined;
    this.result = undefined;
    this.gained = undefined;
    return true;
  }

  get over(): boolean {
    return this.stage === 'over';
  }

  scores(): Record<TeamId, number> {
    const s = zeroPoints();
    for (const r of this.history) s[r.team] += r.points;
    return s;
  }

  info(): PoseInfo {
    const revealed = this.stage === 'posing' || this.stage === 'judged';
    const turns = zeroPoints();
    for (const r of this.history) turns[r.team] += 1;
    return {
      session: this.id,
      stage: this.stage,
      rounds: this.rounds,
      round: this.round,
      team: this.team,
      player: this.player,
      pool: this.pool,
      spinStartedAt: this.spinStartedAt,
      spinMs: POSE_SPIN_MS,
      ...(revealed && this.poses[this.round - 1] ? { poseId: this.poses[this.round - 1]!.id } : {}),
      ...(this.stage === 'posing' && this.endsAt !== undefined ? { endsAt: this.endsAt } : {}),
      performMs: POSE_PERFORM_MS,
      ...(this.result ? { result: this.result } : {}),
      ...(this.gained !== undefined ? { gained: this.gained } : {}),
      history: this.history,
      scores: this.scores(),
      turns,
    };
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  dispose(): void {
    this.clear();
  }
}
