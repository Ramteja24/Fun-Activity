// Wire protocol shared by the Node server and the React client.
// The client only ever sends *intent* (join, pick a team, start, keystrokes). All scoring is server-side.

import type { ActivityScore, ActivityId, OverallRow, Screen } from './activities';
import type { Difficulty } from './difficulty';
import type { TeamId } from './teams';

/** Default room capacity. The real limit is `RoomConfig.maxPlayers` (env MAX_PLAYERS) and is sent to clients as `RoomInfo.capacity`. */
export const DEFAULT_MAX_PLAYERS = 50;
/** Long enough for the longest real names on the team lists ("Kailashnath Sharma" is 18). */
export const NAME_MAX = 20;
export const ROOM_CODE_LEN = 4;
// No vowels (so a code can never spell a word) and no 0/1/O/I look-alikes: easy to read out over a call.
export const ROOM_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ23456789';

/** Length of one countdown stage (3 → 2 → 1) in the reel, ~1.1 s each. */
export const STAGE_MS = 1100;
export const VEHICLE_TYPES = 5;
/** Colour variants per vehicle type: 5 types × 10 variants = 50 distinct looks, one per seat in a full room. */
export const VEHICLE_VARIANTS = 10;
export const VEHICLE_COUNT = VEHICLE_TYPES * VEHICLE_VARIANTS;

export type Phase = 'lobby' | 'countdown' | 'racing' | 'results';

export interface PlayerInfo {
  id: string;
  name: string;
  /** 0..VEHICLE_COUNT-1. type = v % 5, colour variant = floor(v / 5). */
  vehicle: number;
  connected: boolean;
  host: boolean;
  /** Running room championship total. */
  trophies: number;
  /** Takes part in the current race (late joiners spectate). */
  racing: boolean;
  /**
   * The team this driver chose (they always pick; nobody is assigned one). null for the host, who only watches, and for a
   * driver who has not picked yet — such a driver does not race until they do.
   */
  team: TeamId | null;
}

export interface RaceInfo {
  id: number;
  text: string;
  /** Server-clock epoch ms at which the light turns green. */
  goAt: number;
  /** Difficulty level this race's passage was chosen from. */
  difficulty?: Difficulty;
}

/**
 * The only reasons a racer can end up without a finish time (DNF):
 * - `deadline`: still racing when the race's time limit ran out
 * - `inactive`: another racer had already finished and this one then made no keystroke for the idle limit
 * - `offline`: disconnected longer than the reconnect allowance
 * - `left`: chose to leave mid-race
 * - `ended`: the host ended the race early
 */
export type DnfReason = 'deadline' | 'inactive' | 'offline' | 'left' | 'ended';

export interface ResultRow {
  id: string;
  name: string;
  rank: number;
  finished: boolean;
  /** Present only when `finished` is false. */
  dnfReason?: DnfReason;
  /** 0..1 share of the passage typed. */
  progress: number;
  wpm: number;
  accuracy: number;
  /** Finish time in ms from GO, null for DNF. */
  timeMs: number | null;
  score: number;
  trophies: number;
  /** The racer's team and what this race earned it (100 / 75 / 50 / 30 / 20 / 10 by finishing place, 0 for a DNF). */
  team: TeamId | null;
  teamPoints: number;
}

/** One team's running total for the match. Equal points share a rank (a tie stays a tie). */
export interface TeamStanding {
  id: TeamId;
  name: string;
  points: number;
  rank: number;
  tied: boolean;
}

/** What one driver has earned their team over the match. */
export interface Contribution {
  team: TeamId;
  id: string;
  name: string;
  points: number;
  /** Races they took part in. */
  races: number;
}

export interface MatchInfo {
  /** Races scored so far in this match. Team points carry from race to race and only a new match resets them. */
  races: number;
  ended: boolean;
  /** What the most recent scored race earned each team. */
  last: { raceId: number; gained: Record<TeamId, number> } | null;
  /** Once the match has ended: the team(s) on the most points. More than one means a tie. */
  winners?: TeamId[];
  /** Per-driver contributions (sent after a race and once the match has ended). */
  contributions?: Contribution[];
}

