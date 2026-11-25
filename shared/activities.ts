// The Weekly Fun Activity: three games in a fixed order, a score for each, and an overall team leaderboard.
// Pure data and rules, shared by the server (authoritative) and the client (display only).
import { rankTeams, TEAMS, TEAM_IDS, type TeamId } from './teams';

export type ActivityId = 'typedrive' | 'pose' | 'trivia';
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
  { id: 'pose', name: 'Funny Pose Challenge', tagline: 'The host picks a team and a player. They copy a funny pose on the call while everyone watches.' },
  { id: 'trivia', name: 'Tech Trivia', tagline: 'Five quick questions on Python, AI, SQL, Git and the cloud. Everyone answers.' },
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
export const POSE_ROUNDS = 8;
/** What a completed pose is worth to the selected player's team (a pose the host marks as not completed earns nothing). */
export const POSE_POINTS = 10;
/** The performer's suggested time once the pose is revealed (a clock for everyone to watch; the host still decides the result). */
export const POSE_PERFORM_MS = 30_000;
/** The player spinner that follows the host's choice of team — the same on every screen, timed from the server's clock. */
export const POSE_SPIN_MS = 5200;

// ------------------------------------------------------------------------------------------------ Tech Trivia
export const TRIVIA_QUESTIONS = 5;
export const TRIVIA_LIMIT_MS = 20_000;
/** A correct answer is worth this much, plus up to TRIVIA_SPEED more for answering early. */
export const TRIVIA_BASE = 100;
export const TRIVIA_SPEED = 100;

// ------------------------------------------------------------------------------------------------ the overall leaderboard
/**
 * The three activities score on very different scales (a TypeDrive race can add hundreds of points, a trivia question at most
 * 200), so the overall leaderboard adds up *placements*, not raw points: in each activity that has scored, the team in 1st place
 * gets 3, 2nd gets 2, 3rd gets 1 (teams level on points share a place, as in the race results). Each activity therefore counts
 * the same, and the raw points stay visible next to it.
 */
export const PLACEMENT_POINTS: readonly number[] = [3, 2, 1];
export const placementFor = (rank: number): number => PLACEMENT_POINTS[rank - 1] ?? 0;

export interface OverallRow {
  id: TeamId;
  name: string;
  /** Sum of the placement points over the activities that have scored. */
  placement: number;
  /** Activities in which this team is (currently) in first place, ties included. */
  wins: number;
  /** 1 = best. Teams level on placement points share a rank, shown as a tie (nobody is picked at random). */
  rank: number;
  tied: boolean;
}

const scored = (a: ActivityScore) => TEAM_IDS.some((t) => a.points[t] > 0);

/** The overall leaderboard from the three activities' scores, in the fixed team order. */
export function overallStandings(activities: readonly ActivityScore[]): OverallRow[] {
  const placement = Object.fromEntries(TEAM_IDS.map((t) => [t, 0])) as Record<TeamId, number>;
  const wins = { ...placement };
  for (const a of activities) {
    if (!scored(a)) continue; // nothing scored there yet: it adds nothing to anyone
    for (const r of rankTeams(a.points)) {
      placement[r.id] += placementFor(r.rank);
      if (r.rank === 1) wins[r.id] += 1;
    }
  }
  const sorted = [...TEAM_IDS].sort((a, b) => placement[b] - placement[a] || wins[b] - wins[a] || TEAM_IDS.indexOf(a) - TEAM_IDS.indexOf(b));
  const sameAs = (a: TeamId, b: TeamId) => placement[a] === placement[b] && wins[a] === wins[b];
  return TEAMS.map((t) => {
    const ahead = sorted.filter((o) => placement[o] > placement[t.id] || (placement[o] === placement[t.id] && wins[o] > wins[t.id])).length;
    return { id: t.id, name: t.name, placement: placement[t.id], wins: wins[t.id], rank: 1 + ahead, tied: sorted.filter((o) => o !== t.id && sameAs(o, t.id)).length > 0 };
  });
}

/** The team(s) leading the overall leaderboard once something has scored (more than one = a tie), else none. */
export function overallLeaders(rows: readonly OverallRow[]): TeamId[] {
  if (rows.every((r) => r.placement === 0)) return [];
  return rows.filter((r) => r.rank === 1).map((r) => r.id);
}
