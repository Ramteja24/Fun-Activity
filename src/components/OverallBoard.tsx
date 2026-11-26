import type { ActivityId } from '../../shared/activities';
import { TEAMS } from '../../shared/teams';
import { useGame } from '../store';

/**
 * The ONE scoreboard of the session, shown at the end of every game: each team's running total of all the games so far, with
 * what the game that just ended added to it. The same totals as the dashboard's overall scoreboard.
 */
export function OverallBoard({ game, className = '' }: { game: ActivityId; className?: string }) {
  const room = useGame((s) => s.room)!;
  const order = (id: string) => TEAMS.findIndex((t) => t.id === id);
  const rows = [...room.overall].sort((a, b) => a.rank - b.rank || order(a.id) - order(b.id));
  const anyScored = rows.some((r) => r.points > 0);
  return (
    <section className={`card tt-board-card ob-card ${className}`} aria-label="Overall scoreboard">
      <h2 className="section-title">
        Overall scoreboard <span>all games added up</span>
      </h2>
      <div className="tt-board">
        {rows.map((r) => (
          <div key={r.id} className={`tt-row tm-${r.id}`}>
            <span className="tt-rank">{!anyScored ? '–' : r.tied ? `T${r.rank}` : r.rank}</span>
            <span className="tt-name">
              <i className="tm-dot" aria-hidden />
              {r.name}
            </span>
            <span className="tt-scored">+{r.byActivity[game]} this game</span>
            <span className="tt-total">
              {r.points} <small>pts</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
