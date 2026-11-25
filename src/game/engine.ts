import { liveWpm } from '../../shared/game';
import { FIELD_FROM } from './field';
import type { ClientMsg, RaceInfo, ResultRow, ServerMsg } from '../../shared/protocol';

export interface Racer {
  id: string;
  /** Last authoritative position from the server (chars typed correctly). */
  pos: number;
  /** Smoothed on-screen position (lerps toward pos). */
  disp: number;
  wpm: number;
  /** Finish ms from GO, 0 while racing. */
  fin: number;
  /** Rank order index from the server (0 = leading). */
  order: number;
}

export interface Banner {
  id: number;
  kind: 'lead' | 'gain' | 'lost';
  title: string;
  sub: string;
}

export interface HudState {
  wpm: number;
  rank: number;
  total: number;
  elapsedMs: number;
  progress: number;
  finished: boolean;
}

export type CharResult = 'ok' | 'wrong' | 'ignored';

interface IO {
  send(m: ClientMsg): boolean;
  now(): number;
}

const ease = (dt: number, rate: number) => 1 - Math.exp(-rate * dt);

/** Gap between keystrokes while re-sending a backlog after a reconnect (≈ 33/s, safely under the server's 40/s limit). */
const FLUSH_GAP_MS = 30;

/**
 * Client-side race model. Typing is *predicted* locally for instant feedback, but the server is the
 * authority: every state message carries an `ack`, we rebuild our position as
 * (server position + still-unacknowledged keystrokes), so a dropped/ignored key can never desync us.
 * Scores, ranks and finish times shown at the end all come from the server.
 */
export class RaceEngine {
  meId = '';
  raceId = 0;
  text = '';
  goAt = 0;
  active = false;
  names = new Map<string, string>();

  // local racer
  mePos = 0;
  private seq = 0;
  /**
   * Every keystroke the server has not acknowledged yet, in order — including ones never sent because the socket
   * was down. Keys are only dropped from here when the server acks them, so a blip can never lose typing.
   */
  private pending: { s: number; c: string }[] = [];
  /** Highest seq handed to the socket on the current connection (reset to the server's view on every rejoin). */
  private sentUpTo = 0;
  private pumpTimer: ReturnType<typeof setTimeout> | null = null;
  private keyTimes: number[] = [];
  localFinish = false;
  myFinMs = 0;
  private myFinWpm = 0;
  wrongUntil = 0;
  flashWord = -1;
  private flashUntil = 0;

  // everyone
  racers = new Map<string, Racer>();
  /** Lane 0 is always the local player (as in the reel); lanes 1-4 the closest rivals. A spectator has no car: the five leaders. */
  lanes: (string | null)[] = [null, null, null, null, null];
  /**
   * Every racer, in the order they were dealt into the race (the server's order at the start; anyone who turns up later goes on the end).
   * With a big field (see `field`) this is the lane list: each racer keeps one fixed place on the road all race, so cars never hop.
   */
  private fieldIds: string[] = [];
  /** The camera zoom the track's zoom buttons set (1 = the normal view; a spectator's 1 fits the whole field). Presentation only. */
  zoom = 1;
  /**
   * With a big field a driver can look at the whole field ("Overview", the default) or follow their own car ("Driver focus"). The camera is
   * the only thing this changes: nothing about the race does. (The host, who has no car, always has the whole field.)
   */
  overview = true;
  /** Where a spectator's camera looks (characters): the leader. Racers' cameras follow their own car. */
  private specCam = 0;
  /** How far (characters, smoothed) the last car on screen trails the leader: the spectator's road zooms out to keep them all in view. */
  private specSpan = 0;
  /** Where the leader sits on a spectator's road (fraction of its width): the spectator screen moves it left of the standings panel while that is open. */
  spectatorAnchor = 0.8;

  // presentation
  wpmSmooth = 0;
  /** Where the local car sits on screen (fraction of width) when stationary; set from the stage size. */
  baseAnchor = 0.3;
  anchor = 0.3;
  scroll = 0;
  hud: HudState = { wpm: 0, rank: 1, total: 1, elapsedMs: 0, progress: 0, finished: false };
  banner: Banner | null = null;
  boomSeq = 0;
  version = 0;