/** Someone on screen: the participant the host picked for a round. */
export interface Named {
  id: string;
  name: string;
}

/**
 * A Funny Pose Challenge round: `pick` — the host chooses a team · `spin` — the spinner is choosing one of its players at random ·
 * `selected` — the spinner has landed and the host can start the round · `ready` — the round has started, the player is on screen
 * and the pose is still hidden · `posing` — the pose is revealed and the player copies it · `judged` — the host has marked it ·
 * `over` — the session is finished.
 */
export type PoseStage = 'pick' | 'spin' | 'selected' | 'ready' | 'posing' | 'judged' | 'over';

/** One finished Funny Pose Challenge round. */
export interface PoseRound {
  round: number;
  poseId: string;
  team: TeamId;
  player: Named;
  completed: boolean;
  points: number;
}

/** The Funny Pose Challenge, as everyone sees it. (Which pose a round uses is withheld until the host reveals it.) */
export interface PoseInfo {
  /** Counts up with every new session, so a screen can tell a fresh one from the one it was showing. */
  session: number;
  stage: PoseStage;
  rounds: number;
  /** 1-based; the round in play (or the last one played, once the session is over). */
  round: number;
  /** The team the host chose for this round, and the player the spinner picked from it (null until then). */
  team: TeamId | null;
  /** Decided by the server the moment the team is chosen; a screen shows it only once the spinner has stopped. */
  player: Named | null;
  /** Everyone who was eligible on the chosen team when the spinner started — the names its reel scrolls through. */
  pool: Named[];
  /** The spinner runs for `spinMs` of the server's clock from `spinStartedAt`, the same on every screen. */
  spinStartedAt: number;
  spinMs: number;
  /** The pose to copy (an id in `shared/poses.ts`): sent only from the reveal on. */
  poseId?: string;
  /** Server-clock time the suggested performing time runs out (while the pose is up). */
  endsAt?: number;
  performMs: number;
  /** From the host's verdict on. */
  result?: 'completed' | 'not_completed';
  gained?: number;
  /** Judged rounds, oldest first. */
  history: PoseRound[];
  /** Funny Pose Challenge team points this session. */
  scores: Record<TeamId, number>;
  /** Rounds each team has played this session. */
  turns: Record<TeamId, number>;
}

export type TriviaStage = 'question' | 'reveal' | 'over';

export interface TriviaQuestionInfo {
  text: string;
  options: string[];
  category: string;
}

export interface TriviaReveal {
  /** Index of the right option. */
  correct: number;
  explanation?: string;
  /** What this question earned each team: TRIVIA_POINTS for the team of the first correct answer, 0 for the others. */
  gained: Record<TeamId, number>;
  /** How many of each team's members answered correctly, out of how many were eligible. */
  tally: Record<TeamId, { correct: number; eligible: number }>;
  /** How many players picked each option. */
  picks: number[];
  /** Whoever answered correctly first (earliest on the server's clock) — the only answer that scores. None if nobody got it right. */
  first?: { id: string; name: string; team: TeamId };
}

export interface TriviaTop {
  id: string;
  name: string;
  team: TeamId;
  points: number;
  correct: number;
}

/** Tech Trivia, as everyone sees it. (The right answer is withheld until the question is revealed.) */
export interface TriviaInfo {
  session: number;
  stage: TriviaStage;
  total: number;
  /** 0-based index of the question in play. */
  index: number;
  question: TriviaQuestionInfo;
  limitMs: number;
  /** Server-clock time the question closes. */
  endsAt: number;
  /** Players who were in the room when the question opened, and how many have answered (not what they chose). */
  eligible: number;
  answered: number;
  answeredByTeam: Record<TeamId, { answered: number; eligible: number }>;
  reveal?: TriviaReveal;
  /** Team points this session. */
  scores: Record<TeamId, number>;
  /** After each revealed question: the points it earned each team. */
  history: { index: number; gained: Record<TeamId, number> }[];
  /** Once the quiz is over: the best individual scores. */
  top?: TriviaTop[];
}

