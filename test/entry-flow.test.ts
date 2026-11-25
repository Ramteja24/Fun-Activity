import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ACTIVITIES } from '../shared/activities';
import { createApp, parseClientMsg } from '../server/app';
import { Client, FAST } from './helpers/ws-client';

// The app's first screen and how a room starts: Weekly Fun Activity dashboard → Open <game> → name / host / join page →
// a room that opens in that game's lobby. (The race itself is covered by the other test files.)

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('creating a room in the game that was opened on the dashboard', () => {
  test('the create message carries an optional, validated activity', () => {
    assert.deepEqual(parseClientMsg('{"t":"create","name":"Hosty"}'), { t: 'create', name: 'Hosty' });
    assert.deepEqual(parseClientMsg('{"t":"create","name":"Hosty","activity":"typedrive"}'), { t: 'create', name: 'Hosty', activity: 'typedrive' });
    assert.deepEqual(parseClientMsg('{"t":"create","name":"Hosty","activity":"pose"}'), { t: 'create', name: 'Hosty', activity: 'pose' });
    assert.deepEqual(parseClientMsg('{"t":"create","name":"Hosty","activity":"trivia"}'), { t: 'create', name: 'Hosty', activity: 'trivia' });
    for (const bad of ['"chess"', '3', 'null', '{}', '["pose"]']) {
      assert.deepEqual(parseClientMsg(`{"t":"create","name":"Hosty","activity":${bad}}`), { t: 'create', name: 'Hosty' }, `ignored: ${bad}`);
    }
  });

  test('over real sockets the room opens straight in that game — TypeDrive in its lobby, the host a spectator — and joiners land there too', async () => {
    const app = createApp({ config: { ...FAST } });
    const port = await app.listen(0, '127.0.0.1');
    const clients: Client[] = [];
    try {
      const open = async (name: string, activity?: string) => {
        const c = await Client.connect(port);
        clients.push(c);
        c.send({ t: 'create', name, ...(activity ? { activity } : {}) });
        await c.waitFor((m) => m.t === 'joined');
        return c;
      };

      const td = await open('Hosty', 'typedrive');
      assert.equal(td.room.activity, 'typedrive', 'TypeDrive opens in its own lobby');
      assert.equal(td.room.phase, 'lobby');
      assert.equal(td.room.hostId, td.me);
      assert.equal(td.room.players.find((p) => p.id === td.me)?.racing, false, 'the host still only watches');

      const guest = await Client.connect(port);
      clients.push(guest);
      guest.send({ t: 'join', room: td.room.code, name: 'Gina', team: 'vibe' });
      await guest.waitFor((m) => m.t === 'joined');
      assert.equal(guest.room.activity, 'typedrive', 'a joiner follows the room into TypeDrive’s lobby');
      assert.equal(guest.room.players.find((p) => p.id === guest.me)?.team, 'vibe', 'and keeps the team they picked');

      // …and the race starts from that lobby exactly as before
      td.send({ t: 'start' });
      await td.waitFor((m) => m.t === 'room' && (m.room.phase === 'countdown' || m.room.phase === 'racing'));
      assert.equal(td.room.race !== null, true);

      assert.equal((await open('E', 'pose')).room.activity, 'pose');
      assert.equal((await open('T', 'trivia')).room.activity, 'trivia');
      assert.equal((await open('H')).room.activity, 'hub', 'no choice → the in-room dashboard, as before');
      assert.equal((await open('X', 'chess')).room.activity, 'hub', 'nonsense is ignored');
    } finally {
      for (const c of clients) c.close();
      await app.close();
    }
  });
});

