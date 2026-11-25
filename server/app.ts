import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { isScreen } from '../shared/activities';
import { isDifficulty } from '../shared/difficulty';
import { normalizeRoomCode } from '../shared/game';
import { CARDS_OPS, POSE_PLAIN_OPS, TRIVIA_OPS, type CardsOp, type ClientMsg, type ErrorCode, type PoseOp, type ServerMsg, type TriviaOp } from '../shared/protocol';
import { isTeamId } from '../shared/teams';
import { createLoginLimiter, type AdminAuth } from './admin';
import { defaultConfig, type RoomConfig } from './config';
import { RoomRegistry } from './registry';
import type { Conn, JoinResult, Player, Room } from './room';
import { createStaticHandler } from './static';

export interface AppOptions {
  config?: Partial<RoomConfig>;
  /** Directory holding the built client; null = API/WebSocket only (dev). */
  staticDir?: string | null;
  log?: (line: string) => void;
  /**
   * The admin login. Rooms can only be created (and hosted) with a token from it. Left out, anyone may create a room and
   * an `admin` field alone marks a host — the server's tests use that; server/index.ts always passes the real one.
   */
  admin?: AdminAuth;
}

export interface App {
  server: Server;
  registry: RoomRegistry;
  listen(port: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

/** Strict parse of a client frame. Anything malformed is dropped. */
export function parseClientMsg(raw: string): ClientMsg | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null) return null;
  const o = m as Record<string, unknown>;
  switch (o.t) {
    case 'create':
      return typeof o.name === 'string'
        ? { t: 'create', name: o.name, ...(typeof o.admin === 'string' ? { admin: o.admin } : {}), ...(isScreen(o.activity) ? { activity: o.activity } : {}) }
        : null;
    case 'join':
      return typeof o.room === 'string' && typeof o.name === 'string'
        ? {
            t: 'join',
            room: o.room,
            name: o.name,
            ...(typeof o.token === 'string' ? { token: o.token } : {}),
            ...(isTeamId(o.team) ? { team: o.team } : {}),
            ...(typeof o.admin === 'string' ? { admin: o.admin } : {}),
          }
        : null;
    case 'team':
      return isTeamId(o.team) ? { t: 'team', team: o.team } : null;
    case 'activity':
      return isScreen(o.activity) ? { t: 'activity', activity: o.activity } : null;
    case 'pose':
      if (o.op === 'team') return isTeamId(o.team) ? { t: 'pose', op: 'team', team: o.team } : null;
      return typeof o.op === 'string' && (POSE_PLAIN_OPS as readonly string[]).includes(o.op) ? { t: 'pose', op: o.op as Exclude<PoseOp, 'team'> } : null;
    case 'trivia':
      return typeof o.op === 'string' && (TRIVIA_OPS as readonly string[]).includes(o.op) ? { t: 'trivia', op: o.op as TriviaOp } : null;
    case 'answer':
      return Number.isInteger(o.q) && Number.isInteger(o.choice) ? { t: 'answer', q: o.q as number, choice: o.choice as number } : null;
    case 'cards':
      return typeof o.op === 'string' && (CARDS_OPS as readonly string[]).includes(o.op) ? { t: 'cards', op: o.op as CardsOp } : null;
    case 'cardpick':
      return Number.isInteger(o.round) && Number.isInteger(o.card) && (o.round as number) > 0 && (o.card as number) >= 0 && (o.card as number) < 16
        ? { t: 'cardpick', round: o.round as number, card: o.card as number }
        : null;
    case 'ping':
      return typeof o.c === 'number' && Number.isFinite(o.c) ? { t: 'ping', c: o.c } : null;
    case 'k':
      return typeof o.s === 'number' && typeof o.c === 'string' ? { t: 'k', s: o.s, c: o.c } : null;
    case 'difficulty':
      return isDifficulty(o.difficulty) ? { t: 'difficulty', difficulty: o.difficulty } : null;
    case 'start':
      return o.difficulty === undefined ? { t: 'start' } : isDifficulty(o.difficulty) ? { t: 'start', difficulty: o.difficulty } : null;
    case 'end':
    case 'lobby':
    case 'match_end':
    case 'match_new':
    case 'leave':
      return { t: o.t };
    case 'kick':
      return typeof o.id === 'string' ? { t: 'kick', id: o.id } : null;
    default:
      return null;
  }
}

