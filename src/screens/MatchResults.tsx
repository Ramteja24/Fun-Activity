import { TEAMS, teamName, type TeamId } from '../../shared/teams';
import { TeamPodium } from '../components/arcade/TeamPodium';
import { rankLabel } from '../components/lobby/TeamBoard';
import { Trophy } from '../components/results/Trophy';
import { SiteHeader } from '../components/SiteHeader';
import { useGame } from '../store';

/**
 * The end of the match: every team's total points and rank, what each driver contributed, and the winner — or, when the
 * top teams are level, a tie (nobody is picked at random). The host can start a fresh match from here.
 */
export function MatchResultsScreen() {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me)!;
  const newMatch = useGame((s) => s.newMatch);
  const openActivity = useGame((s) => s.openActivity);
  const leave = useGame((s) => s.leave);

  const isHost = room.hostId === me;
  const order = (id: TeamId) => TEAMS.findIndex((t) => t.id === id);
  const teams = [...room.teams].sort((a, b) => a.rank - b.rank || order(a.id) - order(b.id));
  const winners = room.match.winners ?? teams.filter((t) => t.rank === 1).map((t) => t.id);
  const tie = winners.length > 1;
  const top = teams[0];
  const contributions = room.match.contributions ?? [];
  const races = room.match.races;

  return (
    <div className="lp mr">
      <div className="lp-body">
        <SiteHeader
          right={
            <button className="lb-leave" onClick={leave}>
              <span>Leave</span>
            </button>
          }
        />
        <main className="lp-main mr-main">
          <section className={`card mr-banner${!tie && top ? ` tm-${top.id}` : ''}`} role="status">
            <Trophy metal="gold" className="mr-trophy" />
            <p className="eyebrow">
              TypeDrive · match results · {races} {races === 1 ? 'race' : 'races'}
            </p>
            {tie ? (
              <>
                <h1 className="tie">It’s a tie!</h1>
                <p>
                  {winners.map((id) => teamName(id)).join(' & ')} finish level on {top?.points ?? 0} points — nobody takes it outright.
                </p>
              </>
            ) : (
              <>
                <p className="kick">Match winners</p>
                <h1 className="win">{top ? teamName(top.id) : ''}</h1>
                <p>
                  {top?.points ?? 0} points after {races} {races === 1 ? 'race' : 'races'}
                </p>
              </>
            )}
            <TeamPodium scores={Object.fromEntries(room.teams.map((t) => [t.id, t.points])) as Record<TeamId, number>} label="Match podium" />
          </section>

          <section className="mr-teams" aria-label="Team totals">
            <h2 className="section-title">
              Team totals <span>what every driver contributed</span>
            </h2>
            {teams.map((t) => {
              const players = contributions.filter((c) => c.team === t.id);
              const isWinner = winners.includes(t.id);
              return (
                <section key={t.id} className={`card mr-team tm-${t.id}${t.rank === 1 ? ' first' : ''}`} aria-label={`${t.name}: rank ${t.rank}, ${t.points} points`}>
                  <div className="mr-head">
                    <span className="mr-rank">{rankLabel(t.rank, t.tied, true)}</span>
                    <div className="mr-who">
                      <h3 className="mr-name">{t.name}</h3>
                      {isWinner && <span className="pill pill-team">{tie ? 'Tied for the lead' : 'Winner'}</span>}
                    </div>
                    <span className="mr-total">
                      {t.points} <small>pts</small>
                    </span>
                  </div>
                  {players.length === 0 ? (
                    <p className="mr-none">No driver scored for this team.</p>
                  ) : (
                    <ul className="mr-players">
                      {players.map((c) => (
                        <li key={`${c.team}:${c.id}`} className={c.id === me ? 'me' : ''}>
                          <span className="nm">
                            {c.name}
                            {c.id === me ? ' (you)' : ''}
                          </span>
                          <span className="races">
                            {c.races} {c.races === 1 ? 'race' : 'races'}
                          </span>
                          <span className="pts">+{c.points}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </section>

          <div className="card mr-actions">
            {isHost ? (
              <>
                <button className="btn btn-lg btn-primary" onClick={() => openActivity('pose')}>
                  Next activity: Funny Pose Challenge
                </button>
                <button className="btn btn-lg btn-secondary" onClick={() => openActivity('hub')}>
                  Activity hub · overall leaderboard
                </button>
                <button className="btn btn-lg btn-ghost" onClick={newMatch}>
                  Start a new match · scores back to zero
                </button>
              </>
            ) : (
              <div className="res-wait">
                <span className="spinner" />
                <p>Waiting for the host to start a new match…</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
