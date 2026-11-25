import { DIFFICULTIES, type Difficulty } from '../../../shared/difficulty';

/**
 * The race level as a three-position selector — a throttle with one, two and three bars. The host moves it (it sends the same
 * `difficulty` message as the full-screen picker); everyone else sees which level is set and cannot change it.
 */
export function LobbyDifficulty({ selected, canChange, onSelect }: { selected: Difficulty; canChange: boolean; onSelect(d: Difficulty): void }) {
  return (
    <div className="lb-gear" role="radiogroup" aria-label="Race difficulty">
      {DIFFICULTIES.map((d) => {
        const on = selected === d.id;
        return (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={!canChange}
            className={`lb-gear-opt df-${d.id}${on ? ' on' : ''}`}
            title={`${d.name} — ${d.description}`}
            onClick={() => canChange && !on && onSelect(d.id)}
          >
            <span className="df-bars" aria-hidden>
              <u className="on" />
              <u className={d.bars >= 2 ? 'on' : ''} />
              <u className={d.bars >= 3 ? 'on' : ''} />
            </span>
            <b>{d.short}</b>
            <small>{d.tier.split('·')[1]?.trim() ?? d.tier}</small>
          </button>
        );
      })}
    </div>
  );
}
