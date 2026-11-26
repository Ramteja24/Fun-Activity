// Teams and team scoring. Pure data and rules, shared by the server (authoritative) and the client (display only).

export type TeamId = 'titans' | 'vibe' | 'ctrl';

export interface TeamDef {
  id: TeamId;
  name: string;
  /** The people each team was drawn from: a reference list. Anyone can still join and pick any team. */
  members: readonly string[];
}

export const TEAMS: readonly TeamDef[] = [
  {
    id: 'titans',
    name: 'The Titans',
    members: [
      'Ramesh Namperumal',
      'Kanishkaa',
      'Joni',
      'Eby',
      'Dhanushah',
      'Nagarjuna',
      'Shaik',
      'Babitha',
      'Siva',
      'Issac',
      'Ramesh Patil',
      'Sandeep Gowda',
      'Sravani Bethala',
    ],
  },
  {
    id: 'vibe',
    name: 'The Vibe Tribe',
    members: ['Sanjai', 'Anita', 'Hemalatha', 'Princy', 'Raghul', 'Jeffrey', 'Sneha', 'Sanjeeth', 'Rayappa', 'Rakesh', 'Amruta', 'Gnana sree', 'Kailashnath Sharma', 'Kavya'],
  },
  {
    id: 'ctrl',
    name: 'Ctrl + Alt + Defeat',
    members: ['Ram', 'Malathy', 'Dhanuja', 'Sharmili', 'Giri', 'Aditya', 'Kowsalya', 'Himanshu', 'Ram Teja', 'Mercy Flavia', 'Srinath Chagaleti', 'Pavan Shyam', 'Saran', 'Harshavarthan'],
  },
];

export const TEAM_IDS: readonly TeamId[] = TEAMS.map((t) => t.id);

export const isTeamId = (x: unknown): x is TeamId => typeof x === 'string' && (TEAM_IDS as readonly string[]).includes(x);

export const teamName = (id: TeamId | null | undefined): string => TEAMS.find((t) => t.id === id)?.name ?? '';

/** An empty per-team tally. */
export const zeroPoints = (): Record<TeamId, number> => ({ titans: 0, vibe: 0, ctrl: 0 });

// ------------------------------------------------------------------------------------------------ scoring

/**
 * Points for the first five finishers, in order. Kept on the same scale as the other games (+10 per round), because every
 * game's points add up on one overall scoreboard.
 */
export const FINISH_POINTS: readonly number[] = [10, 8, 6, 4, 2];
/** Every other player who finishes. */
export const OTHER_FINISHER_POINTS = 1;

/**
 * Team points one racer earns for one race. `rank` is their place among the finishers (1 = first across the line).
 * A racer who did not finish earns nothing, whatever their position in the results.
 */
export function teamPointsFor(rank: number, finished: boolean): number {
  if (!finished || !Number.isInteger(rank) || rank < 1) return 0;
  return FINISH_POINTS[rank - 1] ?? OTHER_FINISHER_POINTS;
}

export interface TeamRank {
  id: TeamId;
  points: number;
  /** Competition ranking: teams on equal points share a rank (1, 1, 3). */
  rank: number;
  /** More than one team has this rank. */
  tied: boolean;
}

/** Rank the three teams by points, highest first; equal points share a rank (a tie is a tie — nobody is picked at random). */
export function rankTeams(points: Record<TeamId, number>): TeamRank[] {
  const sorted = [...TEAM_IDS].sort((a, b) => points[b] - points[a] || TEAM_IDS.indexOf(a) - TEAM_IDS.indexOf(b));
  return sorted.map((id) => {
    const rank = 1 + sorted.filter((o) => points[o] > points[id]).length;
    return { id, points: points[id], rank, tied: sorted.filter((o) => points[o] === points[id]).length > 1 };
  });
}

/** The team(s) on the most points. More than one means a tie. */
export function winningTeams(points: Record<TeamId, number>): TeamId[] {
  return rankTeams(points)
    .filter((t) => t.rank === 1)
    .map((t) => t.id);
}

// ------------------------------------------------------------------------------------------------ roster reference

export const nameKey = (name: string): string => name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

/** The team whose reference list contains this name (exact full name, case-insensitive) — only ever a suggestion. */
export function rosterTeamFor(name: string): TeamId | null {
  const key = nameKey(name);
  if (!key) return null;
  return TEAMS.find((t) => t.members.some((m) => nameKey(m) === key))?.id ?? null;
}
