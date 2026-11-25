/**
 * REHEARSAL / QA TOOL — not part of the game.
 *
 * Fills a room with scripted typists over real WebSocket connections so you can see how a full room looks and
 * performs (lobby with 50 seats, live standings, results) before the event.
 *
 *   npm run bots -- ROOMCODE [count=49] [host=localhost:3000] [minWpm=25] [maxWpm=90]
 *
 * Bots join the room like any other player, wait for the host to press Start, then type the passage at a random
 * speed (with occasional typos). They behave like people on the server's rules (including its key-rate limit).
 */
import { WebSocket } from 'ws';
import type { ClientMsg, RoomInfo, ServerMsg } from '../shared/protocol';
import { TEAM_IDS } from '../shared/teams';

const [code, countArg, hostArg, minArg, maxArg] = process.argv.slice(2);
if (!code) {
  console.error('usage: npm run bots -- ROOMCODE [count=49] [host=localhost:3000] [minWpm=25] [maxWpm=90]');
  process.exit(1);
}
const count = Number(countArg ?? 49);
const host = hostArg ?? 'localhost:3000';
const minWpm = Number(minArg ?? 25);
const maxWpm = Number(maxArg ?? 90);
const NAMES = ['Asha', 'Ben', 'Chitra', 'Dev', 'Esha', 'Farhan', 'Gita', 'Hari', 'Isha', 'Jay'];

function bot(i: number) {
  const name = `${NAMES[i % NAMES.length]}${Math.floor(i / NAMES.length) + 1}`.slice(0, 16);
  const wpm = minWpm + Math.random() * (maxWpm - minWpm);
  const gap = 12_000 / wpm;
  const ws = new WebSocket(`ws://${host}/ws`);
  let seq = 0;
  let me = '';
  let raceId = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const send = (m: ClientMsg) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));
  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const race = (room: RoomInfo) => {
    if (!room.race || room.race.id === raceId || room.phase === 'lobby' || room.phase === 'results') return;
    const meInRace = room.players.find((p) => p.id === me)?.racing;
    if (!meInRace) return;
    raceId = room.race.id;
    const text = room.race.text;
    let pos = 0;
    const tick = () => {
      if (pos >= text.length) return;
      if (Math.random() < 0.025) send({ t: 'k', s: ++seq, c: text[pos] === 'q' ? 'z' : 'q' }); // a typo
      else {
        send({ t: 'k', s: ++seq, c: text[pos]! });
        pos++;
      }
      timer = setTimeout(tick, gap * (0.7 + Math.random() * 0.6));
    };
    stop();
    timer = setTimeout(tick, Math.max(0, room.race.goAt - Date.now()) + gap);
  };

  ws.on('open', () => send({ t: 'join', room: code!, name, team: TEAM_IDS[i % TEAM_IDS.length]! })); // bots spread themselves over the three teams
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString()) as ServerMsg;
    if (m.t === 'joined') {
      me = m.you;
      seq = m.seq;
      race(m.room);
    } else if (m.t === 'room') {
      if (m.room.phase === 'results' || m.room.phase === 'lobby') stop();
      race(m.room);
    } else if (m.t === 'finish') stop();
    else if (m.t === 'error') console.error(`${name}: ${m.msg}`);
  });
  ws.on('close', stop);
  ws.on('error', (e) => console.error(`${name}: ${e.message}`));
  return { name, wpm, ws };
}

const bots: ReturnType<typeof bot>[] = [];
for (let i = 0; i < count; i++) setTimeout(() => bots.push(bot(i)), i * 25);
setTimeout(() => console.log(`${bots.length} bots joined room ${code} (${minWpm}–${maxWpm} WPM). Press Start in the game. Ctrl+C to stop.`), count * 25 + 800);
process.on('SIGINT', () => {
  for (const b of bots) b.ws.close();
  setTimeout(() => process.exit(0), 200);
});
