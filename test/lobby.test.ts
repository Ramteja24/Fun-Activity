import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DIFFICULTIES } from '../shared/difficulty';
import type { PlayerInfo, RoomInfo } from '../shared/protocol';
import { TEAMS, type TeamId } from '../shared/teams';
import { LobbyDifficulty } from '../src/components/lobby/LobbyDifficulty';
import { TeamBoard } from '../src/components/lobby/TeamBoard';

// The race lobby: the three team bays (rendered for real, from fixture rooms), the room-code panel, race setup, and guards that nothing
// about rooms, joining, teams, difficulty or the host's spectator seat changed. Source-level guards plus static renders (there is no DOM
// here); the real screen was also driven in a browser at 1920×1080, 1440×900, 1366×768 and 390×844, with the 40-player demo.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const css = read('src/ui/lobby.css');

const player = (id: string, name: string, team: TeamId | null, extra: Partial<PlayerInfo> = {}): PlayerInfo =>
  ({ id, name, host: false, connected: true, team, vehicle: 0, trophies: 0, racing: false, ...extra }) as PlayerInfo;
const room = (players: PlayerInfo[], extra: Record<string, unknown> = {}) =>
  ({
    phase: 'lobby',
    players,
    teams: TEAMS.map((t, i) => ({ id: t.id, name: t.name, points: 0, rank: i + 1, tied: false })),
    match: { races: 0, ended: false },
    ...extra,
  }) as unknown as RoomInfo;
const board = (r: RoomInfo, me = 'me', isHost = false) => renderToStaticMarkup(createElement(TeamBoard, { room: r, me, isHost, onKick() {}, onPick() {} }));

