import { useCallback, useEffect, useRef, useState } from 'react';
import { Hud } from '../components/race/Hud';
import { Banner, Countdown, FinishCard, SpeedLines } from '../components/race/Overlays';
import { Speedometer } from '../components/race/Speedometer';
import { Standings } from '../components/race/Standings';
import { Track } from '../components/race/Track';
import { TypingBar } from '../components/race/TypingBar';
import { countdownAudio } from '../audio/sfx';
import { useCountdown, useEngine, useStageSizing } from '../game/hooks';
import { engine, useGame } from '../store';

export function RaceScreen() {
  useEngine();
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me)!;
  const myFinish = useGame((s) => s.myFinish);
  const setShowResults = useGame((s) => s.setShowResults);
  const stageRef = useRef<HTMLDivElement>(null);
  const [standingsOpen, setStandingsOpen] = useState(false);
  useStageSizing(stageRef);
  const closeStandings = useCallback(() => setStandingsOpen(false), []);

  // ~10 Hz: HUD numbers, rank-change banners, lane assignment.
  useEffect(() => {
    const id = window.setInterval(() => engine.tick(), 100);
    return () => window.clearInterval(id);
  }, []);

  // Let the victory pop-up have its moment, then go to the results page.
  useEffect(() => {
    if (!myFinish) return;
    const t = window.setTimeout(() => setShowResults(true), 2800);
    return () => window.clearTimeout(t);
  }, [myFinish, setShowResults]);

  const stage = useCountdown(engine.goAt);
  const typing = (room.phase === 'countdown' || room.phase === 'racing') && !engine.localFinish;

  // Race-start sounds, scheduled once per race from the same server-clock goAt that drives the lights above. Sound never
  // feeds back into the race: leaving this screen (or muting) just silences whatever has not played yet.
  const { raceId, goAt, active } = engine;
  useEffect(() => {
    if (!active || !goAt) return;
    return countdownAudio.begin(`${raceId}@${goAt}`, goAt);
  }, [active, raceId, goAt]);

  return (
    <div className="stage-wrap">
      <div className={`stage${engine.field ? ' field' : ''}`} ref={stageRef}>
        <Hud
          hud={engine.hud}
          difficulty={room.race?.difficulty ?? room.difficulty}
          standingsOpen={standingsOpen}
          field={engine.field}
          onStandings={() => setStandingsOpen((v) => !v)}
        />
        <Track
          players={room.players}
          meId={me}
          lanes={engine.lanes}
          boomSeq={engine.boomSeq}
          banner={<Banner banner={engine.banner} />}
          overlay={
            <>
              <SpeedLines wpm={engine.hud.wpm} racing={room.phase === 'racing' && !engine.localFinish} />
              <Countdown stage={stage} />
            </>
          }
        />
        <TypingBar
          text={engine.text}
          pos={engine.mePos}
          error={engine.errorFlash}
          flashWord={engine.wordFlash}
          enabled={typing}
          onChar={(c) => engine.handleChar(c)}
        />
        <Speedometer wpm={engine.hud.wpm} />
        {standingsOpen && <Standings players={room.players} meId={me} onClose={closeStandings} />}
        {myFinish && <FinishCard row={myFinish} />}
      </div>
    </div>
  );
}
