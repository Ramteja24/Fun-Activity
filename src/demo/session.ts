import { create } from 'zustand';
import type { RoomInfo } from '../../shared/protocol';
import { engine, socket, useGame, type GameState } from '../store';
import { arrivalOrder, DEMO_HOST_ID, DEMO_RACE_ID, DEMO_TEXT, demoDrivers, demoRacers, demoResults, demoRoom, demoViewer, lastFinishMs, type DemoDriver } from './mock';

// The 40-player demo: the real lobby, race and results screens, shown with a make-believe room. While it is open the store holds a
// made-up room (so `App` routes to the real screens as usual), every action the screens call is replaced by a harmless one, the socket
// is muted and the server's messages are ignored. Closing it puts the store back exactly as it was. No connection is made, nothing is
// sent, and no real player record is read or written.

export type DemoTab = 'lobby' | 'race' | 'results';
export type DemoView = 'host' | 'driver';

interface DemoUi {
  open: boolean;
  tab: DemoTab;
  /** Whose screen the race and the results show: the host's (who watches all forty) or a driver's. */
  view: DemoView;
  /** How many drivers are in the lobby so far. */
  joined: number;
  total: number;
  /** Every driver has crossed the line. */
  finished: boolean;
}

export const useDemo = create<DemoUi>(() => ({ open: false, tab: 'lobby', view: 'host', joined: 0, total: 0, finished: false }));

/** How long the 3-2-1 lasts before the demo race starts, and how long the finished race stays up before the results appear. */
const COUNTDOWN_MS = 4300;
const RESULTS_DELAY_MS = 4500;
/** One driver walks into the lobby this often. */
const JOIN_EVERY_MS = 130;

const drivers: DemoDriver[] = demoDrivers();
const resultRows = demoResults(drivers);

let timers: number[] = [];
let ticker: number | undefined;
let saved: Partial<GameState> | null = null;

const stopTimers = () => {
  for (const t of timers) window.clearTimeout(t);
  timers = [];
  if (ticker !== undefined) window.clearInterval(ticker);
  ticker = undefined;
};
const later = (ms: number, fn: () => void) => {
  timers.push(window.setTimeout(fn, ms));
};

const patchRoom = (patch: Partial<RoomInfo>) => useGame.setState((s) => (s.room ? { room: { ...s.room, ...patch } } : {}));

const demoNotice = () => useGame.setState({ notice: 'This is the 40-player demo — that button does nothing here.' });

/** The actions the screens call. In the demo each is either a step through the demo or a harmless notice; none sends anything. */
const REPLACED = ['create', 'join', 'setTeam', 'setDifficulty', 'start', 'endRace', 'backToLobby', 'endMatch', 'newMatch', 'openActivity', 'poseOp', 'triviaOp', 'answer', 'leave', 'kick', 'setEntry'] as const;

/** Whose screen a tab shows. The lobby is always the host's (that is who sets a race up); the race and results can be a driver's. */
const viewerFor = (tab: DemoTab): DemoDriver | null => (tab !== 'lobby' && useDemo.getState().view === 'driver' ? demoViewer(drivers) : null);

function show(tab: DemoTab, opts: { allJoined?: boolean } = {}): void {
  stopTimers();
  const viewer = viewerFor(tab);
  const me = viewer?.id ?? DEMO_HOST_ID;
  engine.reset();
  engine.setIdentity(me, 0);
  useDemo.setState({ tab, finished: false, total: drivers.length });
  useGame.setState({ me, myFinish: null, showResults: false, notice: null, error: null });
  if (tab === 'lobby') showLobby(opts.allJoined === true);
  else if (tab === 'race') showRace(viewer);
  else showResults(viewer);
}

function showLobby(allJoined: boolean): void {
  const order = arrivalOrder(drivers);
  let n = allJoined ? order.length : 0;
  const apply = () => {
    useGame.setState({ room: demoRoom({ phase: 'lobby', present: order.slice(0, n), difficulty: useGame.getState().room?.difficulty ?? 'medium' }) });
    useDemo.setState({ joined: n });
  };
  apply();
  if (n >= order.length) return;
  ticker = window.setInterval(() => {
    n += 1;
    apply();
    if (n >= order.length && ticker !== undefined) {
      window.clearInterval(ticker);
      ticker = undefined;
    }
  }, JOIN_EVERY_MS);
}