describe('the three pit bays', () => {
  const host = player('h', 'Marshal', null, { host: true });

  test('an empty grid is three bays side by side, each with its emblem, bay number and waiting positions — and no plain empty boxes', () => {
    const html = board(room([host]), 'h', true);
    for (const id of ['titans', 'vibe', 'ctrl']) assert.match(html, new RegExp(`class="tm-card tm-${id}[ "]`), id);
    assert.deepEqual([...html.matchAll(/Pit bay (\d)/g)].map((m) => m[1]), ['1', '2', '3']);
    assert.equal((html.match(/class="tm-emblem"/g) ?? []).length, 3, 'a different emblem on each bay');
    assert.equal((html.match(/class="tm-none"/g) ?? []).length, 3, 'each empty bay says nobody is there yet');
    // …then two more waiting positions (P2, P3) with the outline of a car
    assert.equal((html.match(/class="tm-slot" aria-hidden="true"/g) ?? []).length, 6);
    assert.equal((html.match(/class="tm-ghost"/g) ?? []).length, 6);
    assert.deepEqual([...html.matchAll(/<b>P(\d)<\/b> Waiting position/g)].map((m) => m[1]), ['2', '3', '2', '3', '2', '3']);
    assert.doesNotMatch(html, /tm-card[^>]*occupied/);
  });

  test('a driver’s car sits in their team’s bay, the free positions shrink, and a full bay has none left', () => {
    const r = room([host, player('a', 'Asha', 'titans'), player('b', 'Ben', 'titans'), player('c', 'Chitra', 'titans'), player('d', 'Dev', 'titans'), player('e', 'Esha', 'vibe')]);
    const html = board(r, 'a');
    const bays = html.split('<section class="tm-card').slice(1);
    assert.equal(bays.length, 3);
    const [titans, vibe, ctrl] = bays as [string, string, string];
    assert.equal((titans.match(/class="lb-row/g) ?? []).length, 4, 'all four on The Titans');
    assert.equal((titans.match(/tm-slot/g) ?? []).length, 0, 'four drivers fill the three positions: nothing left waiting');
    assert.equal((vibe.match(/class="lb-row/g) ?? []).length, 1);
    assert.equal((vibe.match(/tm-slot/g) ?? []).length, 2, 'one driver leaves positions P2 and P3 free');
    assert.match(vibe, /<b>P2<\/b>/);
    assert.equal((ctrl.match(/class="lb-row/g) ?? []).length, 0);
    assert.match(titans, /occupied/);
    assert.match(titans, /4 players · 4 online/);
    assert.match(ctrl, /Nobody yet/);
    // the car of each driver is drawn (one Vehicle svg per driver)
    assert.equal((html.match(/class="lb-veh"/g) ?? []).length, 5);
  });

  test('team names, player counts and points are shown for each bay, from the room’s snapshot', () => {
    const r = room([host, player('a', 'Asha', 'titans'), player('b', 'Ben', 'vibe', { connected: false })], {
      teams: [
        { id: 'titans', name: 'The Titans', points: 175, rank: 1, tied: false },
        { id: 'vibe', name: 'The Vibe Tribe', points: 50, rank: 2, tied: false },
        { id: 'ctrl', name: 'Ctrl + Alt + Defeat', points: 0, rank: 3, tied: false },
      ],
      match: { races: 1, ended: false },
    });
    const html = board(r);
    for (const name of ['The Titans', 'The Vibe Tribe', 'Ctrl + Alt + Defeat']) assert.ok(html.includes(name), name);
    assert.match(html, /<b>175<\/b>/);
    assert.match(html, /<b>50<\/b>/);
    assert.match(html, /1 player · 0 online/, 'a player who dropped is still counted, but not online');
    assert.match(html, /class="tm-rank"[^>]*>1<\/span>/);
  });

  test('the host is never drawn in a bay; only a driver who has not joined a team is, in a separate "choose a team" panel', () => {
    const r = room([host, player('a', 'Asha', null)]);
    const html = board(r, 'a');
    assert.doesNotMatch(html, /Marshal/, 'the host does not race and is not on the grid');
    assert.match(html, /Choose a team/);
    assert.equal((html.match(/class="lb-row/g) ?? []).length, 1);
  });

  test('a driver can still take or change a bay between races (and the host cannot)', () => {
    const asDriver = board(room([host, player('me', 'Me', null)]), 'me');
    assert.equal((asDriver.match(/Join this team/g) ?? []).length, 3);
    const onTeam = board(room([host, player('me', 'Me', 'vibe')]), 'me');
    assert.equal((onTeam.match(/Switch to this team/g) ?? []).length, 2, 'not offered for the bay they are already in');
    assert.doesNotMatch(board(room([host, player('me', 'Me', null)]), 'h', true), /Join this team|Switch to this team/);
    assert.match(board(room([host, player('me', 'Me', 'vibe')], { phase: 'racing' }), 'me'), /^(?!.*Switch to this team)/s, 'no switching mid-race');
  });
});

describe('the difficulty throttle', () => {
  test('three positions with one, two and three bars; the host can move it, everyone else only sees it', () => {
    const host = renderToStaticMarkup(createElement(LobbyDifficulty, { selected: 'hard', canChange: true, onSelect() {} }));
    assert.equal((host.match(/role="radio"/g) ?? []).length, 3);
    assert.deepEqual([...host.matchAll(/<b>(\w+)<\/b>/g)].map((m) => m[1]), DIFFICULTIES.map((d) => d.short));
    assert.deepEqual([...host.matchAll(/aria-checked="(\w+)"/g)].map((m) => m[1]), ['false', 'false', 'true'], 'the chosen level is marked');
    assert.doesNotMatch(host, /disabled/);
    const other = renderToStaticMarkup(createElement(LobbyDifficulty, { selected: 'easy', canChange: false, onSelect() {} }));
    assert.equal((other.match(/disabled=""/g) ?? []).length, 3, 'a driver cannot change the level');
    assert.deepEqual([...other.matchAll(/aria-checked="(\w+)"/g)].map((m) => m[1]), ['true', 'false', 'false']);
    // it sends the very same message as the full-screen picker, and only for a different level
    const src = read('src/components/lobby/LobbyDifficulty.tsx');
    assert.match(src, /onClick=\{\(\) => canChange && !on && onSelect\(d\.id\)\}/);
  });
});

describe('the lobby screen: look changed, behaviour not', () => {
  const lobby = read('src/screens/Lobby.tsx');

  test('room code, QR, invite link, copy and the host’s spectator seat are exactly as before', () => {
    assert.match(lobby, /const link = `\$\{base\}\/\?room=\$\{room\.code\}`;/);
    assert.match(lobby, /QRCode\.toDataURL\(link, \{ margin: 1, width: 240, color: \{ dark: '#07071f', light: '#ffffff' \} \}\)/);
    assert.match(lobby, /await navigator\.clipboard\.writeText\(text\)/);
    assert.match(lobby, /export function useShareBase\(\)/);
    assert.match(lobby, /aria-label=\{`Room code \$\{room\.code\.split\(''\)\.join\(' '\)\}`\}/);
    assert.match(lobby, /const drivers = room\.players\.filter\(\(p\) => !p\.host\);/);
    assert.match(lobby, /const online = drivers\.filter\(\(p\) => p\.connected && p\.team !== null\)\.length;/);
    assert.match(lobby, /You host and watch the race/);
    // no new messages are sent from the lobby
    assert.doesNotMatch(lobby, /socket\.send|\.send\(\{/);
  });

  test('Start still needs a driver on a team and still opens the level screen first; Select difficulty is unchanged', () => {
    assert.match(lobby, /disabled=\{online === 0\} onClick=\{\(\) => setPickingDifficulty\(true\)\}/);
    assert.match(lobby, /onStart=\{\(\) => start\(room\.difficulty\)\}/);
    assert.match(lobby, /onSelect=\{setDifficulty\}/);
    assert.match(lobby, /<DifficultyBadge difficulty=\{room\.difficulty\} variant="lobby" \/>/);
    assert.match(lobby, /<LobbyDifficulty selected=\{room\.difficulty\} canChange=\{isHost\} onSelect=\{setDifficulty\} \/>/);
    assert.match(lobby, /\{isHost \? 'Select difficulty' : 'View levels'\}/);
  });

  test('"grid ready" is only a look: a status board read from the count the lobby already had', () => {
    assert.match(lobby, /const GRID_READY = 3;/);
    assert.match(lobby, /const grid = online === 0 \? 'waiting' : online < GRID_READY \? 'forming' : 'ready';/);
    assert.match(lobby, /className=\{`lp lb lb-\$\{grid\}\$\{crowd \? ' lb-crowd' : ''\}\$\{isHost \? '' : ' lb-player'\}`\}/);
    // "crowded" is a look as well (the QR folds away above twelve drivers): it is read from the roster and used for nothing else
    assert.match(lobby, /const crowd = taken > CROWD_FROM;/);
    assert.equal((lobby.match(/\bcrowd\b/g) ?? []).length, 3, 'defined once, used once for the class');
    // the count is used for nothing else: the start button's rule is still `online === 0`
    assert.equal((lobby.match(/GRID_READY/g) ?? []).length, 2);
    // the start-light gantry was decoration and is gone
    assert.doesNotMatch(lobby, /GANTRY|lb-gantry/);
  });

  test('the lobby shows no panel for the host (no card, name, status or eye), and no control-tower wording or picture; the waiting message for drivers is still there', () => {
    assert.match(lobby, /<section className="lb-control" aria-label="Race setup">/);
    for (const f of ['src/screens/Lobby.tsx', 'src/components/lobby/LobbyDifficulty.tsx', 'src/components/lobby/TeamBoard.tsx', 'src/components/lobby/TeamEmblem.tsx', 'src/ui/lobby.css']) {
      assert.doesNotMatch(read(f), /tower|director|radar|control room|lb-hostcard|lb-hosticon|lb-role/i, f);
    }
    assert.doesNotMatch(lobby, /IconEye|Race host · Spectator|Spectating · hosts and watches|Offline · host seat reserved/);
    // the host is still the room's spectator: the lobby still tells them so in its lead line, and the Start rules are unchanged
    assert.match(lobby, /You host and watch the race — start it once your drivers are on the grid\./);
    assert.match(lobby, /const hostInfo = room\.players\.find\(\(p\) => p\.host\);/);
    assert.match(lobby, /Waiting for \$\{hostInfo\.name\} \(the host\) to start the race…/);
    assert.match(lobby, /Waiting for a driver to join — share the room code\./);
  });

  test('the page has no decorative backdrop; the cars still drive into their bays, and every lobby animation is off under reduced motion', () => {
    assert.doesNotMatch(lobby, /lb-set|lb-truss|lb-fog|lb-floor/, 'no paddock lights, fog or pit lane behind the page');
    assert.match(css, /\.tm-list \.lb-veh \{\s*animation: lb-drive /);
    assert.match(css, /@keyframes lb-drive \{\s*0% \{\s*opacity: 0;\s*transform: translateX\(-230%\);/);
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    for (const sel of ['.tm-list .lb-veh', '.lb-share .lb-plate']) assert.ok(block.includes(sel), sel);
    assert.match(block, /animation: none !important;/);
    assert.match(read('src/main.tsx'), /import '\.\/ui\/lobby\.css';/);
  });

  test('the lobby fits the window: a frame of rows, the bays filling the rest, tight rows for a big room, Start docked on phones', () => {
    // from 1000 px: a title row, then the invite + race setup column beside the three bays, which take the remaining height
    assert.match(css, /@media \(min-width: 1000px\) \{\s*\.lb-main \{\s*display: grid;\s*grid-template-rows: auto minmax\(0, 1fr\);/);
    assert.match(css, /@media \(min-width: 1000px\) \{\s*\.lb-grid \{\s*grid-template-columns: clamp\(290px, 24vw, 350px\) minmax\(0, 1fr\);/);
    assert.match(css, /@media \(min-width: 760px\) \{\s*\.tm-cols \{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
    // a full bay packs its rows so fourteen drivers fit without a list that scrolls
    assert.match(css, /\.tm-card\.dense \.lb-row,[^{]*\{\s*min-height: 26px;/);
    // a short window folds the QR code behind its button; a tall one shows it unless the room is crowded
    assert.match(css, /@media \(min-width: 1000px\) and \(min-height: 900px\) \{\s*\.lb:not\(\.lb-crowd\):not\(\.lb-player\) \.lb-more \{\s*display: flex;/);
    // on a phone the start control is docked to the bottom of the screen and nothing above it clips it
    assert.match(css, /\.lb-foot \{\s*position: fixed;/);
    const control = css.match(/\.lb-control \{\s*position: relative;[^}]*\}/)?.[0] ?? '';
    assert.ok(control.length > 0, 'the race-setup panel rule');
    assert.doesNotMatch(control, /clip-path|transform:|filter:|backdrop-filter|contain:/, 'the panel that holds Start must not clip or transform it (a phone docks Start with position: fixed)');
    // light theme: no dark page background or neon glow in the lobby's own stylesheet
    assert.doesNotMatch(css, /#0[0-9a-f]{5}\b|text-shadow/i);
  });

  test('the countdown brief reads the room and adds no timing: the lights, numbers and sounds are still driven by goAt', () => {
    const o = read('src/components/race/Overlays.tsx');
    assert.match(o, /const level = room \? difficultyDef\(room\.race\?\.difficulty \?\? room\.difficulty\)\.name : null;/);
    assert.match(o, /\{stage !== 0 && level && \(/);
    assert.match(o, /export function Countdown\(\{ stage \}: \{ stage: CountdownStage \}\)/);
    assert.match(read('src/screens/Spectator.tsx'), /<Countdown stage=\{stage\} \/>/);
    assert.match(read('src/screens/Race.tsx'), /countdownAudio\.begin\(`\$\{raceId\}@\$\{goAt\}`, goAt\)/);
  });
});
