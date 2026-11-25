import { WebSocket } from 'ws';
import type { ClientMsg, RoomInfo, ServerMsg } from '../../shared/protocol';
import type { Screen } from '../../shared/activities';
import { TEAM_IDS, type TeamId } from '../../shared/teams';

// A real WebSocket client — one per simulated "device". These tests use the real server over real sockets.

/** Short timings so end-to-end tests run in seconds. Capacity is NOT overridden: it must be the shipped default. */
export const FAST = {
  countdownLeadMs: 250,
  idleDnfMs: 600,
  raceMaxMs: 8000,
  racerOfflineMs: 400,
  lobbyPruneMs: 700,
  maxKeysPerSecond: 10_000,
  maxMessagesPerSecond: 100_000,
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Client {
  msgs: ServerMsg[] = [];
  private waiters: { pred: (m: ServerMsg) => boolean; res: (m: ServerMsg) => void }[] = [];
  me = '';
  token = '';
  seq = 0;
  room!: RoomInfo;

  private constructor(readonly ws: WebSocket) {
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      this.msgs.push(m);
      if (m.t === 'joined') {
        this.me = m.you;
        this.token = m.token;
        this.seq = m.seq;
        this.room = m.room;
      }
      if (m.t === 'room') this.room = m.room;
      this.waiters = this.waiters.filter((w) => {
        if (w.pred(m)) {
          w.res(m);
          return false;
        }
        return true;
      });
    });
  }

  static connect(port: number): Promise<Client> {
    return new Promise((res, rej) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const c = new Client(ws);
      ws.once('open', () => res(c));
      ws.once('error', rej);
    });
  }

  send(m: ClientMsg | Record<string, unknown>) {
    this.ws.send(JSON.stringify(m));
  }

  waitFor<T extends ServerMsg>(pred: (m: ServerMsg) => m is T, ms?: number): Promise<T>;
  waitFor(pred: (m: ServerMsg) => boolean, ms?: number): Promise<ServerMsg>;
  waitFor(pred: (m: ServerMsg) => boolean, ms = 4000): Promise<ServerMsg> {
    return new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('timeout waiting for message')), ms);
      this.waiters.push({
        pred,
        res: (m) => {
          clearTimeout(timer);
          res(m);
        },
      });
    });
  }

  waitPhase(phase: RoomInfo['phase'], ms = 4000) {
    if (this.room?.phase === phase) return Promise.resolve();
    return this.waitFor((m) => m.t === 'room' && m.room.phase === phase, ms).then(() => undefined);
  }

  /** Type a string one keystroke at a time. */
  async type(text: string, gapMs = 0) {
    for (const ch of text) {
      this.send({ t: 'k', s: ++this.seq, c: ch });
      if (gapMs) await sleep(gapMs);
    }
  }

  last<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }> | undefined {
    for (let i = this.msgs.length - 1; i >= 0; i--) if (this.msgs[i]!.t === t) return this.msgs[i] as Extract<ServerMsg, { t: T }>;
    return undefined;
  }

  close() {
    this.ws.close();
  }
}

/**
 * A host creates a room and one driver per name joins it by code. The host is a spectator ("Host" by default): they
 * start and end races and watch them, but are not a racer — `drivers[i]` is the person called `names[i]`.
 */
export async function newRoom(port: number, names: (string | { name: string; team: TeamId })[], hostName = 'Host', activity: Screen = 'typedrive') {
  const host = await Client.connect(port);
  host.send({ t: 'create', name: hostName });
  await host.waitFor((m) => m.t === 'joined');
  const code = host.room.code;
  // A new room opens on the activity dashboard. Most of these tests are about TypeDrive, so the host goes straight there.
  if (activity !== 'hub') {
    host.send({ t: 'activity', activity });
    await host.waitFor((m) => m.t === 'room' && m.room.activity === activity);
  }
  const drivers = await Promise.all(
    names.map(async (n, i) => {
      // Every driver picks a team; unless a test says otherwise they spread over the three, in order.
      const { name, team } = typeof n === 'string' ? { name: n, team: TEAM_IDS[i % TEAM_IDS.length]! } : n;
      const d = await Client.connect(port);
      d.send({ t: 'join', room: code, name, team });
      await d.waitFor((m) => m.t === 'joined');
      return d;
    }),
  );
  return { host, drivers, all: [host, ...drivers], code };
}
