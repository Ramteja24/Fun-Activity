import { WebSocket } from 'ws';
import { RaceEngine } from '../../src/game/engine';
import type { ClientMsg, ResultRow, RoomInfo, ServerMsg } from '../../shared/protocol';
import type { TeamId } from '../../shared/teams';

/**
 * One direction of a laggy network: every message is delayed by ~`ms` (±40% jitter) but never overtakes an earlier one —
 * a single TCP/WebSocket connection never reorders. (Independent setTimeouts do reorder messages scheduled within a
 * millisecond of each other, which is why this is a FIFO queue drained by one timer.)
 */
class DelayLine {
  private q: { due: number; fn: () => void }[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private last = 0;

  push(ms: number, fn: () => void) {
    const due = Math.max(this.last, Date.now() + ms * (0.6 + Math.random() * 0.8));
    this.last = due;
    this.q.push({ due, fn });
    this.arm();
  }
  private arm() {
    if (this.timer || this.q.length === 0) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const now = Date.now();
      while (this.q.length > 0 && this.q[0]!.due <= now) this.q.shift()!.fn();
      this.arm();
    }, Math.max(0, this.q[0]!.due - Date.now()));
  }
}

/**
 * A stand-in for the browser app: the REAL race engine (prediction, ack-reconciliation, keystroke queue) driven over a
 * REAL WebSocket by the same message flow src/store.ts uses (joined → setIdentity, room → startRace, state →
 * applyState, finish → serverFinish). Lets tests inject latency and sever the connection like a flaky Wi-Fi would.
 */
export class BrowserLike {
  readonly engine: RaceEngine;
  ws: WebSocket | null = null;
  me = '';
  token = '';
  room: RoomInfo | null = null;
  finish: ResultRow | null = null;
  joined = false;
  /** One-way latency added to every message in each direction (ms), with order preserved. */
  latencyMs = 0;
  private readonly outbound = new DelayLine();
  private readonly inbound = new DelayLine();
  private waiters: { pred: () => boolean; res: () => void }[] = [];

  constructor(
    private readonly port: number,
    readonly name: string,
  ) {
    this.engine = new RaceEngine({ send: (m) => this.rawSend(m), now: () => Date.now() });
  }

  private rawSend(m: ClientMsg): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    const data = JSON.stringify(m);
    if (this.latencyMs <= 0) {
      ws.send(data);
    } else {
      this.outbound.push(this.latencyMs, () => ws.readyState === WebSocket.OPEN && ws.send(data));
    }
    return true;
  }

  /** Open a socket and (re)join: `create`/`join` the first time, token resume afterwards. */
  connect(first?: { create: true } | { code: string; team?: TeamId }): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${this.port}/ws`);
      this.ws = ws;
      ws.on('open', () => {
        const join: ClientMsg = this.token
          ? { t: 'join', room: this.room!.code, name: this.name, token: this.token }
          : first && 'create' in first
            ? { t: 'create', name: this.name }
            : { t: 'join', room: (first as { code: string }).code, name: this.name, team: (first as { team?: TeamId }).team ?? 'titans' };
        ws.send(JSON.stringify(join));
      });
      ws.on('message', (d) => {
        const m = JSON.parse(d.toString()) as ServerMsg;
        if (this.latencyMs <= 0) {
          this.handle(m, resolve);
        } else {
          this.inbound.push(this.latencyMs, () => this.handle(m, resolve));
        }
      });
      ws.on('error', reject);
    });
  }

  private handle(m: ServerMsg, onJoined: () => void) {
    switch (m.t) {
      case 'joined':
        this.me = m.you;
        this.token = m.token;
        this.joined = true;
        this.engine.setIdentity(m.you, m.seq);
        this.applyRoom(m.room);
        if (m.finish) {
          this.finish = m.finish;
          this.engine.serverFinish(m.finish);
        }
        onJoined();
        break;
      case 'room':
        this.applyRoom(m.room);
        break;
      case 'state':
        this.engine.applyState(m);
        break;
      case 'finish':
        this.finish = m.row;
        this.engine.serverFinish(m.row);
        break;
      default:
    }
    this.waiters = this.waiters.filter((w) => {
      if (w.pred()) {
        w.res();
        return false;
      }
      return true;
    });
  }

  private applyRoom(room: RoomInfo) {
    const prev = this.room;
    this.room = room;
    if (room.phase === 'lobby') this.engine.reset();
    else if (room.race && (!prev?.race || prev.race.id !== room.race.id || !this.engine.active)) {
      this.finish = null;
      this.engine.startRace(
        room.race,
        room.players.filter((p) => p.racing).map((p) => ({ id: p.id, name: p.name })),
      );
    }
  }

  /** Resolves when `pred()` becomes true (checked after every server message). */
  until(pred: () => boolean, ms = 8000): Promise<void> {
    if (pred()) return Promise.resolve();
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout waiting for condition')), ms);
      this.waiters.push({ pred, res: () => (clearTimeout(t), res()) });
    });
  }

  /** Ungraceful loss of the connection (no close handshake), like a Wi-Fi drop. */
  sever() {
    this.ws?.terminate();
    this.ws = null;
  }

  send(m: ClientMsg) {
    this.rawSend(m);
  }

  close() {
    this.ws?.close();
  }

  /**
   * Type like a person using the real UI: one key every `gapMs`, always the next expected character. Typing stops while the
   * client believes it has finished (the input is disabled), but — exactly like the real screen — resumes if the server
   * contradicts that, and only ends when the server has confirmed the finish (or the race is over).
   */
  async typeAll(gapMs: number, until?: () => boolean) {
    const text = this.engine.text;
    while (this.room?.phase === 'racing' && this.engine.active && this.engine.myFinMs === 0 && !(until && until())) {
      if (!this.engine.localFinish) this.engine.handleChar(text[this.engine.mePos]!);
      await new Promise((r) => setTimeout(r, gapMs));
    }
  }
}