  private bannerSeq = 0;
  private lastRank = 0;
  private announced = 0;
  private stableSince = 0;
  private lastBannerAt = -Infinity;
  private tickCount = 0;
  private listeners = new Set<() => void>();
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly io: IO) {}

  // ------------------------------------------------------------ subscription (React)
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = (): number => this.version;
  private bump(): void {
    this.version += 1;
    for (const fn of this.listeners) fn();
  }

  // ------------------------------------------------------------ lifecycle
  reset(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    if (this.pumpTimer) clearTimeout(this.pumpTimer);
    this.pumpTimer = null;
    this.active = false;
    this.raceId = 0;
    this.text = '';
    this.mePos = 0;
    this.pending = [];
    this.sentUpTo = this.seq;
    this.keyTimes = [];
    this.localFinish = false;
    this.myFinMs = 0;
    this.myFinWpm = 0;
    this.wrongUntil = 0;
    this.flashWord = -1;
    this.racers.clear();
    this.fieldIds = [];
    this.zoom = 1;
    this.overview = true;
    this.lanes = [null, null, null, null, null];
    this.wpmSmooth = 0;
    this.anchor = this.baseAnchor;
    this.scroll = 0;
    this.banner = null;
    this.lastRank = 0;
    this.announced = 0;
    this.stableSince = 0;
    this.lastBannerAt = -Infinity;
    this.hud = { wpm: 0, rank: 1, total: 1, elapsedMs: 0, progress: 0, finished: false };
    this.bump();
  }

  /**
   * Called on every (re)join. `serverSeq` is the last keystroke the server has actually processed for us, so
   * everything after it — typed while offline, or in flight when the socket died — is re-sent, in order.
   */
  setIdentity(id: string, serverSeq: number): void {
    if (id !== this.meId) {
      this.pending = []; // a different player: nothing carries over
      this.seq = 0;
    }
    this.meId = id;
    this.seq = Math.max(this.seq, serverSeq);
    this.pending = this.pending.filter((k) => k.s > serverSeq);
    this.sentUpTo = serverSeq;
    if (this.pumpTimer) clearTimeout(this.pumpTimer);
    this.pumpTimer = null;
    this.pump();
  }

  startRace(race: RaceInfo, racers: { id: string; name: string }[]): void {
    this.reset();
    this.raceId = race.id;
    this.text = race.text;
    this.goAt = race.goAt;
    this.active = true;
    racers.forEach((p, i) => {
      this.names.set(p.id, p.name);
      this.racers.set(p.id, { id: p.id, pos: 0, disp: 0, wpm: 0, fin: 0, order: i });
      this.fieldIds.push(p.id);
    });
    this.assignLanes();
    this.tick();
  }

  /**
   * A big grid: from FIELD_FROM racers up the road draws a car for every one of them (ten lanes, several cars to a lane) instead of
   * the five closest or leading. Which racers there are comes from the server only; nothing about the race changes.
   */
  get field(): boolean {
    return this.active && this.racers.size >= FIELD_FROM;
  }

  /** Server finished the race for us (private `finish` message). */
  serverFinish(row: ResultRow): void {
    this.myFinMs = row.timeMs ?? 0;
    this.myFinWpm = row.wpm;
    this.localFinish = true;
    this.mePos = this.text.length;
    this.bump();
  }

  // ------------------------------------------------------------ input
  get len(): number {
    return this.text.length;
  }

  /** The race is live and we may type. */
  get racing(): boolean {
    return this.active && !this.localFinish && this.io.now() >= this.goAt && !this.spectating;
  }

  /**
   * Only watching this race: the host (who never races) or someone who joined while it was running. There is no local car,
   * WPM, position or banner — the camera follows the leader and the lanes show the five leading cars.
   */
  get spectating(): boolean {
    return this.active && !this.racers.has(this.meId);
  }

  /** The camera frames the whole field (leader at the front, everyone behind): a spectator always, and a driver in "Overview" of a big field. */
  get fitting(): boolean {
    return this.spectating || (this.field && this.overview);
  }

  /** The point of the track (in characters) the camera is centred on: my own car, or the leader when the camera frames the whole field. */
  cameraPos(): number {
    const me = this.racers.get(this.meId);
    return me && !this.fitting ? me.disp : this.specCam;
  }

  /** For a spectator: the (smoothed) distance from the leader back to the last of the cars on screen. */
  fieldSpan(): number {
    return this.specSpan;
  }

  handleChar(ch: string): CharResult {
    if (!this.racing || ch.length !== 1) return 'ignored';
    const now = this.io.now();
    const expected = this.text[this.mePos];
    const s = ++this.seq;
    this.pending.push({ s, c: ch });
    this.pump();

    if (ch !== expected) {
      this.wrongUntil = performance.now() + 260;
      this.later(260);
      this.bump();
      return 'wrong';
    }
    this.mePos += 1;
    this.keyTimes.push(now);
    if (this.keyTimes.length > 64) this.keyTimes.splice(0, this.keyTimes.length - 64);

    const finished = this.mePos >= this.len;
    if (finished) this.localFinish = true;
    if (ch === ' ' || finished) {
      this.flashWord = this.wordIndexAt(this.mePos - 1);
      this.flashUntil = performance.now() + 380;
      this.boomSeq += 1;
      this.later(400);
    }
    this.bump();
    return 'ok';
  }

  /**
   * Send queued keystrokes in order. With an empty queue a new key goes out immediately; with a backlog (after a
   * reconnect) they are paced so the server's rate limit never drops one.
   */
  private pump(): void {
    if (this.pumpTimer) return; // a paced flush is already running and will pick up new keys in order
    const next = this.pending.find((k) => k.s > this.sentUpTo);
    if (!next) return;
    if (!this.io.send({ t: 'k', s: next.s, c: next.c })) return; // offline: stays queued until the next rejoin
    this.sentUpTo = next.s;
    if (this.pending.some((k) => k.s > this.sentUpTo)) {
      this.pumpTimer = setTimeout(() => {
        this.pumpTimer = null;
        this.pump();
      }, FLUSH_GAP_MS);
    }
  }

  private later(ms: number): void {
    const t = setTimeout(() => {
      this.timers = this.timers.filter((x) => x !== t);
      this.bump();
    }, ms + 20);
    this.timers.push(t);
  }

  wordIndexAt(i: number): number {
    let idx = 0;
    for (let k = 0; k < i && k < this.text.length; k++) if (this.text[k] === ' ') idx++;
    return idx;
  }

  get errorFlash(): boolean {
    return performance.now() < this.wrongUntil;
  }
  get wordFlash(): number {
    return performance.now() < this.flashUntil ? this.flashWord : -1;
  }

  // ------------------------------------------------------------ server state
  applyState(m: Extract<ServerMsg, { t: 'state' }>): void {
    if (m.race !== this.raceId || !this.active) return;
    m.racers.forEach(([id, pos, wpm, fin], i) => {
      let r = this.racers.get(id);
      if (!r) {
        r = { id, pos: 0, disp: pos, wpm: 0, fin: 0, order: i };
        this.racers.set(id, r);
        this.fieldIds.push(id);
      }
      r.pos = pos;
      r.wpm = wpm;
      r.fin = fin;
      r.order = i;
      if (id === this.meId && fin > 0) {
        this.myFinMs = fin;
        this.localFinish = true;
      }
    });

    // Reconcile: authoritative position + keystrokes the server has not acknowledged yet.
    // Keep doing this even after we *predicted* the finish: until the server confirms it, the server is right
    // (it may have dropped keys), and if we are not actually done we must be allowed to keep typing.
    const mine = this.racers.get(this.meId);
    if (mine && this.myFinMs === 0 && mine.fin === 0) {
      this.pending = this.pending.filter((k) => k.s > m.ack);
      let p = mine.pos;
      for (const k of this.pending) if (this.text[p] === k.c) p += 1;
      this.mePos = p;
      this.localFinish = p >= this.len;
    }
    this.bump(); // 10 Hz: standings / live results screens re-read the racers
  }

  // ------------------------------------------------------------ per-frame (called from rAF)
  frame(dt: number): void {
    const kPos = ease(dt, 13);
    for (const r of this.racers.values()) {
      const target = r.id === this.meId ? this.mePos : r.pos;
      const d = target - r.disp;
      r.disp = Math.abs(d) < 0.004 ? target : r.disp + d * kPos;
    }
    const fitting = this.fitting;
    if (fitting) {
      let lead = 0;
      for (const r of this.racers.values()) lead = Math.max(lead, r.disp);
      let low = lead;
      for (const id of this.lanes) {
        const r = id ? this.racers.get(id) : undefined;
        if (r) low = Math.min(low, r.disp);
      }
      this.specCam = lead;
      // zoom out at once when the field stretches (a car must never run off the edge), zoom back in gently when it closes up
      const span = lead - low;
      this.specSpan = span > this.specSpan ? span : this.specSpan + (span - this.specSpan) * ease(dt, 3);
    }
    const wpmNow = this.currentWpm();
    this.wpmSmooth += (wpmNow - this.wpmSmooth) * ease(dt, 4);
    // Camera lag: the faster you type the further forward your car sits on screen (as in the reel). A spectator's leader
    // sits near the right edge instead, with the field spread out behind.
    const targetAnchor = fitting ? this.spectatorAnchor : this.baseAnchor + (0.62 - this.baseAnchor) * Math.min(1, this.wpmSmooth / 95);
    this.anchor += (targetAnchor - this.anchor) * ease(dt, 2.2);
    if (this.active && this.io.now() >= this.goAt) this.scroll += (30 + this.wpmSmooth * 6.5) * dt;
  }

  currentWpm(): number {
    if (!this.active) return 0;
    if (this.spectating) return this.leaderWpm();
    if (this.myFinMs > 0) return this.myFinWpm;
    const now = this.io.now();
    if (now < this.goAt) return 0;
    return liveWpm(this.keyTimes, now, this.goAt);
  }

  /** The fastest live WPM among the drivers still racing — what drives a spectator's road speed. */
  private leaderWpm(): number {
    if (this.io.now() < this.goAt) return 0;
    let best = 0;
    for (const r of this.racers.values()) if (r.fin === 0) best = Math.max(best, r.wpm);
    return best;
  }

  // ------------------------------------------------------------ ~10 Hz housekeeping
  tick(): void {
    if (!this.active) return;
    if (this.spectating) {
      this.tickSpectator();
      return;
    }
    const now = this.io.now();
    const racing = now >= this.goAt;
    const rank = this.computeRank();
    const elapsed = this.myFinMs > 0 ? this.myFinMs : racing ? now - this.goAt : 0;
    const progress = this.len ? Math.min(1, this.mePos / this.len) : 0;
    const wpm = Math.round(this.currentWpm());
    const total = this.racers.size || 1;

    // Announce *net, settled* rank changes: wait until the rank has held steady for a moment, then compare it with
    // the last rank the player was told about (so two quick overtakes read as one "-2 Positions", not two flickers).
    const t = performance.now();
    if (rank !== this.lastRank) this.stableSince = t;
    this.lastRank = rank;
    if (racing && !this.localFinish) {
      if (this.announced === 0) this.announced = rank;
      else if (rank !== this.announced && t - this.stableSince >= 280 && t - this.lastBannerAt >= 1000) {
        this.rankChanged(this.announced, rank);
        this.announced = rank;
      }
    }

    this.tickCount += 1;
    if (this.tickCount % 3 === 0) this.assignLanes();

    const h = this.hud;
    if (h.wpm !== wpm || h.rank !== rank || h.total !== total || Math.abs(h.elapsedMs - elapsed) >= 90 || h.finished !== this.localFinish || h.progress !== progress) {
      this.hud = { wpm, rank, total, elapsedMs: elapsed, progress, finished: this.localFinish };
      this.bump();
    }
  }

  /** A spectator's housekeeping: no rank, no banners — just the clock, the driver count and the five leading lanes. */
  private tickSpectator(): void {
    const now = this.io.now();
    const elapsed = now >= this.goAt ? now - this.goAt : 0;
    const total = this.racers.size || 1;
    const wpm = Math.round(this.leaderWpm());
    this.tickCount += 1;
    if (this.tickCount % 3 === 0) this.assignLanes();
    const h = this.hud;
    if (h.wpm !== wpm || h.total !== total || Math.abs(h.elapsedMs - elapsed) >= 90) {
      this.hud = { wpm, rank: 0, total, elapsedMs: elapsed, progress: 0, finished: false };
      this.bump();
    }
  }

  private computeRank(): number {
    const meFinished = this.myFinMs > 0;
    let rank = 1;
    for (const r of this.racers.values()) {
      if (r.id === this.meId) continue;
      if (this.localFinish) {
        if (r.fin > 0 && (!meFinished || r.fin < this.myFinMs)) rank += 1;
      } else if (r.fin > 0 || r.pos > this.mePos) {
        rank += 1;
      }
    }
    return rank;
  }

  /** Everyone ordered as they currently stand (my own place uses my predicted position). */
  standings(): { id: string; pos: number; wpm: number; fin: number }[] {
    const list = [...this.racers.values()].map((r) => ({
      id: r.id,
      pos: r.id === this.meId ? this.mePos : r.pos,
      wpm: r.id === this.meId ? Math.round(this.currentWpm()) : r.wpm,
      fin: r.id === this.meId && this.localFinish && this.myFinMs === 0 ? Number.MAX_SAFE_INTEGER : r.fin,
      order: r.order,
    }));
    list.sort((a, b) => {
      if (a.fin > 0 && b.fin > 0) return a.fin - b.fin;
      if (a.fin > 0) return -1;
      if (b.fin > 0) return 1;
      return b.pos - a.pos || a.order - b.order;
    });
    return list;
  }

  private rankChanged(from: number, to: number): void {
    const now = performance.now();
    const delta = Math.abs(from - to);
    const plural = delta === 1 ? 'Position' : 'Positions';
    let banner: Banner;
    if (to < from) {
      const passed = this.nearest('behind');
      banner =
        to === 1
          ? { id: ++this.bannerSeq, kind: 'lead', title: 'IN THE LEAD! P1 LEADER', sub: `+${delta} ${plural} • You overtook ${passed}!` }
          : { id: ++this.bannerSeq, kind: 'gain', title: `POSITION #${to}`, sub: `+${delta} ${plural} • Ahead of ${passed}!` };
    } else {
      const passer = this.nearest('ahead');
      banner = { id: ++this.bannerSeq, kind: 'lost', title: `OVERTAKEN! #${to}`, sub: `-${delta} ${plural} • ${passer} passed you! ACCELERATE!` };
    }
    this.lastBannerAt = now;
    this.banner = banner;
    this.bump();
  }

  private nearest(side: 'ahead' | 'behind'): string {
    let best: Racer | null = null;
    for (const r of this.racers.values()) {
      if (r.id === this.meId) continue;
      if (side === 'ahead' ? r.pos > this.mePos || r.fin > 0 : r.pos <= this.mePos && r.fin === 0) {
        if (!best) best = r;
        else if (side === 'ahead' ? r.pos < best.pos : r.pos > best.pos) best = r;
      }
    }
    return best ? (this.names.get(best.id) ?? 'a rival') : 'a rival';
  }

  clearBanner(id: number): void {
    if (this.banner?.id === id) {
      this.banner = null;
      this.bump();
    }
  }

  // ------------------------------------------------------------ lanes (you + the 4 closest rivals)
  private assignLanes(): void {
    if (this.field) {
      this.assignFieldLanes();
      return;
    }
    if (this.spectating) {
      this.assignLeaderLanes();
      return;
    }
    const others = [...this.racers.values()].filter((r) => r.id !== this.meId);
    const gap = (r: Racer) => Math.abs((r.fin > 0 ? this.len : r.pos) - this.mePos);
    others.sort((a, b) => gap(a) - gap(b) || a.order - b.order);
    const closeness = new Map(others.map((r, i) => [r.id, i]));

    const current = this.lanes.slice(1);
    const next: (string | null)[] = [null, null, null, null];
    // Stickiness: a rival keeps their lane while still among the six closest, so cars don't hop around.
    current.forEach((id, i) => {
      if (id && (closeness.get(id) ?? 99) < 6) next[i] = id;
    });
    const placed = new Set(next.filter(Boolean) as string[]);
    for (const r of others) {
      if (placed.has(r.id)) continue;
      const slot = next.indexOf(null);
      if (slot === -1) break;
      next[slot] = r.id;
      placed.add(r.id);
    }
    const lanes = [this.meId || null, ...next];
    if (lanes.some((id, i) => id !== this.lanes[i])) {
      this.lanes = lanes;
      this.bump();
    }
  }

  /** The full field: every racer has a car, in the place they were dealt (it never changes during the race). */
  private assignFieldLanes(): void {
    const ids = this.fieldIds.filter((id) => this.racers.has(id));
    if (ids.length !== this.lanes.length || ids.some((id, i) => id !== this.lanes[i])) {
      this.lanes = ids;
      this.bump();
    }
  }

  /** A spectator has no car of their own: the five leading drivers take the five lanes (a car keeps its lane while it stays in the top five, so cars never hop; a driver who drops out frees theirs for the newcomer). */
  private assignLeaderLanes(): void {
    const ranked = this.standings().map((r) => r.id);
    const rankOf = new Map(ranked.map((id, i) => [id, i]));
    const next: (string | null)[] = [null, null, null, null, null];
    this.lanes.forEach((id, i) => {
      if (id && (rankOf.get(id) ?? 99) < 5) next[i] = id;
    });
    const placed = new Set(next.filter(Boolean) as string[]);
    for (const id of ranked) {
      if (placed.has(id)) continue;
      const slot = next.indexOf(null);
      if (slot === -1) break;
      next[slot] = id;
      placed.add(id);
    }
    if (next.some((id, i) => id !== this.lanes[i])) {
      this.lanes = next;
      this.bump();
    }
  }
}
