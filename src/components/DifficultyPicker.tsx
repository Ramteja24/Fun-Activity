import type { ReactNode } from 'react';
import { DIFFICULTIES, difficultyDef, type Difficulty } from '../../shared/difficulty';

export function DifficultyBadge({
  difficulty,
  variant = 'lobby',
}: {
  difficulty: Difficulty;
  variant?: 'lobby' | 'hud' | 'results';
}) {
  const def = difficultyDef(difficulty);
  if (variant === 'hud') {
    return (
      <div
        className={`pill pos diff-pill df-${difficulty}`}
        data-difficulty={difficulty}
        title={`${def.name} — ${def.description}`}
      >
        <span className="df-bars" aria-hidden>
          <u className="on" />
          <u className={def.bars >= 2 ? 'on' : ''} />
          <u className={def.bars >= 3 ? 'on' : ''} />
        </span>
        <b>
          {def.short.toUpperCase()}
          <span className="diff-typing-word"> TYPING</span>
        </b>
      </div>
    );
  }

  return (
    <span
      className={`df-badge df-${difficulty}`}
      data-difficulty={difficulty}
      title={`${def.name} — ${def.description}`}
    >
      <span className="df-bars" aria-hidden>
        <u className="on" />
        <u className={def.bars >= 2 ? 'on' : ''} />
        <u className={def.bars >= 3 ? 'on' : ''} />
      </span>
      <span>{def.name}</span>
    </span>
  );
}

/** A speed gauge for a difficulty card: the needle rests at the level (low, middle, high) and sweeps there when the card is chosen. */
function DifficultyGauge({ level }: { level: 1 | 2 | 3 }) {
  const angle = -58 + (level - 1) * 58;
  const arc = (a0: number, a1: number) => {
    const p = (a: number) => [60 + 46 * Math.sin((a * Math.PI) / 180), 62 - 46 * Math.cos((a * Math.PI) / 180)] as const;
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)} A46 46 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  return (
    <svg className="df-gauge" viewBox="0 0 120 72" aria-hidden>
      <path className="df-g-track" d={arc(-84, 84)} />
      <path className="df-g-seg a" d={arc(-84, -30)} />
      <path className="df-g-seg b" d={arc(-26, 26)} />
      <path className="df-g-seg c" d={arc(30, 84)} />
      <g className="df-needle" style={{ '--a': `${angle}deg` } as React.CSSProperties}>
        <path d="M60 62 L60 24" />
        <circle cx="60" cy="62" r="5" />
      </g>
    </svg>
  );
}

export interface DifficultySelectProps {
  selected: Difficulty;
  roomCode: string;
  isHost: boolean;
  driversReady: number;
  onSelect(difficulty: Difficulty): void;
  onStart(): void;
  onBack(): void;
  backLabel?: string;
  header?: ReactNode;
}

/**
 * Full-screen pre-race difficulty selector shown before starting a TypeDrive race.
 * Only the host can change the room's difficulty or launch the countdown; participants see live updates.
 */
export function DifficultySelectScreen({
  selected,
  roomCode,
  isHost,
  driversReady,
  onSelect,
  onStart,
  onBack,
  backLabel = 'Back to lobby',
  header,
}: DifficultySelectProps) {
  const activeDef = difficultyDef(selected);

  return (
    <div className="lp lb df-screen" data-difficulty-screen>
      <div className="lp-body">
        {header}
        <main className="lp-main df-main">
          <header className="df-head">
            <span className="pill pill-brand">Room {roomCode}</span>
            <h1 className="df-h1">Select difficulty</h1>
            <p className="df-lead">
              {isHost
                ? 'Choose the typing level for this race. Every driver in the room races the exact same difficulty and passage.'
                : 'The host selects the difficulty for the race. Everyone in the room plays the same level and typing passage.'}
            </p>
          </header>

          <div className="df-cards" role="radiogroup" aria-label="Typing difficulty">
            {DIFFICULTIES.map((d) => {
              const isSelected = selected === d.id;
              return (
                <div key={d.id} className={`df-card-wrap df-${d.id}${isSelected ? ' selected' : ''}`}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={!isHost}
                    data-difficulty-card={d.id}
                    className="df-card"
                    onClick={() => isHost && onSelect(d.id)}
                  >
                    <div className="df-card-top">
                      <span className="df-tier">{d.tier}</span>
                      <span className="df-bars" aria-hidden>
                        <u className="on" />
                        <u className={d.bars >= 2 ? 'on' : ''} />
                        <u className={d.bars >= 3 ? 'on' : ''} />
                      </span>
                    </div>
                    <DifficultyGauge level={d.bars} />

                    <div className="df-card-title-row">
                      <h2 className="df-card-title">{d.name}</h2>
                      <span className="df-state-pill">{isSelected ? 'Selected' : isHost ? 'Choose' : 'Locked'}</span>
                    </div>

                    <p className="df-card-desc">{d.description}</p>

                    <div className="df-tags">
                      {d.highlights.map((tag) => (
                        <span key={tag} className="df-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>

          <div className="df-actions">
            {isHost ? (
              <>
                <button
                  type="button"
                  className="lp-go"
                  disabled={driversReady === 0}
                  onClick={onStart}
                  aria-label={`Start ${activeDef.name} race${driversReady > 0 ? ` with ${driversReady} driver${driversReady === 1 ? '' : 's'}` : ''}`}
                >
                  <span className="lp-go-in">
                    Start {activeDef.short} race{driversReady > 1 ? ` · ${driversReady} drivers` : ''}
                  </span>
                </button>
                <div className="df-back-row">
                  <button type="button" className="lb-btn df-back-btn" onClick={onBack}>
                    <span>{backLabel}</span>
                  </button>
                </div>
                <p className="lb-hint">
                  {driversReady === 0
                    ? `${activeDef.name} is selected for everyone in the room. Waiting for at least one driver on a team to join before starting.`
                    : `All ${driversReady} ${driversReady === 1 ? 'driver' : 'drivers'} on the grid will race a random ${activeDef.name} passage together.`}
                </p>
              </>
            ) : (
              <>
                <div className="lb-wait" role="status">
                  <span className="spinner" aria-hidden />
                  <p>Current race level: {activeDef.name} — waiting for the host to start the race…</p>
                </div>
                <div className="df-back-row">
                  <button type="button" className="lb-btn df-back-btn" onClick={onBack}>
                    <span>{backLabel}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
