import type { ResultRow, TeamStanding } from '../../../shared/protocol';
import { TEAMS, type TeamId } from '../../../shared/teams';

/** One racer of a team in the race that just finished, as the server scored them. */
export interface TeamDriver {
  id: string;
  name: string;
  rank: number;
  finished: boolean;
  wpm: number;
  /** What this driver earned their team (the row's own `teamPoints`; 0 for a DNF). */
  points: number;
}

/** One team's line in the race summary. */
export interface TeamRaceLine {
  id: TeamId;
  name: string;
  /** What this race earned the team: the server's figure (`match.last.gained`), or the sum of its drivers' points if that is not there. */
  gained: number;
  /** The team's place by what it earned in this race (equal points share a place). */
  raceRank: number;
  raceTied: boolean;
  /** The team(s) that earned the most in this race — a tie lists them all, nobody is picked. Never set when nobody scored. */
  best: boolean;
  /** The running match total and the team's match rank (from the standings the server sent). */
  total: number;
  rank: number;
  matchTied: boolean;
  /** Every racer of the team, best finisher first. */
  drivers: TeamDriver[];
}

/**
 * The per-team summary of a finished race, built only from what the server sent: the final rows (each driver's `teamPoints`), the
 * standings and `match.last.gained`. It computes no score of its own — it groups and orders numbers that already exist — and lists
 * the three teams by what they earned in this race, best first (ties keep the match order).
 */
export function teamRaceSummary(rows: readonly ResultRow[], standings: readonly TeamStanding[], gained: Record<TeamId, number> | undefined): TeamRaceLine[] {
  const base = TEAMS.map((def, order) => {
    const drivers: TeamDriver[] = rows
      .filter((r) => r.team === def.id)
      .sort((a, b) => a.rank - b.rank)
      .map((r) => ({ id: r.id, name: r.name, rank: r.rank, finished: r.finished, wpm: r.wpm, points: r.teamPoints }));
    const st = standings.find((s) => s.id === def.id);
    return {
      order,
      id: def.id,
      name: def.name,
      gained: gained?.[def.id] ?? drivers.reduce((sum, d) => sum + d.points, 0),
      total: st?.points ?? 0,
      rank: st?.rank ?? order + 1,
      matchTied: st?.tied ?? false,
      drivers,
    };
  });
  const top = Math.max(0, ...base.map((b) => b.gained));
  return base
    .map((b) => ({
      ...b,
      raceRank: 1 + base.filter((o) => o.gained > b.gained).length,
      raceTied: base.some((o) => o.id !== b.id && o.gained === b.gained),
      best: top > 0 && b.gained === top,
    }))
    .sort((a, b) => b.gained - a.gained || a.rank - b.rank || a.order - b.order)
    .map(({ order: _order, ...line }) => line);
}
