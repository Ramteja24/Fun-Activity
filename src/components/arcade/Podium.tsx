import type { TeamId } from '../../../shared/teams';
import { IconCrown, IconTrophy } from '../Icons';

export interface PodiumEntry {
  key: string;
  /** 1 = first. Equal ranks are allowed (a tie). */
  rank: number;
  name: string;
  /** The big figure under the name: "86 WPM", "30 pts". */
  value: string;
  sub?: string;
  team?: TeamId | null;
  me?: boolean;
}

/**
 * The three podium places in their classic arrangement — 2nd on the left, 1st in the middle, 3rd on the right — from entries
 * already ordered best first. Fewer than three entries leave the other pedestals empty.
 */
export function podiumSlots(entries: readonly PodiumEntry[]): (PodiumEntry | null)[] {
  const top = entries.slice(0, 3);
  return [top[1] ?? null, top[0] ?? null, top[2] ?? null];
}

/**
 * A podium that builds itself: the pedestals rise (3rd, 2nd, then 1st), the names drop onto them and the winner gets the crown.
 * Purely a picture of results the server has already decided.
 */
export function Podium({ entries, label = 'Podium' }: { entries: readonly PodiumEntry[]; label?: string }) {
  const slots = podiumSlots(entries);
  const place = ['second', 'first', 'third'] as const;
  return (
    <ol className="arc-podium" aria-label={label}>
      {slots.map((e, i) => (
        <li key={e?.key ?? `empty-${i}`} className={`arc-pod ${place[i]}${e ? '' : ' empty'}${e?.me ? ' me' : ''}${e?.team ? ` tm-${e.team}` : ''}`}>
          {e && (
            <div className="arc-pod-who">
              {e.rank === 1 ? <IconCrown className="arc-pod-crown" width={30} height={30} /> : <IconTrophy className="arc-pod-medal" width={22} height={22} />}
              <b className="arc-pod-name">{e.name}</b>
              <span className="arc-pod-value">{e.value}</span>
              {e.sub && <small className="arc-pod-sub">{e.sub}</small>}
            </div>
          )}
          <div className="arc-pod-base" aria-hidden>
            <span>{e ? e.rank : ''}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
