import { useEffect, useRef, useState } from 'react';
import { formatTime } from '../../shared/game';
import { countdownAudio } from '../audio/sfx';
import { DifficultyBadge } from '../components/DifficultyPicker';
import { IconEye, IconList } from '../components/Icons';
import { Logo } from '../components/Logo';
import { MusicToggle } from '../components/MusicToggle';
import { Countdown } from '../components/race/Overlays';
import { Standings } from '../components/race/Standings';
import { Track } from '../components/race/Track';
import { useCountdown, useEngine, useStageSizing } from '../game/hooks';
import { engine, useGame } from '../store';

/**
 * The race as seen by someone who is not in it: the host (who never races) — or a player who joined while it was running.
 * The same road, scenery, countdown and live standings as the drivers see, but no car, no WPM, no position and no typing
 * field. The camera follows the leader and the five lanes show the five leading cars; the standings panel lists every
 * driver (with their car) live. The host also gets "End race now" here, and everyone can leave.
 */
export function SpectatorScreen() {
  useEngine();
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me)!;
  const endRace = useGame((s) => s.endRace);
  const stageRef = useRef<HTMLDivElement>(null);
  // Wide screens show the standings beside the road from the start; on phones they open on demand.
  const [standingsOpen, setStandingsOpen] = useState(() => window.innerWidth >= 900);
  const [confirmEnd, setConfirmEnd] = useState(false);
  useStageSizing(stageRef);

  // Keep the leader clear of the standings panel while it is open (the panel is 300 px wide plus its margins).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth;
      engine.spectatorAnchor = standingsOpen && w >= 600 ? Math.max(0.4, Math.min(0.8, (w - 316) / w)) : 0.8;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [standingsOpen]);

  // ~10 Hz: clock, driver count and the five leading lanes.
  useEffect(() => {
    const id = window.setInterval(() => engine.tick(), 100);
    return () => window.clearInterval(id);
  }, []);

  const stage = useCountdown(engine.goAt);

  // The same race-start sounds the drivers hear, from the same server-clock goAt (see audio/countdown-audio.ts).
  const { raceId, goAt, active } = engine;
  useEffect(() => {
    if (!active || !goAt) return;
    return countdownAudio.begin(`${raceId}@${goAt}`, goAt);
  }, [active, raceId, goAt]);

  const isHost = room.hostId === me;
  const names = new Map(room.players.map((p) => [p.id, p.name]));
  const lead = engine.standings()[0];
  const done = (fin: number) => fin > 0 && fin < Number.MAX_SAFE_INTEGER;
  const countingDown = room.phase === 'countdown' || stage !== null;

  let line: string;
  if (countingDown && room.phase === 'countdown') line = 'The race is about to start…';
  else if (!lead) line = 'Waiting for the drivers…';
  else if (done(lead.fin)) line = `${names.get(lead.id) ?? 'A driver'} has finished — waiting for the others`;
  else line = `${names.get(lead.id) ?? 'A driver'} leads · ${lead.wpm} WPM · ${Math.round((lead.pos / Math.max(1, engine.len)) * 100)}%`;

  return (
    <div className="stage-wrap">
      <div className={`stage${engine.field ? ' field spectator' : ''}`} ref={stageRef}>
        <header className="hud">
          <div className="hud-left">
            <div className="pill spectate-pill" title="You are watching: the host does not race">
              <IconEye width={14} height={14} />
              <b>{isHost ? 'HOST · SPECTATING' : 'SPECTATING'}</b>
            </div>
            <div className="pill pos" title={`${engine.hud.total} drivers in this race`}>
              <i>Drivers</i>
              <b>{engine.hud.total}</b>
            </div>
            <DifficultyBadge difficulty={room.race?.difficulty ?? room.difficulty} variant="hud" />
          </div>
          <div className="hud-center">
            <Logo size={13} withIcon={false} />
          </div>
          <div className="hud-right">
            <div className="pill timer">
              <b>{formatTime(engine.hud.elapsedMs)}</b>
            </div>
            <button
              className="icon-btn"
              data-standings-toggle
              onClick={() => setStandingsOpen((v) => !v)}
              aria-pressed={standingsOpen}
              aria-label="Live standings"
              title="Live standings"
            >
              <IconList width={15} height={15} />
            </button>
            {/* the last item of the header, like on every other screen */}
            <MusicToggle variant="hud" />
          </div>
        </header>

        {/* the road shows the five leaders; with a big field (13 or more) it shows every car, in ten lanes */}
        <Track players={room.players} meId={me} lanes={engine.lanes} boomSeq={0} banner={null} overlay={<Countdown stage={stage} />} />

        <div className="spectate-bar" role="status">
          <span className="sb-eye" aria-hidden>
            <IconEye width={20} height={20} />
          </span>
          <div className="sb-text">
            <b>{isHost ? 'You are hosting — watching the race' : 'You are watching this race'}</b>
            <span>{isHost ? line : `${line} · you join the next round`}</span>
          </div>
          {isHost &&
            (confirmEnd ? (
              <div className="sb-confirm" role="alertdialog" aria-label="Confirm end race">
                <span>End the race for everyone? Unfinished drivers become DNF.</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmEnd(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-solid-danger btn-sm"
                  onClick={() => {
                    setConfirmEnd(false);
                    endRace();
                  }}
                >
                  End race
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-danger sb-end" onClick={() => setConfirmEnd(true)}>
                End race now
              </button>
            ))}
        </div>

        {standingsOpen && <Standings players={room.players} meId={me} />}
      </div>
    </div>
  );
}
