import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import { GameSocket } from '../src/net/socket';

// GameSocket is browser code. Run it against a fake WebSocket + the document/window bits it touches, with virtual time.

let closes = 0;
let answerPings = true;
let sockets: FakeWS[] = [];

class FakeWS {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    sockets.push(this);
  }
  send(s: string) {
    const m = JSON.parse(s) as { t: string; c: number };
    // A healthy server answers every ping immediately.
    if (m.t === 'ping' && answerPings) queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ t: 'pong', c: m.c, s: Date.now() }) }));
  }
  close() {
    closes += 1;
    this.readyState = 3;
    this.onclose?.();
  }
}

const g = globalThis as unknown as Record<string, unknown>;
const doc = { addEventListener() {}, visibilityState: 'visible' as 'visible' | 'hidden' };

async function connect() {
  const sock = new GameSocket('ws://x/ws', { onMessage() {}, onStatus() {} });
  sock.start();
  const ws = sockets[sockets.length - 1]!;
  ws.readyState = 1;
  ws.onopen?.();
  mock.timers.tick(1); // first ping goes out
  await Promise.resolve();
  await Promise.resolve();
  return { sock, ws };
}

describe('GameSocket stale-connection detection', () => {
  beforeEach(() => {
    closes = 0;
    answerPings = true;
    sockets = [];
    doc.visibilityState = 'visible';
    g.WebSocket = FakeWS;
    g.document = doc;
    g.window = {
      addEventListener() {},
      setTimeout: (...a: Parameters<typeof setTimeout>) => setTimeout(...a),
      clearTimeout: (id: Parameters<typeof clearTimeout>[0]) => clearTimeout(id),
    };
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  });
  afterEach(() => mock.timers.reset());

  test('REGRESSION — a healthy connection is NOT closed when the ping timer fires a minute late (throttled background tab)', async () => {
    await connect();
    assert.equal(closes, 0);
    // The tab is throttled: the next timer fires 60 s late. The server is perfectly fine and answers every ping.
    mock.timers.setTime(Date.now() + 60_000);
    mock.timers.tick(1);
    await Promise.resolve();
    await Promise.resolve();
    mock.timers.tick(10_000);
    await Promise.resolve();
    assert.equal(closes, 0, 'old code closed the socket here because "time since last pong > 9 s"');
  });

  test('a visible tab whose pings go unanswered for 8 s is declared dead and closed (so it can reconnect)', async () => {
    await connect();
    answerPings = false; // half-open socket: the server never answers again
    mock.timers.tick(3000); // next ping goes out, unanswered
    mock.timers.tick(7000);
    assert.equal(closes, 0, 'not yet — an unanswered ping must stay unanswered for 8 s');
    mock.timers.tick(2000);
    assert.equal(closes, 1);
  });

  test('a hidden tab never declares its own socket dead (its timers cannot be trusted); it re-checks once visible', async () => {
    await connect();
    answerPings = false;
    doc.visibilityState = 'hidden';
    mock.timers.tick(3000);
    mock.timers.tick(60_000);
    assert.equal(closes, 0);
    doc.visibilityState = 'visible';
    mock.timers.tick(8_000);
    assert.equal(closes, 1, 'back in the foreground, the still-unanswered ping now closes the dead socket');
  });

  test('an answered ping clears the watch: no close even after many ping cycles', async () => {
    await connect();
    for (let i = 0; i < 20; i++) {
      mock.timers.tick(3000);
      await Promise.resolve();
      await Promise.resolve();
    }
    assert.equal(closes, 0);
  });
});