function showRace(viewer: DemoDriver | null): void {
  const difficulty = useGame.getState().room?.difficulty ?? 'medium';
  const goAt = socket.serverNow() + COUNTDOWN_MS;
  const room = demoRoom({ phase: 'countdown', present: drivers, difficulty, goAt });
  engine.startRace(room.race!, drivers.map((d) => ({ id: d.id, name: d.name })));
  useGame.setState({ room });
  useDemo.setState({ joined: drivers.length });
  later(COUNTDOWN_MS, () => patchRoom({ phase: 'racing' }));
  const end = lastFinishMs(drivers);
  let viewerDone = false;
  ticker = window.setInterval(() => {
    const raceMs = socket.serverNow() - goAt;
    if (raceMs < 0) return;
    const racers = demoRacers(drivers, raceMs);
    // Driver view: the viewer's car is "typed" along the passage at their pace, so their WPM, the typing bar and the position banners
    // behave as they do for a real driver. (`ack` covers every key, so the made-up state — not these keys — is what decides the place.)
    const mine = viewer ? racers.find((r) => r[0] === viewer.id) : undefined;
    if (mine) for (let n = 0; n < 8 && engine.mePos < mine[1]; n++) engine.handleChar(DEMO_TEXT[engine.mePos] ?? '');
    engine.applyState({ t: 'state', race: DEMO_RACE_ID, ack: viewer ? Number.MAX_SAFE_INTEGER : 0, racers });
    if (viewer && !viewerDone && raceMs >= viewer.finishMs) {
      viewerDone = true;
      const row = resultRows.find((r) => r.id === viewer.id);
      if (row) {
        engine.serverFinish(row);
        useGame.setState({ myFinish: row });
      }
    }
    if (raceMs >= end + 200) {
      if (ticker !== undefined) window.clearInterval(ticker);
      ticker = undefined;
      useDemo.setState({ finished: true });
      // like a real race: once the last driver is home the room moves on to the results
      later(RESULTS_DELAY_MS, () => show('results'));
    }
  }, 100);
}

function showResults(viewer: DemoDriver | null): void {
  const difficulty = useGame.getState().room?.difficulty ?? 'medium';
  const room = demoRoom({ phase: 'results', present: drivers, difficulty, goAt: socket.serverNow() - lastFinishMs(drivers), results: resultRows });
  engine.startRace(room.race!, drivers.map((d) => ({ id: d.id, name: d.name })));
  engine.applyState({ t: 'state', race: DEMO_RACE_ID, ack: 0, racers: demoRacers(drivers, lastFinishMs(drivers) + 1000) });
  const mine = viewer ? (resultRows.find((r) => r.id === viewer.id) ?? null) : null;
  useGame.setState({ room, myFinish: mine, showResults: true });
  useDemo.setState({ joined: drivers.length, finished: true });
}

/** Open the demo. Only from the screens before a room exists (the dashboard and the TypeDrive landing page): it never replaces a real room. */
export function openDemo(): void {
  const g = useGame.getState();
  if (g.room || g.demo) return;
  saved = { entry: g.entry } as Partial<GameState>;
  for (const key of REPLACED) (saved as Record<string, unknown>)[key] = g[key];
  socket.muted = true;
  useGame.setState({
    demo: true,
    entry: 'typedrive',
    busy: false,
    error: null,
    notice: null,
    // the demo's own meaning for the buttons the real screens have
    start: () => show('race'),
    endRace: () => show('results'),
    backToLobby: () => show('lobby', { allJoined: true }),
    setDifficulty: (difficulty) => patchRoom({ difficulty }),
    leave: closeDemo,
    create: demoNotice,
    join: demoNotice,
    setTeam: demoNotice,
    endMatch: demoNotice,
    newMatch: demoNotice,
    openActivity: demoNotice,
    poseOp: demoNotice,
    triviaOp: demoNotice,
    answer: demoNotice,
    kick: demoNotice,
    setEntry: demoNotice,
  });
  useDemo.setState({ open: true, view: 'host', joined: 0, total: drivers.length, finished: false });
  show('lobby');
}

/** Close the demo: back to the screen it was opened from, with every action, the socket and the store as they were. */
export function closeDemo(): void {
  if (!useGame.getState().demo) return;
  stopTimers();
  engine.reset();
  socket.muted = false;
  useDemo.setState({ open: false });
  useGame.setState({
    ...(saved ?? {}),
    demo: false,
    room: null,
    me: null,
    myFinish: null,
    showResults: false,
    busy: false,
    error: null,
    notice: null,
  });
  saved = null;
}

export const showDemoTab = (tab: DemoTab): void => show(tab, { allJoined: true });
export const replayLobby = (): void => show('lobby');
export const restartRace = (): void => show('race');
export function setDemoView(view: DemoView): void {
  useDemo.setState({ view });
  const { tab } = useDemo.getState();
  if (tab !== 'lobby') show(tab);
}
