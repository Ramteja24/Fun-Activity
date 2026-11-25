import type { ClientMsg, ServerMsg } from '../../shared/protocol';

export type ConnStatus = 'connecting' | 'open' | 'closed';

/** A ping unanswered for this long on a visible tab means the connection is dead. */
const STALE_MS = 8000;

interface Handlers {
  onMessage(m: ServerMsg): void;
  onStatus(s: ConnStatus): void;
}

/**
 * WebSocket wrapper: automatic reconnect with back-off (phones sleep, Wi-Fi blips), stale-connection
 * detection, and NTP-style clock sync so every device counts the same 3-2-1-GO against the server clock.
 */
export class GameSocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private reconnectTimer: number | undefined;
  private pingTimer: number | undefined;
  private staleTimer: number | undefined;
  private pingsSent = 0;
  /** When the oldest still-unanswered ping was sent (null = nothing outstanding). */
  private awaitingSince: number | null = null;
  private samples: { rtt: number; offset: number }[] = [];

  /** serverNow() = Date.now() + offset */
  offset = 0;
  rtt = 0;
  status: ConnStatus = 'closed';
  /** While true nothing is sent: the 40-player demo (src/demo) shows the real screens with made-up data and must never reach a room. */
  muted = false;

  constructor(
    private readonly url: string,
    private readonly h: Handlers,
  ) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.nudge();
    });
    window.addEventListener('online', () => this.nudge());
  }

  start(): void {
    this.open();
  }

  serverNow(): number {
    return Date.now() + this.offset;
  }

  send(msg: ClientMsg): boolean {
    if (this.muted && msg.t !== 'ping') return false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  private setStatus(s: ConnStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.h.onStatus(s);
  }

  private open(): void {
    window.clearTimeout(this.reconnectTimer);
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.awaitingSince = null;
      window.clearTimeout(this.staleTimer);
      this.pingsSent = 0;
      this.samples = [];
      this.setStatus('open');
      this.schedulePing(0);
    };
    ws.onmessage = (ev) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(ev.data as string) as ServerMsg;
      } catch {
        return;
      }
      if (m.t === 'pong') {
        this.onPong(m.c, m.s);
        return;
      }
      this.h.onMessage(m);
    };
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      window.clearTimeout(this.pingTimer);
      window.clearTimeout(this.staleTimer);
      this.awaitingSince = null;
      this.setStatus('closed');
      this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  private scheduleReconnect(): void {
    window.clearTimeout(this.reconnectTimer);
    const delay = Math.min(4000, 350 * 2 ** this.attempt) + Math.random() * 250;
    this.attempt += 1;
    this.reconnectTimer = window.setTimeout(() => this.open(), delay);
  }

  /** Tab came back to the foreground / network returned: don't wait for the back-off timer. */
  private nudge(): void {
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
      this.attempt = 0;
      this.open();
    } else if (this.ws.readyState === WebSocket.OPEN) {
      this.schedulePing(0);
    }
  }

  private schedulePing(delay: number): void {
    window.clearTimeout(this.pingTimer);
    this.pingTimer = window.setTimeout(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.send({ t: 'ping', c: Date.now() });
      this.pingsSent += 1;
      this.armStaleCheck();
      // Burst of quick pings right after connecting for a fast, accurate clock estimate, then every 3 s.
      this.schedulePing(this.pingsSent < 8 ? 220 : 3000);
    }, delay);
  }

  /**
   * Half-open sockets (phone slept / Wi-Fi dropped without a FIN) never answer a ping: force a reconnect — but only
   * when a *specific* ping has gone unanswered for STALE_MS. The old rule ("time since the last pong > 9 s, checked
   * whenever the ping timer fires") closed perfectly healthy connections in throttled background/occluded tabs,
   * where that timer can fire a minute late. A hidden tab never declares its own socket dead; the server's own
   * heartbeat and the browser's close event cover real failures, and `nudge()` re-checks as soon as the tab is back.
   */
  private armStaleCheck(): void {
    if (this.awaitingSince !== null) return; // already watching an unanswered ping
    this.awaitingSince = Date.now();
    const check = () => {
      if (this.awaitingSince === null) return; // answered in the meantime
      if (document.visibilityState !== 'visible') {
        this.staleTimer = window.setTimeout(check, STALE_MS); // hidden: can't trust our own timers, look again later
        return;
      }
      if (Date.now() - this.awaitingSince >= STALE_MS) this.ws?.close();
      else this.staleTimer = window.setTimeout(check, STALE_MS - (Date.now() - this.awaitingSince));
    };
    this.staleTimer = window.setTimeout(check, STALE_MS);
  }

  private onPong(clientSent: number, serverTime: number): void {
    const now = Date.now();
    this.awaitingSince = null;
    window.clearTimeout(this.staleTimer);
    const rtt = now - clientSent;
    if (rtt < 0 || rtt > 5000) return;
    // Server stamped `serverTime` roughly mid-flight → serverNow ≈ serverTime + rtt/2 at arrival.
    this.samples.push({ rtt, offset: serverTime + rtt / 2 - now });
    if (this.samples.length > 12) this.samples.shift();
    let best = this.samples[0]!;
    for (const s of this.samples) if (s.rtt < best.rtt) best = s; // lowest-latency sample is the most trustworthy
    this.offset = best.offset;
    this.rtt = best.rtt;
  }
}