describe('the first screen', () => {
  const app = read('src/App.tsx');
  const store = read('src/store.ts');
  const landing = read('src/screens/Landing.tsx');
  const welcome = read('src/screens/Welcome.tsx');

  test('with no room the app shows the Weekly Fun Activity dashboard; the TypeDrive landing page only after a game is opened', () => {
    assert.match(app, /screen = entry \? <Landing \/> : <WelcomeScreen \/>;/);
    assert.doesNotMatch(app, /screen = <Landing \/>;/, 'the old landing page is no longer the first page');
    assert.match(store, /entry: openedWithInviteLink\(\) \? 'typedrive' : null/, 'the app starts on the dashboard (entry = null)');
  });

  test('the dashboard lists the four games in order, each with an "Open …" button that opens that game’s name / host / join page', () => {
    assert.deepEqual(ACTIVITIES.map((a) => a.name), ['TypeDrive', 'Funny Pose Challenge', 'Playing Cards', 'Tech Trivia']);
    assert.match(welcome, /ACTIVITIES\.map\(\(a, i\) =>/);
    assert.match(welcome, /onClick=\{\(\) => setEntry\(a\.id\)\}/);
    assert.match(welcome, /isAdmin \? `Open \$\{a\.name\}` : 'Join a room'/);
    assert.doesNotMatch(welcome, /create\(|join\(/, 'the dashboard itself creates and joins nothing');
  });

  test('the original landing page is kept: its form, wording and team picker are unchanged for TypeDrive, with a Dashboard button back', () => {
    for (const s of ['Ready to race?', 'Type fast.', 'Drive faster.', "Host a room", "Join a room", 'Create room', 'Join race', 'You host and watch the race', '<RaceScene />', '<HowToPlay />']) {
      assert.ok(landing.includes(s), `Landing still has: ${s}`);
    }
    // the strip of four feature lines under "How to play" was removed on request
    assert.ok(!landing.includes('FeatureStrip'), 'the feature strip is gone');
    assert.ok(!read('src/components/landing/HowToPlay.tsx').includes('FeatureStrip'));
    assert.match(landing, /else if \(codeOk && team\) join\(code, name, team\)/, 'joining still needs a team');
    assert.match(landing, /onClick=\{\(\) => setEntry\(null\)\}/, 'back to the dashboard');
  });

  test('Funny Pose Challenge, Playing Cards and Tech Trivia use the same form with their own words, and no race-only sections', () => {
    assert.match(landing, /const game = entry === 'pose' \|\| entry === 'cards' \|\| entry === 'trivia' \? ACTIVITIES\.find/);
    assert.match(landing, /\) : \(\s*<div className="lp-scene/, 'the race strip is in the TypeDrive branch');
    assert.match(landing, /\{!game && <HowToPlay \/>\}/);
    assert.match(landing, /Ready to play\?/);
  });

  test('the room opens in the chosen game, and leaving, being removed or a closed room go back to the dashboard', () => {
    assert.match(store, /socket\.send\(\{ t: 'create', name, admin: admin\.token, \.\.\.\(activity \? \{ activity \} : \{\}\) \}\)/);
    assert.equal((store.match(/me: null, entry: null,/g) ?? []).length, 3, 'leave, closed room and removed all reset the entry');
  });

  test('an invite link skips the dashboard (it names a room, so the join page is the right first page)', () => {
    assert.match(store, /function openedWithInviteLink\(\)/);
    assert.match(store, /normalizeRoomCode\(new URLSearchParams\(location\.search\)\.get\('room'\)\)/);
    assert.match(landing, /useState<'join' \| 'host'>\(invite \? 'join' : 'host'\)/, 'and it opens on Join with the code filled in');
  });

  test('room screens are routed exactly as before: dashboard / activities by room.activity, TypeDrive’s lobby, race and results unchanged', () => {
    const order = ["room.activity === 'hub'", "room.activity === 'pose'", "room.activity === 'trivia'", 'room.match.ended', "room.phase === 'lobby'", "room.phase === 'results'"].map((s) => app.indexOf(s, app.indexOf('let screen')));
    assert.ok(order.every((i) => i > 0) && order.every((v, i) => i === 0 || v > order[i - 1]!), `routing order ${order}`);
    assert.match(app, /screen = <Lobby \/>;/);
  });
});
