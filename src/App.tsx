import { useEffect, useRef, useState } from 'react';
import { ACTIVITIES } from '../shared/activities';
import { music } from './audio/music';
import { prepareSfx } from './audio/sfx';
import { installClickSounds, prepareUiSounds, uiSound } from './audio/ui-sounds';
import { PLATFORM } from './brand';
import { AdminLogin } from './components/AdminLogin';
import { IconX } from './components/Icons';
import { DemoDock } from './demo/DemoDock';
import { FunnyPoseScreen } from './screens/FunnyPose';
import { HubScreen } from './screens/Hub';
import { Landing } from './screens/Landing';
import { Lobby } from './screens/Lobby';
import { MatchResultsScreen } from './screens/MatchResults';
import { PlayingCardsScreen } from './screens/PlayingCards';
import { RaceScreen } from './screens/Race';
import { ResultsScreen } from './screens/Results';
import { SpectatorScreen } from './screens/Spectator';
import { TechTriviaScreen } from './screens/TechTrivia';
import { WelcomeScreen } from './screens/Welcome';
import { startNetworking, useGame } from './store';

function Toasts() {
  const error = useGame((s) => s.error);
  const notice = useGame((s) => s.notice);
  const dismiss = useGame((s) => s.dismiss);
  const msg = error ?? notice;
  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(dismiss, error ? 6000 : 9000);
    return () => window.clearTimeout(t);
  }, [msg, error, dismiss]);
  if (!msg) return null;
  return (
    <div className={`toast${error ? '' : ' info'}`} role="alert">
      <span>{msg}</span>
      <button onClick={dismiss} aria-label="Dismiss">
        <IconX width={14} height={14} />
      </button>
    </div>
  );
}

function ConnectionBanner() {
  const status = useGame((s) => s.status);
  const inRoom = useGame((s) => !!s.room);
  const demo = useGame((s) => s.demo); // the 40-player demo has no connection to lose
  if (!inRoom || status === 'open' || demo) return null;
  return (
    <div role="status" className="conn-banner">
      Connection lost — reconnecting… your progress is safe
    </div>
  );
}

/**
 * When the host takes the room from one game to another (or back to the dashboard) every screen briefly shows a card naming where
 * it is going. It cannot be clicked and never delays anything.
 */
function GameTransition() {
  const activity = useGame((s) => (s.room && s.me ? s.room.activity : null));
  const prev = useRef(activity);
  const [shown, setShown] = useState<{ id: NonNullable<typeof activity>; key: number } | null>(null);
  useEffect(() => {
    const was = prev.current;
    prev.current = activity;
    if (!was || !activity || was === activity) return;
    setShown({ id: activity, key: Date.now() });
    uiSound.whoosh();
    const t = window.setTimeout(() => setShown(null), 1350);
    return () => window.clearTimeout(t);
  }, [activity]);
  if (!shown) return null;
  const game = ACTIVITIES.find((a) => a.id === shown.id);
  return (
    <div key={shown.key} className={`gt ac-${shown.id}`} aria-hidden>
      <div className="gt-title">
        <span>{game ? 'Now starting' : 'Back to the'}</span>
        <b>{game ? game.name : PLATFORM.title}</b>
      </div>
    </div>
  );
}

export default function App() {
  useEffect(() => startNetworking(), []);
  const room = useGame((s) => s.room);
  const me = useGame((s) => s.me);
  const showResults = useGame((s) => s.showResults);
  const entry = useGame((s) => s.entry);

  // Entering a room is the moment to get the race-start sounds ready: the click that got the player here is a gesture, so
  // the browser accepts it.
  const where = room && me ? room.phase : 'landing';
  useEffect(() => {
    if (where !== 'landing') prepareSfx();
  }, [where]);

  // Background music plays only while a TypeDrive race is on this screen — the countdown and the race — and stops for a
  // driver who has finished (their results page), at the end of the race, and everywhere else.
  const raceOn =
    !!room && !!me && room.activity === 'typedrive' && !room.match.ended && (room.phase === 'countdown' || room.phase === 'racing') && !showResults;
  useEffect(() => music.setActive(raceOn), [raceOn]);

  // The small interface sounds (a click on every button, a blip when someone joins): ready on the first gesture, like the music,
  // and silenced by the same speaker button.
  useEffect(() => {
    prepareUiSounds();
    return installClickSounds();
  }, []);
  // The browser tab names where you are: the platform on the dashboard, the game's own name inside a game.
  const gameId = room && me ? room.activity : entry;
  useEffect(() => {
    const game = ACTIVITIES.find((a) => a.id === gameId);
    document.title = `${game ? game.name : PLATFORM.title} · ${PLATFORM.full}`;
  }, [gameId]);
  const roomCode = room?.code ?? null;
  const here = room ? room.players.filter((p) => !p.host && p.connected).length : 0;
  const seen = useRef<{ code: string | null; here: number }>({ code: null, here: 0 });
  useEffect(() => {
    const prev = seen.current;
    // only people arriving while we are already in the room — not the whole roster when we first walk in — and never mid-race
    if (roomCode && prev.code === roomCode && here > prev.here && room?.phase !== 'racing' && room?.phase !== 'countdown') uiSound.join();
    seen.current = { code: roomCode, here };
  }, [roomCode, here, room?.phase]);

  let screen;
  if (!room || !me) {
    // No room yet: the app opens on the Weekly Fun Activity dashboard; opening a game shows the (unchanged) name / host / join page.
    screen = entry ? <Landing /> : <WelcomeScreen />;
  } else if (room.activity === 'hub') {
    screen = <HubScreen />; // the Weekly Fun Activity dashboard: the room's home between games
  } else if (room.activity === 'pose') {
    screen = <FunnyPoseScreen />;
  } else if (room.activity === 'cards') {
    screen = <PlayingCardsScreen />;
  } else if (room.activity === 'trivia') {
    screen = <TechTriviaScreen />;
  } else if (room.match.ended) {
    screen = <MatchResultsScreen />; // the host closed the match: team results and the winner
  } else if (room.phase === 'lobby') {
    screen = <Lobby />;
  } else if (room.phase === 'results') {
    screen = <ResultsScreen />;
  } else {
    // countdown / racing: drivers race; the host (who never races) and anyone who joined mid-race watch
    const racing = room.players.find((p) => p.id === me)?.racing;
    screen = !racing ? <SpectatorScreen /> : showResults ? <ResultsScreen /> : <RaceScreen />;
  }

  return (
    <>
      {screen}
      <GameTransition />
      <ConnectionBanner />
      <DemoDock />
      <AdminLogin />
      <Toasts />
    </>
  );
}