/**
 * Playing Cards — find the joker. ready: face down, waiting for the host · preview: face up, the joker showing · shuffle: the
 * cards are swapped on every screen at once, timed from the server's clock · pick: tap the card the joker is under · reveal:
 * every card turns over · over: the five rounds are done.
 */
export type CardsStage = 'ready' | 'preview' | 'shuffle' | 'pick' | 'reveal' | 'over';

export interface CardsReveal {
  /** Where the joker ended up (a position, 0-based, left to right). */
  joker: number;
  /** How many players picked each position. */
  picks: number[];
  /** What this round earned each team: CARDS_POINTS for the team of the first correct pick, 0 for the others. */
  gained: Record<TeamId, number>;
  /** Whoever picked the joker first (earliest on the server's clock) — the only pick that scores. None if nobody found it. */
  first?: { id: string; name: string; team: TeamId };
}

/** Playing Cards, as everyone sees it. */
export interface CardsInfo {
  session: number;
  stage: CardsStage;
  rounds: number;
  /** 1-based. */
  round: number;
  /** How many cards this round. */
  cards: number;
  /** Where the joker starts. Sent from the preview on (never while the cards are still face down before it). */
  start?: number;
  /** Server-clock end of the preview. */
  previewEndsAt?: number;
  /** The shuffle, sent once it begins: each step swaps the cards at two positions, one step every `swapMs` from `startsAt`. */
  swaps?: [number, number][];
  startsAt?: number;
  swapMs: number;
  /** Players who can pick (on a team, here) and how many have picked (not what). */
  eligible: number;
  picked: number;
  reveal?: CardsReveal;
  /** Team points this session. */
  scores: Record<TeamId, number>;
  /** After each revealed round: the points it earned each team. */
  history: { round: number; gained: Record<TeamId, number> }[];
}

export interface RoomInfo {
  code: string;
  phase: Phase;
  /** Selected TypeDrive difficulty for the room (host-controlled; defaults to 'medium'). */
  difficulty: Difficulty;
  /** Maximum number of drivers this room accepts (the host holds no seat). */
  capacity: number;
  hostId: string;
  players: PlayerInfo[];
  race: RaceInfo | null;
  /** The three teams with their running totals and ranks. */
  teams: TeamStanding[];
  match: MatchInfo;
  /** Present in the results phase. */
  results?: ResultRow[];
  /** What the whole room is showing: the dashboard (`hub`) or one of the activities. The host decides. */
  activity: Screen;
  /** The activities, in play order, each with its status and its own team scores. */
  activities: ActivityScore[];
  /** The overall team leaderboard for the whole fun session (see shared/activities.ts for how it is added up). */
  overall: OverallRow[];
  pose: PoseInfo | null;
  cards: CardsInfo | null;
  trivia: TriviaInfo | null;
}

/** [playerId, position (chars typed correctly), live WPM, finishMs (0 = still racing)] */
export type RacerTuple = [string, number, number, number];

