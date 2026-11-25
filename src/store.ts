import { create } from 'zustand';
import type { ActivityId, Screen } from '../shared/activities';
import { normalizeRoomCode } from '../shared/game';
import type { PoseCommand, ResultRow, RoomInfo, ServerMsg, TriviaOp } from '../shared/protocol';
import type { Difficulty } from '../shared/difficulty';
import type { TeamId } from '../shared/teams';
import { RaceEngine } from './game/engine';
import { GameSocket, type ConnStatus } from './net/socket';

interface Session {
  room: string;
  token: string;
  name: string;
}

const SESSION_KEY = 'typedrive.session.v1';
/** Older builds remembered the last name in localStorage and pre-filled it. Names are never stored or restored now. */
const LEGACY_NAME_KEY = 'typedrive.name';
try {
  localStorage.removeItem(LEGACY_NAME_KEY);
} catch {
  /* storage unavailable — nothing to clean */
}

// sessionStorage is per-tab: refreshing resumes your racer, a second tab is a second player.
function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s && typeof s.room === 'string' && typeof s.token === 'string' ? s : null;
  } catch {
    return null;
  }
}
function saveSession(s: Session): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* private mode etc. — resume just won't work */
  }
}
function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

// What this tab answered in Tech Trivia ("session:question" → option). The server keeps one final answer per player and
// never tells anyone what others picked, so the tab remembers its own pick to show it again at the reveal (and after a refresh).
const ANSWERS_KEY = 'typedrive.answers.v1';
function loadAnswers(room: string): Record<string, number> {
  try {
    const raw = JSON.parse(sessionStorage.getItem(ANSWERS_KEY) ?? 'null') as { room: string; picks: Record<string, number> } | null;
    return raw && raw.room === room && raw.picks && typeof raw.picks === 'object' ? raw.picks : {};
  } catch {
    return {};
  }
}
function saveAnswers(room: string, picks: Record<string, number>): void {
  try {
    sessionStorage.setItem(ANSWERS_KEY, JSON.stringify({ room, picks }));
  } catch {
    /* private mode — the pick just is not remembered across a refresh */
  }
}
export const answerKey = (session: number, q: number) => `${session}:${q}`;

// The admin login (the only account that creates rooms and hosts the games). Kept per browser until "Log out", or until the
// server stops accepting it (expired, or the password was changed with `npm run admin`).
export interface AdminSession {
  token: string;
  username: string;
}
const ADMIN_KEY = 'typedrive.admin.v1';
function loadAdmin(): AdminSession | null {
  try {
    const a = JSON.parse(localStorage.getItem(ADMIN_KEY) ?? 'null') as AdminSession | null;
    return a && typeof a.token === 'string' && typeof a.username === 'string' ? a : null;
  } catch {
    return null;
  }
}
function saveAdmin(a: AdminSession | null): void {
  try {
    if (a) localStorage.setItem(ADMIN_KEY, JSON.stringify(a));
    else localStorage.removeItem(ADMIN_KEY);
  } catch {
    /* storage unavailable — the login just lasts for this page */
  }
}

/** A Funny Pose Challenge host action: a plain step, or choosing the team (the host never chooses the player). */
export type PoseAction = { op: Exclude<PoseCommand['op'], 'team'> } | { op: 'team'; team: TeamId };

/** A shared invite link names a room, so whoever opens it goes straight to "join" instead of the activity dashboard. */
function openedWithInviteLink(): boolean {
  try {
    return !!normalizeRoomCode(new URLSearchParams(location.search).get('room'));
  } catch {
    return false;
  }
}

