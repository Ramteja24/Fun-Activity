import { mock } from 'node:test';
import { defaultConfig, type RoomConfig } from '../../server/config';
import { PASSAGES } from '../../server/passages';
import { Room, type Conn, type Player } from '../../server/room';
import type { Phase, ResultRow, RoomInfo, ServerMsg } from '../../shared/protocol';
import type { Screen } from '../../shared/activities';
import { TEAM_IDS, type TeamId } from '../../shared/teams';

/**
 * A connection that just records what the server sends. `retainAll: false` keeps only the latest message of each type —
 * enough for `last()` and for big rooms (35 racers × minutes of 10 Hz state broadcasts would otherwise fill memory).
 */
export class FakeConn implements Conn {
  msgs: ServerMsg[] = [];
  closed = false;
  private readonly latest = new Map<string, ServerMsg>();
  constructor(private readonly retainAll = true) {}
  send(m: ServerMsg) {
    if (this.retainAll) this.msgs.push(m);
    this.latest.set(m.t, m);
  }
  close() {
    this.closed = true;
  }
  last<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }> | undefined {
    return this.latest.get(t) as Extract<ServerMsg, { t: T }> | undefined;
  }
  /** Latest room snapshot this client has been sent. */
  get room(): RoomInfo | undefined {
    return this.last('room')?.room;
  }
}

/**
 * Drives the real `Room` with *virtual* time (node:test mock timers), so a 2-minute race runs in milliseconds and
 * timing-dependent behaviour (idle/offline/deadline rules) is fully deterministic.
 */
export class Sim {
  readonly room: Room;
  readonly t0 = 1_000_000;
  readonly entries = new Map<string, { p: Player; conn: FakeConn }>();

  constructor(
    cfg: Partial<RoomConfig> = {},
    passageIndex = 8,
    private readonly lean = false,
    opts: { /** Where the host takes the room first: TypeDrive by default, null = stay on the dashboard. */ activity?: Screen | null; /** A real random source (the default is pinned, for the passage). */ rand?: () => number } = {},
  ) {
    const activity = opts.activity === undefined ? 'typedrive' : opts.activity;
    mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: this.t0 });
    // Pin the passage: index 8 is the shipped ~345-character "Fresh snow covered the mountain village…" text.
    const rand = opts.rand ?? (() => (passageIndex + 0.5) / PASSAGES.length);
    this.room = new Room('TEST', { ...defaultConfig, ...cfg }, () => Date.now(), rand);
    // The admin creates the room and is its host; the host only watches. Every Sim therefore starts with a spectating host,
    // so `join(name)` below always adds a *driver* — the same people the tests have always raced.
    this.join(Sim.HOST, undefined, true);
    // A new room opens on the activity dashboard; these simulations are about TypeDrive, so the host goes straight there.
    // (Pass `activity: null` to stay on the dashboard.)
    if (activity !== null) this.room.setActivity(this.room.hostId, activity);
  }

  /** The room's creator: hosts and watches, never races. */
  static readonly HOST = 'Host';

  now() {
    return Date.now();
  }
  get phase(): Phase {
    return this.room.phase;
  }
  get goAt(): number {
    return this.room.race!.goAt;
  }
  get text(): string {
    return this.room.race!.text;
  }
  /** Seconds since GO of the current race. */
  get t(): number {
    return (this.now() - this.goAt) / 1000;
  }

  /** A driver joins and picks a team: `team` if given, otherwise they spread over the three teams in order (the host has none). */
  join(name: string, team?: TeamId, asHost = false) {
    const conn = new FakeConn(!this.lean);
    const picked = team ?? TEAM_IDS[this.entries.size === 0 ? 0 : (this.entries.size - 1) % TEAM_IDS.length]!;
    const r = this.room.join(name, conn, undefined, picked, asHost);
    if (!r.ok) throw new Error(`join failed: ${r.msg}`);
    this.entries.set(name, { p: r.player, conn });
    return this.entries.get(name)!;
  }
  get(name: string) {
    return this.entries.get(name)!;
  }

  /** Socket dropped (Wi-Fi blip, phone locked…). */
  disconnect(name: string) {
    const e = this.get(name);
    this.room.disconnect(e.p, e.conn);
  }
  /** The same person comes back with their saved token. */
  reconnect(name: string) {
    const e = this.get(name);
    const conn = new FakeConn(!this.lean);
    const r = this.room.join('ignored', conn, e.p.token);
    if (!r.ok) throw new Error(`rejoin failed: ${r.msg}`);
    e.conn = conn;
    this.room.broadcastRoom();
    return conn;
  }

  /** The host presses Start (`hostName` defaults to the room's current host; a driver's name is not a host and is ignored). */
  start(hostName?: string) {
    const asHost = hostName !== undefined && this.get(hostName)?.p.id === this.room.hostId;
    return this.room.start(asHost ? this.get(hostName!).p.id : this.room.hostId);
  }

  advance(ms: number) {
    for (let left = ms; left > 0; left -= 10) mock.timers.tick(Math.min(10, left));
  }
  /** Run the countdown so the light turns green. */
  advanceToGo() {
    this.advance(Math.max(0, this.goAt - this.now()) + 1);
  }

  /** Advance virtual time to `seconds` after GO while the given typists type. */
  runUntil(seconds: number, typists: Typist[]) {
    this.run(this.goAt + seconds * 1000 - this.now(), typists);
  }
  /** Advance virtual time by `ms` while the given typists type. */
  run(ms: number, typists: Typist[]) {
    for (let left = ms; left > 0; left -= 10) {
      for (const t of typists) t.step();
      mock.timers.tick(Math.min(10, left));
    }
  }

  /** Last known (pos, wpm, finishMs) of `name` as broadcast by the server. */
  stateOf(observer: string, name: string) {
    const st = this.get(observer).conn.last('state');
    const id = this.get(name).p.id;
    const tuple = st?.racers.find((r) => r[0] === id);
    return tuple ? { pos: tuple[1], wpm: tuple[2], finMs: tuple[3] } : undefined;
  }
  finishRow(name: string): ResultRow | undefined {
    return this.get(name).conn.last('finish')?.row;
  }
  results(observer: string): ResultRow[] | undefined {
    return this.get(observer).conn.room?.results;
  }
  row(observer: string, name: string): ResultRow | undefined {
    return this.results(observer)?.find((r) => r.name === name);
  }

  destroy() {
    this.room.dispose();
    mock.timers.reset();
  }
}

