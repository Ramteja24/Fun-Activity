import type { CSSProperties } from 'react';
import { ACTIVITIES, overallLeaders, type ActivityId } from '../../shared/activities';
import { TEAMS, teamName } from '../../shared/teams';
import { Burst } from '../components/arcade/Burst';
import { CountUp } from '../components/arcade/CountUp';
import { TeamPodium } from '../components/arcade/TeamPodium';
import { IconCrown, IconTrophy } from '../components/Icons';
import { HostBar, PortalFrame, PortalLayout, PortalTitle } from '../portal/parts';
import { useGame } from '../store';

const SHORT_NAME: Record<ActivityId, string> = { typedrive: 'Race', pose: 'Pose', cards: 'Cards', trivia: 'Trivia' };

/**
 * The final scoreboard: every team's total over all the games, the winner celebrated (a tie is shown as a tie), a podium, and
 * what each game added. The host brings the whole room here (every screen follows) and back to the dashboard.
 */
export function FinalScoreboardScreen() {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me)!;
  const openActivity = useGame((s) => s.openActivity);
  const isHost = room.hostId === me;

  const rows = [...room.overall].sort((a, b) => a.rank - b.rank || TEAMS.findIndex((t) => t.id === a.id) - TEAMS.findIndex((t) => t.id === b.id));
  const leaders = overallLeaders(room.overall);
  const anyScored = rows.some((r) => r.points > 0);
  const top = Math.max(1, ...rows.map((r) => r.points));
  const games = ACTIVITIES.map((a) => a.id);
  const scores = Object.fromEntries(rows.map((r) => [r.id, r.points])) as Record<(typeof rows)[number]['id'], number>;
  const winner = leaders.length === 1 ? rows.find((r) => r.id === leaders[0])! : null;
  const allDone = room.activities.every((a) => a.status === 'done');

  return (
    <PortalFrame screen="scores">
      <PortalLayout
        className="fs-layout"
        main={
          <>
            <PortalTitle
              kicker={allDone ? 'All games complete' : 'So far'}
              title="Final scoreboard"
              lead={`Every game’s team points added up: ${ACTIVITIES.map((a) => a.name).join(', ')}.`}
            />

            <section className={`fs-hero card${winner ? ` tm-${winner.id} win` : anyScored ? ' tie' : ''}`} role="status" aria-live="polite">
              {winner && <Burst key={`${winner.id}:${winner.points}`} />}
              <span className="fs-trophy" aria-hidden>
                {winner ? <IconCrown width={40} height={40} /> : <IconTrophy width={40} height={40} />}
              </span>
              <div className="fs-hero-text">
                {!anyScored ? (
                  <>
                    <p className="eyebrow">Nothing scored yet</p>
                    <h2>Play a game first</h2>
                  </>
                ) : winner ? (
                  <>
                    <p className="eyebrow">The winners</p>
                    <h2>{winner.name}</h2>
                    <p className="fs-hero-pts">
                      <CountUp value={winner.points} from={0} ms={1600} /> <small>points</small>
                    </p>
                  </>
                ) : (
                  <>
                    <p className="eyebrow">Nobody takes it outright</p>
                    <h2>It’s a tie!</h2>
                    <p className="fs-hero-pts">
                      {leaders.map((id) => teamName(id)).join(' & ')} · {rows[0]!.points} <small>points each</small>
                    </p>
                  </>
                )}
              </div>
            </section>

            <div className="fs-podium">
              <TeamPodium scores={scores} label="Final team podium" />
            </div>
          </>
        }
        side={
          <>
            <HostBar isHost={isHost} waiting="The final scoreboard — the host takes everyone back to the dashboard.">
              <button className="btn btn-primary btn-lg" onClick={() => openActivity('hub')}>
                <span>Back to the dashboard</span>
              </button>
            </HostBar>

            <section className="fs-board card" aria-labelledby="fs-board-title">
              <h2 id="fs-board-title" className="section-title">
                Team totals <span>what each game added</span>
              </h2>
              <ol className="fs-rows">
                {rows.map((r, i) => (
                  <li
                    key={r.id}
                    className={`fs-row tm-${r.id}${anyScored && r.rank === 1 ? ' first' : ''}`}
                    style={{ '--i': i } as CSSProperties}
                    aria-label={`${r.name}: ${r.points} points${anyScored ? `, rank ${r.rank}${r.tied ? ' (tied)' : ''}` : ''}`}
                  >
                    <span className="fs-rank">{anyScored ? (r.tied ? `T${r.rank}` : r.rank) : '–'}</span>
                    <span className="fs-name">
                      <i className="tm-dot" aria-hidden />
                      {r.name}
                    </span>
                    <b className="fs-total">
                      <CountUp value={r.points} from={0} ms={1400} />
                      <small>pts</small>
                    </b>
                    <span className="fs-bar" aria-hidden>
                      {games.map((g) => {
                        const v = r.byActivity[g] ?? 0;
                        return v > 0 ? <i key={g} className={`ac-${g}`} style={{ width: `${(v / top) * 100}%` }} title={`${SHORT_NAME[g]} ${v}`} /> : null;
                      })}
                    </span>
                    <span className="fs-parts">
                      {games.map((g) => (
                        <span key={g} className={`ac-${g}`}>
                          <i aria-hidden />
                          {SHORT_NAME[g]} <b>{r.byActivity[g] ?? 0}</b>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </>
        }
      />
    </PortalFrame>
  );
}