export interface GameState {
  status: ConnStatus;
  me: string | null;
  room: RoomInfo | null;
  /**
   * Before there is a room: which game the person opened on the Weekly Fun Activity dashboard. null = still on the dashboard
   * (what the app opens on); a game = the name / host / join page for it. A new room opens in that game.
   */
  entry: ActivityId | null;
  /** My own Tech Trivia picks, by `answerKey`. */
  myAnswers: Record<string, number>;
  /** Private result row, set the moment the server confirms we crossed the line. */
  myFinish: ResultRow | null;
  /** Race screen → results page once the victory pop-up has had its moment. */
  showResults: boolean;
  error: string | null;
  notice: string | null;
  busy: boolean;
  /** The 40-player demo is showing (src/demo): the screens read made-up data, nothing is sent and nothing from the server is used. */
  demo: boolean;
  /** Logged in as the admin (null: a player — they can only join rooms). */
  admin: AdminSession | null;
  /** The admin login dialog is open. */
  loginOpen: boolean;
  setLoginOpen(open: boolean): void;
  /** Log in as the admin. Resolves to an error message, or null when it worked. */
  login(username: string, password: string): Promise<string | null>;
  logout(): void;
  /** Open a game from the dashboard (shows its name / host / join page), or go back to the dashboard with null. */
  setEntry(entry: ActivityId | null): void;
  create(name: string): void;
  /** A driver always picks their team when joining. */
  join(code: string, name: string, team: TeamId): void;
  /** Pick or change my team (in the lobby or on the results page; the server refuses it mid-race). */
  setTeam(team: TeamId): void;
  /** Host: select the TypeDrive difficulty for upcoming races in this room. */
  setDifficulty(difficulty: Difficulty): void;
  start(difficulty?: Difficulty): void;
  /** Host: end the running race now. */
  endRace(): void;
  backToLobby(): void;
  /** Host: end the match — the team results are declared. */
  endMatch(): void;
  /** Host: after a match has ended, start a new one (team points back to zero). */
  newMatch(): void;
  /** Host: take the whole room to the dashboard or to one of the three activities. */
  openActivity(activity: Screen): void;
  /** Host: run the Funny Pose Challenge (choose a team, start the round, reveal, mark, next…) / Tech Trivia. */
  poseOp(cmd: PoseAction): void;
  triviaOp(op: TriviaOp): void;
  /** Answer the Tech Trivia question in play; one answer per question, and it is final. */
  answer(q: number, choice: number): void;
  leave(): void;
  kick(id: string): void;
  setShowResults(v: boolean): void;
  dismiss(): void;
}

const wsUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

export const socket: GameSocket = new GameSocket(wsUrl(), {
  onMessage: (m) => onMessage(m),
  onStatus: (s) => onStatus(s),
});

export const engine = new RaceEngine({ send: (m) => socket.send(m), now: () => socket.serverNow() });

let pending: { name: string } | null = null;
let resuming = false;

export const useGame = create<GameState>((set, get) => ({
  status: 'connecting',
  me: null,
  room: null,
  entry: openedWithInviteLink() ? 'typedrive' : null,
  myAnswers: {},
  myFinish: null,
  showResults: false,
  error: null,
  notice: null,
  busy: false,
  demo: false,
  admin: loadAdmin(),
  loginOpen: false,

  setLoginOpen(loginOpen) {
    set({ loginOpen });
  },
  async login(username, password) {
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const body = (await res.json().catch(() => ({}))) as { token?: string; username?: string; error?: string };
      if (!res.ok || !body.token) return body.error ?? 'Could not log in. Try again.';
      const admin = { token: body.token, username: body.username ?? username };
      saveAdmin(admin);
      set({ admin, loginOpen: false, notice: `Logged in as ${admin.username}. You can create rooms and run the games.` });
      return null;
    } catch {
      return 'Cannot reach the game server. Check the connection and try again.';
    }
  },
  logout() {
    saveAdmin(null);
    set({ admin: null, entry: null, notice: 'Logged out. You can still join rooms as a player.' });
  },

  setEntry(entry) {
    set({ entry, error: null });
  },
  create(name) {
    pending = { name };
    set({ busy: true, error: null, notice: null });
    const activity = get().entry;
    // The room opens in the game that was picked on the dashboard: TypeDrive → its lobby, the others → their start screen.
    const admin = get().admin;
    if (!admin) return fail('Only the admin can create a room. Log in as the admin first.');
    if (!socket.send({ t: 'create', name, admin: admin.token, ...(activity ? { activity } : {}) })) fail('Not connected yet — one moment…');
  },
  join(code, name, team) {
    pending = { name };
    set({ busy: true, error: null, notice: null });
    // the admin opening their own room on another tab or device comes back as its host
    const admin = get().admin;
    if (!socket.send({ t: 'join', room: code, name, team, ...(admin ? { admin: admin.token } : {}) })) fail('Not connected yet — one moment…');
  },
  setTeam(team) {
    socket.send({ t: 'team', team });
  },
  setDifficulty(difficulty) {
    socket.send({ t: 'difficulty', difficulty });
  },
  start(difficulty) {
    socket.send(difficulty ? { t: 'start', difficulty } : { t: 'start' });
  },
  endRace() {
    socket.send({ t: 'end' });
  },
  backToLobby() {
    socket.send({ t: 'lobby' });
  },
  endMatch() {
    socket.send({ t: 'match_end' });
  },
  newMatch() {
    socket.send({ t: 'match_new' });
  },
  openActivity(activity) {
    socket.send({ t: 'activity', activity });
  },
  poseOp(cmd) {
    socket.send({ t: 'pose', ...cmd } as PoseCommand);
  },
  triviaOp(op) {
    socket.send({ t: 'trivia', op });
  },
  answer(q, choice) {
    const { room, myAnswers } = get();
    const trivia = room?.trivia;
    if (!room || !trivia || trivia.stage !== 'question' || trivia.index !== q) return;
    const key = answerKey(trivia.session, q);
    if (key in myAnswers) return; // final
    const picks = { ...myAnswers, [key]: choice };
    saveAnswers(room.code, picks);
    set({ myAnswers: picks });
    socket.send({ t: 'answer', q, choice });
  },
  leave() {
    pending = null;
    resuming = false;
    socket.send({ t: 'leave' });
    clearSession();
    engine.reset();
    history.replaceState(null, '', location.pathname);
    set({ room: null, me: null, entry: null, myAnswers: {}, myFinish: null, showResults: false, busy: false, error: null, notice: null });
  },
  kick(id) {
    socket.send({ t: 'kick', id });
  },
  setShowResults(v) {
    if (get().showResults !== v) set({ showResults: v });
  },
  dismiss() {
    set({ error: null, notice: null });
  },
}));