export interface TypistOpts {
  /** Milliseconds per correct character (12000 / WPM). */
  msPerChar: number;
  /** Stop for good after this many characters (an idle / AFK player). */
  stopAfter?: number;
  /** Insert one wrong key before every Nth character. */
  typoEvery?: number;
  /**
   * A network stall: keys typed in [holdFrom, holdUntil) (seconds after GO) are not delivered until `holdUntil`,
   * then arrive as a paced backlog (30 ms apart, like the client's reconnect flush).
   */
  hold?: { from: number; until: number };
}

/** A deterministic human: sends one key every `msPerChar`, starting `msPerChar` after GO. */
export class Typist {
  private seq = 0;
  private idx = 0;
  private nextAt: number;
  private pendingTypo = false;
  private queue: { seq: number; ch: string }[] = [];
  private nextFlushAt = 0;
  paused = false;
  stopAfter: number | undefined;

  constructor(
    private readonly sim: Sim,
    private readonly name: string,
    private readonly opts: TypistOpts,
  ) {
    this.nextAt = sim.goAt + opts.msPerChar;
    this.stopAfter = opts.stopAfter;
    // Like the real client, keystroke numbers keep counting up across races: continue from what the server last saw.
    this.seq = sim.get(name).p.lastSeq;
  }

  /** Characters typed so far (typed, not necessarily delivered). */
  get typed() {
    return this.idx;
  }

  private deliver(seq: number, ch: string) {
    this.sim.room.key(this.sim.get(this.name).p, seq, ch);
  }

  /** Type the next `n` correct characters right now (manual, irregular typing — keep n small, a burst is not human). */
  typeNow(n = 1) {
    const text = this.sim.text;
    for (let i = 0; i < n && this.idx < text.length; i++) this.deliver(++this.seq, text[this.idx++]!);
  }

  /** Come back from `stopAfter`/AFK and carry on typing at the normal pace. */
  resume() {
    this.stopAfter = undefined;
    this.nextAt = this.sim.now() + this.opts.msPerChar;
  }

  step() {
    const text = this.sim.text;
    const now = this.sim.now();
    const hold = this.opts.hold;
    const holding = !!hold && now >= this.sim.goAt + hold.from * 1000 && now < this.sim.goAt + hold.until * 1000;

    // Drain a delivery backlog (after a stall) at 33 keys/s, in order.
    if (!holding && this.queue.length > 0 && now >= this.nextFlushAt) {
      const k = this.queue.shift()!;
      this.deliver(k.seq, k.ch);
      this.nextFlushAt = now + 30;
    }

    // A person who was paused/AFK resumes at their normal pace — they do not "catch up" with a burst of keys.
    if (this.paused) {
      this.nextAt = now + this.opts.msPerChar;
      return;
    }
    while (this.idx < text.length && this.nextAt <= now) {
      if (this.stopAfter !== undefined && this.idx >= this.stopAfter) {
        this.nextAt = now + this.opts.msPerChar;
        return;
      }
      let ch: string;
      if (this.opts.typoEvery && this.idx > 0 && this.idx % this.opts.typoEvery === 0 && !this.pendingTypo) {
        this.pendingTypo = true;
        ch = text[this.idx] === 'q' ? 'z' : 'q'; // a wrong key
      } else {
        this.pendingTypo = false;
        ch = text[this.idx]!;
        this.idx += 1;
      }
      const seq = ++this.seq;
      if (holding || this.queue.length > 0) this.queue.push({ seq, ch });
      else this.deliver(seq, ch);
      this.nextAt += this.opts.msPerChar;
    }
  }
}
