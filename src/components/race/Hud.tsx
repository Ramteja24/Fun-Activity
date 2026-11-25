import { DEFAULT_DIFFICULTY, type Difficulty } from '../../../shared/difficulty';
import { formatTime } from '../../../shared/game';
import type { HudState } from '../../game/engine';
import { DifficultyBadge } from '../DifficultyPicker';
import { IconList } from '../Icons';
import { Logo } from '../Logo';
import { MusicToggle } from '../MusicToggle';

export function Hud({
  hud,
  difficulty = DEFAULT_DIFFICULTY,
  onStandings,
  standingsOpen,
  field = false,
}: {
  hud: HudState;
  difficulty?: Difficulty;
  onStandings(): void;
  standingsOpen: boolean;
  /** A big field is on the road (13 racers or more): the HUD also shows how much of the passage is done. */
  field?: boolean;
}) {
  return (
    <header className="hud">
      <div className="hud-left">
        <div className="pill speed">
          <b>{hud.wpm}</b>
          <span>WPM</span>
        </div>
        <div className={`pill pos${hud.rank === 1 ? ' lead' : ''}`} title={`${hud.total} racers`}>
          <i>Place</i>
          <b>#{hud.rank}</b>
          <small>/{hud.total}</small>
        </div>
        {field && (
          <div className="pill pos prog" title="How much of the passage you have typed">
            <i>Done</i>
            <b>{Math.round(Math.min(1, hud.progress) * 100)}%</b>
          </div>
        )}
        <DifficultyBadge difficulty={difficulty} variant="hud" />
      </div>
      <div className="hud-center">
        <Logo size={13} withIcon={false} />
      </div>
      <div className="hud-right">
        <div className="pill timer">
          <b>{formatTime(hud.elapsedMs)}</b>
        </div>
        <button
          className="icon-btn"
          data-standings-toggle
          onClick={onStandings}
          // Don't steal focus from the (invisible) typing input mid-race.
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
          aria-pressed={standingsOpen}
          aria-label="Live standings"
          title="Live standings"
        >
          <IconList width={15} height={15} />
        </button>
        {/* the last item of the header, like on the landing page and in the lobby */}
        <MusicToggle variant="hud" />
      </div>
    </header>
  );
}