function fail(msg: string) {
  useGame.setState({ busy: false, error: msg });
}

function onStatus(status: ConnStatus) {
  useGame.setState({ status });
  if (status === 'open') {
    // (Re)connected: resume the racer we were, if this tab had one.
    const s = loadSession();
    if (s && !pending && !useGame.getState().demo) {
      resuming = true;
      const admin = useGame.getState().admin;
      socket.send({ t: 'join', room: s.room, name: s.name, token: s.token, ...(admin ? { admin: admin.token } : {}) });
    }
  }
}

function applyRoom(room: RoomInfo) {
  const prev = useGame.getState().room;
  if (room.phase === 'lobby') {
    engine.reset();
    useGame.setState({ myFinish: null, showResults: false });
  } else if (room.race && (!prev?.race || prev.race.id !== room.race.id || !engine.active)) {
    engine.startRace(
      room.race,
      room.players.filter((p) => p.racing).map((p) => ({ id: p.id, name: p.name })),
    );
    if (!prev?.race || prev.race.id !== room.race.id) useGame.setState({ myFinish: null, showResults: false });
  }
  for (const p of room.players) engine.names.set(p.id, p.name);
  useGame.setState({ room });
}

function onMessage(m: ServerMsg) {
  if (useGame.getState().demo) return; // the demo shows made-up data only: a real room's messages are not used while it is open
  switch (m.t) {
    case 'joined': {
      const name = pending?.name ?? loadSession()?.name ?? '';
      pending = null;
      resuming = false;
      saveSession({ room: m.room.code, token: m.token, name: m.room.players.find((p) => p.id === m.you)?.name ?? name });
      engine.setIdentity(m.you, m.seq);
      useGame.setState({ me: m.you, busy: false, error: null, myAnswers: loadAnswers(m.room.code) });
      applyRoom(m.room);
      useGame.setState({ myFinish: m.finish ?? null });
      if (m.finish) engine.serverFinish(m.finish);
      history.replaceState(null, '', `?room=${m.room.code}`);
      break;
    }
    case 'room':
      if (!useGame.getState().me) break;
      applyRoom(m.room);
      break;
    case 'state':
      if (!useGame.getState().me) break;
      engine.applyState(m);
      break;
    case 'finish':
      if (!useGame.getState().me) break;
      engine.serverFinish(m.row);
      useGame.setState({ myFinish: m.row });
      break;
    case 'error':
      if (m.code === 'no_room' && resuming) {
        // The room we were in has been closed (server restart / idle). Back to the start screen.
        clearSession();
        resuming = false;
        engine.reset();
        useGame.setState({ room: null, me: null, entry: null, myAnswers: {}, busy: false, notice: 'Your previous room has closed. Create or join a new one.' });
        history.replaceState(null, '', location.pathname);
      } else {
        if (m.code === 'not_admin' && useGame.getState().admin) {
          // the server no longer accepts this login (expired, or the password changed): log out
          saveAdmin(null);
          useGame.setState({ admin: null });
        }
        pending = null;
        resuming = false;
        fail(m.msg);
      }
      break;
    case 'kicked':
      clearSession();
      engine.reset();
      history.replaceState(null, '', location.pathname);
      useGame.setState({ room: null, me: null, entry: null, myAnswers: {}, myFinish: null, showResults: false, notice: 'The host removed you from the room.' });
      break;
    default:
  }
}

export function startNetworking() {
  socket.start();
  // A remembered admin login is checked once: one the server no longer accepts is forgotten.
  const admin = useGame.getState().admin;
  if (admin) {
    fetch('/api/admin/session', { headers: { Authorization: `Bearer ${admin.token}` } })
      .then((r) => r.json() as Promise<{ admin?: boolean }>)
      .then((r) => {
        if (r.admin === false && useGame.getState().admin?.token === admin.token) {
          saveAdmin(null);
          useGame.setState({ admin: null, notice: 'Your admin login has expired. Log in again to host.' });
        }
      })
      .catch(() => {});
  }
}