export type ClientMsg =
  /**
   * Only the admin creates rooms: `admin` is their login token (from POST /api/admin/login). `activity` is where the new room
   * opens: the game the admin picked on the dashboard (without it, the in-room dashboard).
   */
  | { t: 'create'; name: string; admin?: string; activity?: Screen }
  /**
   * `team` is required for a new driver (it is ignored when resuming with a token). `admin`: the admin coming back to their
   * room on a new tab or device takes the host's seat again.
   */
  | { t: 'join'; room: string; name: string; token?: string; team?: TeamId; admin?: string }
  /** A driver picks (or changes) their team — in the lobby or on the results page, never during a race. */
  | { t: 'team'; team: TeamId }
  | { t: 'ping'; c: number }
  /** Host only: select the TypeDrive difficulty for upcoming races in this room. */
  | { t: 'difficulty'; difficulty: Difficulty }
  | { t: 'start'; difficulty?: Difficulty }
  | { t: 'k'; s: number; c: string }
  /** Host only: end the running race now (everyone still unfinished becomes DNF). */
  | { t: 'end' }
  | { t: 'lobby' }
  /** Host only: end the match — the team results are declared. */
  | { t: 'match_end' }
  /** Host only: after a match has ended, start a fresh one (team points back to zero; teams stay as picked). */
  | { t: 'match_new' }
  /** Host only: take the whole room to the dashboard or to one of the activities. */
  | { t: 'activity'; activity: Screen }
  /**
   * Host only: run the Funny Pose Challenge. Each round the host picks a `team` — the spinner then picks one of its players at
   * random, the host never chooses the player (`respin` skips someone who is away) — `begin`s the round, `reveal`s the pose, marks
   * it `done` or `notdone`, and goes to the `next` round. `start` begins a session (replacing a finished one) and `reset` throws the
   * current one away.
   */
  | { t: 'pose'; op: 'start' | 'begin' | 'respin' | 'reveal' | 'done' | 'notdone' | 'next' | 'reset' }
  | { t: 'pose'; op: 'team'; team: TeamId }
  /**
   * Host only: run Playing Cards (`start` a session, `show` the joker — the shuffle follows by itself — `reveal` the answer, go to
   * the `next` round, `reset` the session).
   */
  | { t: 'cards'; op: 'start' | 'show' | 'reveal' | 'next' | 'reset' }
  /** A participant picks the card the joker is under in round `round` (1-based); `card` is a position. One pick per round, final. */
  | { t: 'cardpick'; round: number; card: number }
  /** Host only: run Tech Trivia (`start` the quiz, `reveal` the answer now, go to the `next` question). */
  | { t: 'trivia'; op: 'start' | 'reveal' | 'next' | 'reset' }
  /** A participant answers the Tech Trivia question in play (`q` = its index). One answer per question, final. */
  | { t: 'answer'; q: number; choice: number }
  | { t: 'kick'; id: string }
  | { t: 'leave' };

export type PoseCommand = Extract<ClientMsg, { t: 'pose' }>;
export type PoseOp = PoseCommand['op'];
/** The pose operations that take no argument (`team` carries one). */
export const POSE_PLAIN_OPS: readonly PoseOp[] = ['start', 'begin', 'respin', 'reveal', 'done', 'notdone', 'next', 'reset'];
export type TriviaOp = Extract<ClientMsg, { t: 'trivia' }>['op'];
export const TRIVIA_OPS: readonly TriviaOp[] = ['start', 'reveal', 'next', 'reset'];
export type CardsOp = Extract<ClientMsg, { t: 'cards' }>['op'];
export const CARDS_OPS: readonly CardsOp[] = ['start', 'show', 'reveal', 'next', 'reset'];

/** Which activity a message belongs to, for type guards on the client. */
export type { ActivityId, Difficulty };

export type ServerMsg =
  | {
      t: 'joined';
      you: string;
      token: string;
      room: RoomInfo;
      /** Keystroke sequence number the server last saw from this player (resume point). */
      seq: number;
      /** Present if the player already finished the current race. */
      finish?: ResultRow;
    }
  | { t: 'room'; room: RoomInfo }
  | { t: 'pong'; c: number; s: number }
  /** `racers` is sorted by live rank (1st first). `ack` = last keystroke seq processed for the recipient. */
  | { t: 'state'; race: number; racers: RacerTuple[]; ack: number }
  | { t: 'finish'; row: ResultRow }
  | { t: 'error'; code: ErrorCode; msg: string }
  | { t: 'kicked' };

export type ErrorCode =
  | 'bad_request'
  | 'no_room'
  | 'room_full'
  | 'name_taken'
  | 'bad_name'
  | 'bad_team'
  | 'too_many_rooms'
  | 'not_admin'
  | 'host_present';
