import type { CSSProperties } from 'react';
import { teamName, type TeamId } from '../../../shared/teams';
import { metalFor, Trophy } from './Trophy';

/** One of the first three finishers of the race, as the server scored them. */
export interface AwardEntry {
  key: string;
  rank: number;
  name: string;
  team: TeamId | null;
  wpm: number;
  accuracy: number | null;
  timeMs: number | null;
  /** What they earned their team. */
  teamPoints: number | null;
  me: boolean;
}

const time = (ms: number | null) => (ms === null ? '' : `${(ms / 1000).toFixed(1)}s`);

/** Fixed positions for the glitter around the winner (deterministic: no randomness in the screen). */
const SPARKS = [
  { x: 8, y: 22, d: 0 },
  { x: 22, y: 6, d: 0.7 },
  { x: 38, y: 30, d: 1.4 },
  { x: 62, y: 8, d: 0.3 },
  { x: 78, y: 26, d: 1.1 },
  { x: 92, y: 14, d: 1.8 },
  { x: 14, y: 52, d: 0.9 },
  { x: 86, y: 50, d: 0.5 },
  { x: 50, y: 4, d: 1.6 },
  { x: 30, y: 62, d: 2.1 },
  { x: 70, y: 64, d: 1.3 },
  { x: 4, y: 40, d: 2.4 },
];

/**
 * The winner announcement: a large gold trophy under a spotlight, the winner's name in gold chrome, their team, and the figures that
 * won it. More than one entry means the first place was shared (two finishers with the same rank), and all of them are named.
 */
export function WinnerBanner({ winners }: { winners: readonly AwardEntry[] }) {
  const w = winners[0];
  if (!w) return null;
  const shared = winners.length > 1;
  const names = winners.map((x) => x.name).join(' & ');
  return (
    <div className="rc-winner" role="status" aria-live="polite">
      <div className="rc-sparks" aria-hidden>
        {SPARKS.map((s, i) => (
          <i key={i} style={{ left: `${s.x}%`, top: `${s.y}%`, animationDelay: `${1.4 + s.d}s` } as CSSProperties} />
        ))}
      </div>
      <Trophy metal="gold" className="rc-hero-trophy" />
      <p className="rc-kicker">{w.me && !shared ? 'You are the winner' : shared ? 'Joint race winners' : 'Race winner'}</p>
      <h2 className="rc-wname" data-text={names}>
        <span className="rc-wface">{names}</span>
      </h2>
      <div className="rc-wmeta">
        {w.team && (
          <span className={`ts-chip tm-${w.team}`} title={teamName(w.team)}>
            {teamName(w.team)}
          </span>
        )}
        <span className="rc-wstat">
          <b>{Math.round(w.wpm)}</b> WPM
        </span>
        {w.accuracy !== null && (
          <span className="rc-wstat">
            <b>{Math.round(w.accuracy)}%</b> accuracy
          </span>
        )}
        {w.timeMs !== null && (
          <span className="rc-wstat">
            <b>{time(w.timeMs)}</b> time
          </span>
        )}
        {w.teamPoints !== null && (
          <span className="rc-wstat rc-gold">
            <b>+{w.teamPoints}</b> team pts
          </span>
        )}
      </div>
    </div>
  );
}

/** The classic arrangement from entries already ordered best first: 2nd on the left, 1st in the middle, 3rd on the right. */
export function awardSlots(entries: readonly AwardEntry[]): (AwardEntry | null)[] {
  const top = entries.slice(0, 3);
  return [top[1] ?? null, top[0] ?? null, top[2] ?? null];
}

/**
 * The awards podium: 2nd on the left, 1st in the middle, 3rd on the right, on metallic pedestals with a trophy over each and a
 * spotlight on each. It builds itself in order — 3rd, 2nd, then 1st — through CSS delays.
 */
export function AwardsPodium({ entries }: { entries: readonly AwardEntry[] }) {
  const slots = awardSlots(entries);
  const place = ['second', 'first', 'third'] as const;
  return (
    <ol className="rc-podium" aria-label="Race podium">
      {slots.map((e, i) => {
        const metal = metalFor(e?.rank ?? i + 1);
        return (
          <li key={e?.key ?? `empty-${i}`} className={`rc-step ${place[i]} ${metal}${e ? '' : ' empty'}${e?.me ? ' me' : ''}${e?.team ? ` tm-${e.team}` : ''}`}>
            {e && (
              <>
                <span className="rc-spot" aria-hidden />
                <div className="rc-up">
                  <Trophy metal={metal} className="rc-pod-trophy" />
                  <div className="rc-plate">
                    <b className="rc-pname" title={e.name}>
                      {e.name}
                      {e.me && <em> · you</em>}
                    </b>
                    {e.team && (
                      <span className={`ts-chip tm-${e.team}`} title={teamName(e.team)}>
                        {teamName(e.team)}
                      </span>
                    )}
                    <span className="rc-pwpm">
                      {Math.round(e.wpm)} <small>WPM</small>
                    </span>
                    {e.teamPoints !== null && <small className="rc-ppts">+{e.teamPoints} team pts</small>}
                  </div>
                </div>
              </>
            )}
            <div className="rc-pedestal" aria-hidden>
              <span>{e ? e.rank : ''}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
