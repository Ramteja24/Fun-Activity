import type { CSSProperties } from 'react';
import type { TeamId } from '../../../shared/teams';
import { rankLabel } from '../lobby/TeamBoard';
import type { TeamRaceLine } from './summary';

/**
 * What the race did for each of the three teams: the points it earned (the server's figure), the team's place in the match, and
 * what each of its drivers contributed. The team that earned the most in this race is marked; a tie marks them all.
 */
export function TeamResults({ lines, myTeam }: { lines: readonly TeamRaceLine[]; myTeam: TeamId | null }) {
  const winners = lines.filter((l) => l.best).length;
  return (
    <ol className="rt-grid">
      {lines.map((t, i) => {
        const g = t.gained;
        return (
          <li key={t.id} className={`rt tm-${t.id}${t.best ? ' best' : ''}${t.id === myTeam ? ' mine' : ''}`} style={{ '--n': i } as CSSProperties}>
            <header className="rt-head">
              <span className="rt-rank" title={`Match rank ${t.rank}${t.matchTied ? ' (tied)' : ''}`}>
                {rankLabel(t.rank, t.matchTied, true)}
              </span>
              <div className="rt-who">
                <h3 className="rt-name">
                  {t.name}
                  {t.id === myTeam && <em> · your team</em>}
                </h3>
                <p className="rt-sub">
                  {t.best ? <span className="rt-flag">{winners > 1 ? 'Joint race winners' : 'Race winners'}</span> : <span>{g > 0 ? `${t.raceTied ? 'Joint ' : ''}${t.raceRank}${suffix(t.raceRank)} in this race` : 'No points this race'}</span>}
                </p>
              </div>
              <div className="rt-pts">
                <span className="ts-total">
                  {t.total} <small>pts</small>
                </span>
                <span className={`ts-gain${g === 0 ? ' zero' : ''}`}>+{g} this race</span>
              </div>
            </header>
            <ul className="rt-drivers" aria-label={`${t.name}: what each driver earned`}>
              {t.drivers.length === 0 && <li className="rt-none">No driver from this team raced</li>}
              {t.drivers.map((d) => (
                <li key={d.id}>
                  <span className="rt-pos">{d.finished ? d.rank : '–'}</span>
                  <span className="rt-dname">{d.name}</span>
                  <span className="rt-dwpm">{d.finished ? `${Math.round(d.wpm)} WPM` : 'DNF'}</span>
                  <b className="rt-dpts">+{d.points}</b>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

const suffix = (n: number) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