export function createApp(opts: AppOptions = {}): App {
  const config: RoomConfig = { ...defaultConfig, ...opts.config };
  const log = opts.log ?? (() => {});
  const registry = new RoomRegistry(config, log);
  registry.startSweeper();

  const serveStatic = opts.staticDir ? createStaticHandler(resolve(opts.staticDir)) : null;
  const admin = opts.admin;
  const limiter = createLoginLimiter();
  /** Is this the admin's token? Without a configured login (the server's tests) every token counts — and so does none. */
  const isAdmin = (token: string | undefined): boolean => (admin ? admin.verify(token) : true);

  const json = (res: ServerResponse, status: number, body: unknown) =>
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));

  const adminLogin = (req: IncomingMessage, res: ServerResponse) => {
    if (!admin) return json(res, 404, { error: 'Admin login is not set up on this server.' });
    const who = req.socket.remoteAddress ?? '?';
    if (limiter.blocked(who)) return json(res, 429, { error: 'Too many attempts. Wait a few minutes and try again.' });
    let body = '';
    let tooBig = false;
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > 2048) {
        tooBig = true;
        req.destroy();
      }
    });
    req.on('end', () => {
      if (tooBig) return;
      let u = '';
      let p = '';
      try {
        const o = JSON.parse(body) as Record<string, unknown>;
        u = typeof o.username === 'string' ? o.username : '';
        p = typeof o.password === 'string' ? o.password : '';
      } catch {
        return json(res, 400, { error: 'Bad request.' });
      }
      const token = u && p ? admin.login(u, p) : null;
      if (!token) {
        limiter.failed(who);
        log(`admin login failed from ${who}`);
        return json(res, 401, { error: 'Wrong username or password.' });
      }
      limiter.succeeded(who);
      log(`admin logged in from ${who}`);
      json(res, 200, { token, username: admin.username });
    });
  };

  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/api/admin/login') {
      if (req.method !== 'POST') return json(res, 405, { error: 'Use POST.' });
      adminLogin(req, res);
      return;
    }
    if (url === '/api/admin/session') {
      const auth = req.headers.authorization ?? '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : undefined;
      json(res, 200, { admin: !!admin && !!token && admin.verify(token), configured: !!admin });
      return;
    }
    if (url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, rooms: registry.rooms.size }));
      return;
    }
    if (url === '/api/info') {
      // Lets the lobby show a link that teammates on the same network can actually open
      // (only meaningful when the host is browsing via localhost).
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ lan: lanUrls(port) }));
      return;
    }
    if (serveStatic) {
      serveStatic(req, res).catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Game server running. Open the web client (npm run dev → http://localhost:5173).');
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (path !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  // Heartbeat: drop sockets that stopped answering (phones that lost signal etc.).
  const alive = new WeakSet<WebSocket>();
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, 20_000);
  heartbeat.unref();

  wss.on('connection', (ws) => {
    alive.add(ws);
    ws.on('pong', () => alive.add(ws));

    const conn: Conn = {
      send(msg: ServerMsg) {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
      },
      sendRaw(json: string) {
        if (ws.readyState === ws.OPEN) ws.send(json);
      },
      close() {
        ws.close();
      },
    };
    const send = (msg: ServerMsg) => conn.send(msg);
    const fail = (code: ErrorCode, msg: string) => send({ t: 'error', code, msg });

    let room: Room | null = null;
    let player: Player | null = null;

    // Crude flood guard (token bucket): sustained rates far above any real client are dropped.
    const rate = config.maxMessagesPerSecond;
    let bucket = rate;
    let lastRefill = Date.now();

    const enter = (target: Room, result: JoinResult) => {
      if (!result.ok) {
        fail(result.code, result.msg);
        return;
      }
      room = target;
      player = result.player;
      send({
        t: 'joined',
        you: player.id,
        token: player.token,
        room: target.roomInfo(),
        seq: player.lastSeq,
        ...(target.finishRowFor(player) ? { finish: target.finishRowFor(player)! } : {}),
      });
      target.broadcastRoom();
      log(`${player.name} ${result.resumed ? 'rejoined' : 'joined'} ${target.code} (${target.connectedCount()} online)`);
    };

    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      const now = Date.now();
      bucket = Math.min(rate * 2, bucket + ((now - lastRefill) / 1000) * rate);
      lastRefill = now;
      if (bucket < 1) return;
      bucket -= 1;

      const msg = parseClientMsg(data.toString());
      if (!msg) return;

      switch (msg.t) {
        case 'ping':
          send({ t: 'pong', c: msg.c, s: Date.now() });
          return;
        case 'create': {
          if (room) return;
          if (!isAdmin(msg.admin)) {
            fail('not_admin', 'Only the admin can create a room. Ask your host for the room code.');
            return;
          }
          const created = registry.create();
          if (!created) {
            fail('too_many_rooms', 'The server is busy. Try again in a minute.');
            return;
          }
          const result = created.join(msg.name, conn, undefined, undefined, true);
          if (!result.ok) {
            registry.rooms.delete(created.code);
            created.dispose();
          } else if (msg.activity) {
            created.setActivity(result.player.id, msg.activity); // open straight in the game the host chose
          }
          enter(created, result);
          return;
        }
        case 'join': {
          if (room) return;
          const code = normalizeRoomCode(msg.room);
          const target = code ? registry.get(code) : undefined;
          if (!target) {
            fail('no_room', 'No room with that code. Check it and try again.');
            return;
          }
          if (msg.admin !== undefined && !isAdmin(msg.admin)) {
            fail('not_admin', 'Your admin login has expired. Log in again to host.');
            return;
          }
          enter(target, target.join(msg.name, conn, msg.token, msg.team, msg.admin !== undefined));
          return;
        }
        default:
      }

      if (!room || !player) return;
      switch (msg.t) {
        case 'k':
          room.key(player, msg.s, msg.c);
          return;
        case 'difficulty':
          room.setDifficulty(player.id, msg.difficulty);
          return;
        case 'start':
          room.start(player.id, msg.difficulty);
          return;
        case 'end':
          room.endByHost(player.id);
          return;
        case 'lobby':
          room.backToLobby(player.id);
          return;
        case 'team':
          room.setTeam(player, msg.team);
          return;
        case 'match_end':
          room.endMatch(player.id);
          return;
        case 'match_new':
          room.newMatch(player.id);
          return;
        case 'activity':
          room.setActivity(player.id, msg.activity);
          return;
        case 'pose':
          room.poseCommand(player.id, msg);
          return;
        case 'trivia':
          room.triviaCommand(player.id, msg.op);
          return;
        case 'answer':
          room.triviaAnswer(player, msg.q, msg.choice);
          return;
        case 'cards':
          room.cardsCommand(player.id, msg.op);
          return;
        case 'cardpick':
          room.cardPick(player, msg.round, msg.card);
          return;
        case 'kick':
          room.kick(player.id, msg.id);
          return;
        case 'leave': {
          const r = room;
          const p = player;
          room = null;
          player = null;
          r.leave(p);
          return;
        }
        default:
      }
    });

    ws.on('close', () => {
      if (room && player) {
        room.disconnect(player, conn);
        log(`${player.name} disconnected from ${room.code} (${room.connectedCount()} online)`);
      }
    });
    ws.on('error', () => ws.terminate());
  });

  return {
    server,
    registry,
    listen(port, host = '0.0.0.0') {
      return new Promise((res, rej) => {
        server.once('error', rej);
        server.listen(port, host, () => {
          server.off('error', rej);
          const addr = server.address();
          res(typeof addr === 'object' && addr ? addr.port : port);
        });
      });
    },
    close() {
      clearInterval(heartbeat);
      registry.stop();
      for (const ws of wss.clients) ws.terminate();
      return new Promise((res) => {
        wss.close(() => server.close(() => res()));
        server.closeAllConnections?.();
      });
    },
  };
}

/** Human-friendly LAN URLs for the startup banner. */
export function lanUrls(port: number): string[] {
  const urls: string[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${port}`);
    }
  }
  return urls;
}
