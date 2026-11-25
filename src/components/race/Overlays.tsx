import { useEffect } from 'react';
import { ordinal } from '../../../shared/game';
import type { ResultRow } from '../../../shared/protocol';
import { uiSound } from '../../audio/ui-sounds';
import { difficultyDef } from '../../../shared/difficulty';
import { engine, useGame } from '../../store';
import type { Banner as BannerState } from '../../game/engine';
import type { CountdownStage } from '../../game/hooks';
import { Confetti } from '../Confetti';
import { IconCrown, IconTrophy, IconUp, IconWarn } from '../Icons';

/** Position-change banner ("OVERTAKEN! #3" / "IN THE LEAD! P1 LEADER"). */
export function Banner({ banner }: { banner: BannerState | null }) {
  useEffect(() => {
    if (!banner) return;
    const t = window.setTimeout(() => engine.clearBanner(banner.id), 2500);
    return () => window.clearTimeout(t);
  }, [banner]);
  if (!banner) return null;
  return (
    <div key={banner.id} className={`banner ${banner.kind}`} role="status">
      <span className="banner-ico">{banner.kind === 'lost' ? <IconWarn width={18} height={18} /> : banner.kind === 'lead' ? <IconCrown width={18} height={18} /> : <IconUp width={18} height={18} />}</span>
      <div>
        <div className="t">{banner.title}</div>
        <div className="s">{banner.sub}</div>
      </div>
    </div>
  );
}

const CAPTIONS: Record<3 | 2 | 1 | 0, string> = {
  3: 'Drivers on the starting grid... get ready!',
  2: 'Engines revving... prepare your fingers!',
  1: 'Green lights in a moment... launch imminent!',
  0: 'Full throttle! Type the text!',
};

/** Traffic-light countdown exactly as staged in the reel: red 3 → amber 2 → amber 1 → green GO!. */
export function Countdown({ stage }: { stage: CountdownStage }) {
  const room = useGame((s) => s.room);
  if (stage === null) return null;
  const lit = stage === 3 ? 0 : stage === 0 ? 2 : 1;
  const colours = ['red', 'amber', 'green'] as const;
  // the broadcast card over the grid: what is about to start (read from the room; it adds no timing of its own)
  const level = room ? difficultyDef(room.race?.difficulty ?? room.difficulty).name : null;
  const grid = room ? room.players.filter((p) => p.racing).length : 0;
  return (
    <div className="countdown" data-stage={stage} aria-live="assertive">
      {stage !== 0 && level && (
        <div className="cd-brief" aria-hidden>
          <span>Race starting</span>
          <b>{level}</b>
          <i>
            {grid} {grid === 1 ? 'driver' : 'drivers'} on the grid
          </i>
        </div>
      )}
      {/* the light show: an edge vignette that clears at GO, a shockwave ring on every number, a flash and rays on GO */}
      <div key={`v${stage === 0}`} className="cd-vignette" aria-hidden />
      <div className="lights">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`bulb ${i === lit ? colours[i] : ''}`} />
        ))}
      </div>
      <div className="cd-stage">
        <div key={`r${stage}`} className="cd-ring" aria-hidden />
        <div key={stage} className={`cd-num ${stage === 0 ? 'go' : `s${stage}`}`}>
          {stage === 0 ? 'GO!' : stage}
        </div>
      </div>
      {stage === 0 && (
        <>
          <div className="cd-flash" aria-hidden />
          <div className="cd-rays" aria-hidden />
        </>
      )}
      <div className="cd-cap">{CAPTIONS[stage]}</div>
    </div>
  );
}

/**
 * Speed lines along the road that grow with the driver's speed: nothing below 10 WPM, a haze of streaks at a steady pace, a
 * rush at 100+. Purely a picture of the number the HUD already shows.
 */
export function SpeedLines({ wpm, racing }: { wpm: number; racing: boolean }) {
  // rounded to 0.05: --k sets the streaks' animation speed, and re-timing an animation on every small change costs a style pass
  const k = racing ? Math.round(Math.min(1, Math.max(0, (wpm - 8) / 100)) * 20) / 20 : 0;
  return <div className={`speedfx${k > 0.04 ? ' on' : ''}${k > 0.7 ? ' hot' : ''}`} style={{ '--k': k.toFixed(2) } as React.CSSProperties} aria-hidden />;
}

function titleFor(rank: number) {
  if (rank === 1) return 'Victory!';
  if (rank <= 3) return 'Podium finish!';
  return 'Race complete!';
}

/** The card that pops up the moment you cross the line — with a fanfare, rays and confetti when you make the podium. */
export function FinishCard({ row }: { row: ResultRow }) {
  useEffect(() => {
    if (row.rank <= 3) uiSound.fanfare();
    else uiSound.ding();
  }, [row.rank]);
  return (
    <>
      {row.rank <= 3 && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 35, pointerEvents: 'none' }}>
          <Confetti />
        </div>
      )}
      <div className={`fc-rays${row.rank === 1 ? ' gold' : ''}`} aria-hidden />
      <div className={`finish-card${row.rank <= 3 ? ` podium p${row.rank}` : ''}`} role="alert">
        <div className="fc-place" aria-hidden>
          {row.rank <= 3 ? <IconTrophy width={26} height={26} /> : null}
          <span>{ordinal(row.rank)}</span>
        </div>
        <h2>{titleFor(row.rank)}</h2>
        <dl className="fc-stats">
          <div>
            <dt>Place</dt>
            <dd>{ordinal(row.rank)}</dd>
          </div>
          <div>
            <dt>Speed</dt>
            <dd>
              {Math.round(row.wpm)} <small>WPM</small>
            </dd>
          </div>
          <div>
            <dt>Accuracy</dt>
            <dd>{Math.round(row.accuracy)}%</dd>
          </div>
        </dl>
        <p>Your results are on the way…</p>
      </div>
    </>
  );
}
