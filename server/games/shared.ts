import type { TeamId } from '../../shared/teams';

/** A participant who can be picked for a game: connected, on a team, and never the host. */
export interface Eligible {
  id: string;
  name: string;
  team: TeamId;
}

export type Rand = () => number;

export function shuffle<T>(items: readonly T[], rand: Rand): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
