// The Weekly Fun Activity: three games in a fixed order (the Funny Pose Challenge is hidden), a score for each, and an overall team leaderboard.
// Pure data and rules, shared by the server (authoritative) and the client (display only).
import { rankTeams, TEAMS, TEAM_IDS, type TeamId } from './teams';

export type ActivityId = 'typedrive' | 'pose' | 'cards' | 'trivia';
/** What the room is showing: the dashboard, or one of the activities. */
export type Screen = 'hub' | ActivityId;

export interface ActivityDef {
  id: ActivityId;
  name: string;
  tagline: string;
}

/** In the order they are played. */
export const ACTIVITIES: readonly ActivityDef[] = [
  { id: 'typedrive', name: 'TypeDrive', tagline: 'A live typing race. Each team’s drivers score points for finishing first.' },
  // HIDDEN: the Funny Pose Challenge. Its code is all still here (server/games/pose.ts, src/screens/FunnyPose.tsx); to bring it
  // back, uncomment this line — it then shows up again on the dashboard, in the nav and in the play order, after TypeDrive.
  // { id: 'pose', name: 'Funny Pose Challenge', tagline: 'The host picks a team and a player. They copy a funny pose on the call while everyone watches.' },
  { id: 'cards', name: 'Playing Cards', tagline: 'Watch the joker, follow the shuffle, tap the card — first to find it wins 10 for the team.' },
  { id: 'trivia', name: 'Tech Trivia', tagline: 'Five quick questions on Python, SQL and AI. Everyone answers.' },
];

export const ACTIVITY_IDS: readonly ActivityId[] = ACTIVITIES.map((a) => a.id);
export const isActivityId = (x: unknown): x is ActivityId => typeof x === 'string' && (ACTIVITY_IDS as readonly string[]).includes(x);
export const isScreen = (x: unknown): x is Screen => x === 'hub' || isActivityId(x);
export const activityName = (id: ActivityId): string => ACTIVITIES.find((a) => a.id === id)!.name;
/** The activity after this one (null after the last). */
export const nextActivity = (id: ActivityId): ActivityId | null => ACTIVITY_IDS[ACTIVITY_IDS.indexOf(id) + 1] ?? null;

/** pending: not played yet · live: being played, or partly played · done: finished. */
export type ActivityStatus = 'pending' | 'live' | 'done';

export interface ActivityScore {
  id: ActivityId;
  status: ActivityStatus;
  /** Team points in this activity only (scores are never mixed between activities). */
  points: Record<TeamId, number>;
}

// ------------------------------------------------------------------------------------------------ Funny Pose Challenge
/** Every team plays the same number of rounds: two each, so six in all. */
export const POSE_TURNS_PER_TEAM = 2;
export const POSE_ROUNDS = POSE_TURNS_PER_TEAM * TEAMS.length;
/**
 * Whether `team` has used up its rounds. Only enforced while another team that still has rounds left has someone here, so a
 * session can never get stuck when the teams owed a round have nobody at the meeting.
 */
export function poseTeamFull(team: TeamId, turns: Record<TeamId, number>, here: (t: TeamId) => number): boolean {
  if (turns[team] < POSE_TURNS_PER_TEAM) return false;
  return TEAM_IDS.some((t) => t !== team && turns[t] < POSE_TURNS_PER_TEAM && here(t) > 0);
}
/** What a completed pose is worth to the selected player's team (a pose the host marks as not completed earns nothing). */
export const POSE_POINTS = 10;
/** The performer's suggested time once the pose is revealed (a clock for everyone to watch; the host still decides the result). */
export const POSE_PERFORM_MS = 30_000;
/** The player spinner that follows the host's choice of team — the same on every screen, timed from the server's clock. */
export const POSE_SPIN_MS = 5200;

// ------------------------------------------------------------------------------------------------ Playing Cards (find the joker)
export const CARDS_ROUNDS = 10;
/** Per round: how many cards, how many swaps the shuffle makes, and how long each swap takes (it gets harder every round). */
export const CARDS_PER_ROUND: readonly number[] = [3, 3, 4, 4, 4, 5, 5, 5, 5, 5];
export const CARDS_SWAPS: readonly number[] = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
export const CARDS_SWAP_MS: readonly number[] = [420, 400, 380, 360, 340, 320, 300, 280, 260, 240];
/** How long the cards stay face up with the joker showing before the shuffle starts. */
export const CARDS_PREVIEW_MS = 2200;
/** A short pause after the cards turn face down, so every screen starts the shuffle together. */
export const CARDS_SHUFFLE_LEAD_MS = 500;
/** Per round, only the FIRST correct pick scores: this many points for that player's team. */
export const CARDS_POINTS = 10;
/** How long players have to pick once the shuffle stops; then the answer is revealed by itself (the host can reveal sooner). */
export const CARDS_PICK_MS = 10_000;

// ------------------------------------------------------------------------------------------------ Tech Trivia
export const TRIVIA_QUESTIONS = 5;
export const TRIVIA_LIMIT_MS = 15_000;
/** Per question, only the FIRST correct answer scores: this many points for that player's team. */
export const TRIVIA_POINTS = 10;

// ------------------------------------------------------------------------------------------------ the overall leaderboard
/**
 * ONE scoreboard for the whole session: every game's team points are simply added together, game after game. All games score
 * on the same scale (+10 for a won round; a race gives 10 / 8 / 6 / 4 / 2 / 1 per finisher), so no game swamps the others.
 * Teams on equal totals share a rank and are shown as a tie (nobody is picked at random).
 */
export interface OverallRow {
  id: TeamId;
  name: string;
  /** The running total: the sum of this team's points in every game played so far. */
  points: number;
  /** What each game has added to that total. */
  byActivity: Record<ActivityId, number>;
  /** 1 = best. Equal totals share a rank. */
  rank: number;
  tied: boolean;
}

/** The overall scoreboard from the activities' scores, in the fixed team order. */
export function overallStandings(activities: readonly ActivityScore[]): OverallRow[] {
  const totals = Object.fromEntries(TEAM_IDS.map((t) => [t, 0])) as Record<TeamId, number>;
  for (const a of activities) for (const t of TEAM_IDS) totals[t] += a.points[t] ?? 0;
  const ranked = new Map(rankTeams(totals).map((r) => [r.id, r]));
  return TEAMS.map((t) => {
    const byActivity = Object.fromEntries(ACTIVITY_IDS.map((id) => [id, activities.find((a) => a.id === id)?.points[t.id] ?? 0])) as Record<ActivityId, number>;
    const r = ranked.get(t.id)!;
    return { id: t.id, name: t.name, points: totals[t.id], byActivity, rank: r.rank, tied: r.tied };
  });
}

/** The team(s) leading the overall scoreboard once something has scored (more than one = a tie), else none. */
export function overallLeaders(rows: readonly OverallRow[]): TeamId[] {
  if (rows.every((r) => r.points === 0)) return [];
  return rows.filter((r) => r.rank === 1).map((r) => r.id);
}
