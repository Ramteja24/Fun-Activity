import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NAME_MAX, VEHICLE_COUNT } from '../shared/protocol';
import { FINISH_POINTS, OTHER_FINISHER_POINTS, TEAM_IDS, TEAMS, teamPointsFor } from '../shared/teams';
import { TeamBoard } from '../src/components/lobby/TeamBoard';
import {
  arrivalOrder,
  charsAt,
  DEMO_DRIVERS,
  DEMO_HOST_ID,
  DEMO_TEXT,
  demoDrivers,
  demoRacers,
  demoResults,
  demoRoom,
  demoViewer,
  lastFinishMs,
  teamSplit,
  teamTotals,
} from '../src/demo/mock';

// The 40-player demo (src/demo): the real lobby, race and results screens shown with make-believe data. The data is checked as data
// (counts, teams, scoring, the shape of the room) and the sources are checked for what the demo must never do: connect, send or touch a
// real room. The pictures themselves were looked at in the browser, with 1, 10, 20 and 40 drivers.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n');

const drivers = demoDrivers();

describe('forty made-up drivers on the three teams', () => {
  test('forty drivers, 13 + 14 + 13 on the three existing teams, every one with their own car, every name different and short enough to fit', () => {
    assert.equal(drivers.length, DEMO_DRIVERS);
    assert.deepEqual(TEAMS.map((t) => drivers.filter((d) => d.team === t.id).length), [13, 14, 13]);
    assert.equal(new Set(drivers.map((d) => d.vehicle)).size, 40, 'forty different cars');
    assert.ok(drivers.every((d) => d.vehicle >= 0 && d.vehicle < VEHICLE_COUNT));
    assert.equal(new Set(drivers.map((d) => d.name.toLowerCase())).size, 40);
    assert.ok(drivers.every((d) => d.name.length <= NAME_MAX));
    assert.equal(new Set(drivers.map((d) => d.id)).size, 40);
    assert.ok(drivers.every((d) => TEAM_IDS.includes(d.team)), 'only the three real teams');
  });

  test('the split is as even as it gets for any room size (1, 10, 20, 40, …) and never loses or adds a driver', () => {
    for (const n of [0, 1, 2, 3, 10, 20, 39, 40, 41, 50]) {
      const sizes = teamSplit(n);
      assert.equal(sizes.length, 3);
      assert.equal(sizes.reduce((a, b) => a + b, 0), n, `${n} drivers`);
      assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `${n} drivers: ${sizes.join(', ')}`);
    }
    assert.deepEqual(teamSplit(40), [13, 14, 13]);
    assert.deepEqual([1, 10, 20].map((n) => demoDrivers(n).length), [1, 10, 20]);
  });

  test('the names are the teams’ own reference lists minus the host, who spectates — so nobody on a list is "still to join"', () => {
    const listed = new Set(TEAMS.flatMap((t) => t.members));
    assert.ok(drivers.every((d) => listed.has(d.name)));
    assert.ok(!drivers.some((d) => d.name === 'Srinath Chagaleti'), 'the host is not a driver');
    assert.equal(listed.size - drivers.length, 1, 'exactly one name on the lists is not a driver: the host');
  });

  test('the same demo every time: no clock and no Math.random in the data', () => {
    assert.deepEqual(demoDrivers(), demoDrivers());
    assert.deepEqual(arrivalOrder(drivers).map((d) => d.id), arrivalOrder(drivers).map((d) => d.id));
    assert.doesNotMatch(read('src/demo/mock.ts'), /Math\.random|Date\.now|performance\.now/);
  });
});

describe('the lobby with 1, 10, 20 and 40 drivers (the real pit bays, rendered from made-up rooms)', () => {
  const board = (n: number) => {
    const ds = demoDrivers(n);
    const room = demoRoom({ phase: 'lobby', present: ds });
    return { ds, html: renderToStaticMarkup(createElement(TeamBoard, { room, me: DEMO_HOST_ID, isHost: true, onKick() {}, onPick() {} })) };
  };

  for (const n of [1, 10, 20, 40]) {
    test(`${n} driver${n === 1 ? '' : 's'}: all three bays are there, every driver is in their team's bay, every name is printed in full`, () => {
      const { ds, html } = board(n);
      assert.equal((html.match(/<section class="tm-card /g) ?? []).length, 3);
      assert.equal((html.match(/<li class="lb-row/g) ?? []).length, n, 'one row per driver');
      const sizes = teamSplit(n);
      TEAMS.forEach((t, i) => {
        const bay = html.split('<section class="tm-card ').filter((s) => s.startsWith(`tm-${t.id}`))[0]!;
        assert.equal((bay.match(/<li class="lb-row/g) ?? []).length, sizes[i], `${t.name}`);
        assert.ok(bay.includes(`${sizes[i]} ${sizes[i] === 1 ? 'player' : 'players'}`));
      });
      for (const d of ds) assert.ok(html.includes(`<span class="lb-nm">${d.name}</span>`), d.name);
      assert.doesNotMatch(html, /<li class="tm-wait/, 'nobody is waiting to join');
      assert.doesNotMatch(html, /Race host|Spectating/, 'no host panel');
    });
  }

  test('once any bay has more than six drivers all three pack them tighter ("dense"), so they stay equals; small rooms keep the roomy rows and waiting positions', () => {
    // 20 drivers is 7 + 7 + 6: the bay with six is dense too
    assert.equal((board(20).html.match(/class="tm-card [^"]*\bdense\b/g) ?? []).length, 3);
    const forty = board(40).html;
    assert.equal((forty.match(/class="tm-card [^"]*\bdense\b/g) ?? []).length, 3);
    const ten = board(10).html;
    assert.equal((ten.match(/class="tm-card [^"]*\bdense\b/g) ?? []).length, 0);
    assert.ok(board(1).html.includes('tm-slot'), 'free positions in the bays of a nearly empty room');
    assert.ok(!ten.includes('tm-slot') && !forty.includes('tm-slot'), 'a bay with three or more drivers has none left');
  });
});

describe('the race: forty cars on one passage', () => {
  const len = DEMO_TEXT.length;

  test('the passage is the length of the real ones (300–350 characters)', () => {
    assert.ok(len >= 300 && len <= 350, `${len} characters`);
  });

  test('everyone only moves forward, everyone finishes, and the times are those of a real race (30–100 s)', () => {
    for (const d of drivers) {
      let last = 0;
      for (let ms = 0; ms <= d.finishMs + 500; ms += 250) {
        const c = charsAt(d, ms);
        assert.ok(c >= last - 1e-9, `${d.name} never goes backwards`);
        last = c;
      }
      assert.ok(charsAt(d, d.finishMs) >= len && charsAt(d, d.finishMs - 100) < len + 8, `${d.name} crosses the line at their finish time`);
    }
    const first = Math.min(...drivers.map((d) => d.finishMs));
    assert.ok(first >= 30_000 && lastFinishMs(drivers) <= 100_000, `${first / 1000} s to ${lastFinishMs(drivers) / 1000} s`);
  });

  test('the live state is sorted leader-first, has every driver once, and a driver who has finished is home with their time', () => {
    for (const ms of [0, 5_000, 20_000, 45_000, 70_000, 100_000]) {
      const racers = demoRacers(drivers, ms);
      assert.equal(racers.length, 40);
      assert.equal(new Set(racers.map((r) => r[0])).size, 40);
      const done = racers.filter((r) => r[3] > 0);
      assert.deepEqual(done.map((r) => r[3]), [...done.map((r) => r[3])].sort((a, b) => a - b), 'finishers by time');
      assert.ok(racers.slice(0, done.length).every((r) => r[3] > 0), 'finishers first');
      const rest = racers.slice(done.length);
      assert.ok(rest.every((r, i) => i === 0 || rest[i - 1]![1] >= r[1]), 'the others by position');
    }
    assert.ok(demoRacers(drivers, lastFinishMs(drivers) + 1).every((r) => r[3] > 0), 'all home at the end');
  });

  test('forty racers: the road draws a car for every one of them (the dot map is gone) and the standings list everyone', () => {
    const spectator = read('src/screens/Spectator.tsx');
    assert.match(spectator, /<Standings players=\{room\.players\} meId=\{me\} \/>/);
    assert.match(spectator, /className=\{`stage\$\{engine\.field \? ' field spectator' : ''\}`\}/);
    assert.doesNotMatch(spectator, /FieldMap/, 'no dots standing in for cars');
    assert.ok(!existsSync(join(root, 'src/components/race/FieldMap.tsx')));
    // in the standings, a big field gets tighter rows
    assert.match(read('src/components/race/Standings.tsx'), /rows\.length > 14 \? ' big' : ''/);
  });

  test('the driver view is a mid-pack driver: 20th of 40', () => {
    const v = demoViewer(drivers)!;
    assert.equal(demoResults(drivers).find((r) => r.id === v.id)!.rank, 20);
  });
});

describe('the results: places, points and team totals', () => {
  const rows = demoResults(drivers);
  const { standings, gained } = teamTotals(rows);

  test('forty ranked rows, places 1..40 by finish time, points by the shared table', () => {
    assert.deepEqual(rows.map((r) => r.rank), Array.from({ length: 40 }, (_, i) => i + 1));
    assert.ok(rows.every((r, i) => i === 0 || rows[i - 1]!.timeMs! <= r.timeMs!));
    assert.ok(rows.every((r) => r.finished && r.teamPoints === teamPointsFor(r.rank, true)));
    assert.deepEqual(rows.slice(0, 5).map((r) => r.teamPoints), [...FINISH_POINTS]);
    assert.ok(rows.slice(5).every((r) => r.teamPoints === OTHER_FINISHER_POINTS));
  });

  test('each team’s total is the sum of its drivers’ points, and the three add up to everything awarded', () => {
    for (const t of TEAMS) assert.equal(gained[t.id], rows.filter((r) => r.team === t.id).reduce((a, r) => a + r.teamPoints, 0), t.name);
    const awarded = FINISH_POINTS.reduce((a, b) => a + b, 0) + OTHER_FINISHER_POINTS * 35;
    assert.equal(gained.titans + gained.vibe + gained.ctrl, awarded);
    // the standings are ranked by those totals, and a tie would share a rank
    for (const s of standings) assert.equal(s.points, gained[s.id]);
    const best = Math.max(...standings.map((s) => s.points));
    assert.ok(standings.filter((s) => s.points === best).every((s) => s.rank === 1));
  });

  test('the room for the results carries the same numbers the server would: results rows, standings and match.last.gained', () => {
    const room = demoRoom({ phase: 'results', present: drivers, results: rows });
    assert.equal(room.phase, 'results');
    assert.deepEqual(room.results, rows);
    assert.deepEqual(room.match.last, { raceId: room.race!.id, gained });
    assert.equal(room.match.races, 1);
    assert.equal(room.teams.length, 3);
    assert.equal(room.players.filter((p) => p.host).length, 1);
    assert.ok(room.players.filter((p) => !p.host).every((p) => p.racing && p.team !== null));
    assert.equal(room.players.find((p) => p.id === rows[0]!.id)!.trophies, 25, 'the winner’s trophies');
  });

  test('the lobby room before any race: nobody racing, nothing scored, the host flagged as the host and never as a driver', () => {
    const room = demoRoom({ phase: 'lobby', present: drivers });
    assert.equal(room.hostId, DEMO_HOST_ID);
    assert.equal(room.race, null);
    assert.equal(room.match.races, 0);
    assert.ok(room.teams.every((t) => t.points === 0));
    assert.deepEqual(room.players.filter((p) => p.host).map((p) => p.id), [DEMO_HOST_ID]);
    assert.ok(room.players.every((p) => !p.racing));
    assert.equal(room.capacity, 50);
  });
});

describe('the demo never reaches a real room', () => {
  const session = read('src/demo/session.ts');
  const mock = read('src/demo/mock.ts');
  const dock = read('src/demo/DemoDock.tsx');

  test('no connection, no request, no storage: the demo files cannot open a socket, fetch anything or save a session', () => {
    for (const [name, src] of [['session', session], ['mock', mock], ['dock', dock]] as const) {
      assert.doesNotMatch(src, /new WebSocket|fetch\(|XMLHttpRequest|sessionStorage|localStorage|socket\.send|\.send\(\{/, name);
    }
  });

  test('while it is open the socket is muted, the server’s messages are ignored, and a real session is not resumed', () => {
    assert.match(session, /socket\.muted = true;/);
    assert.match(session, /socket\.muted = false;/);
    assert.match(read('src/net/socket.ts'), /if \(this\.muted && msg\.t !== 'ping'\) return false;/, 'only the clock-sync ping still goes out');
    const store = read('src/store.ts');
    assert.match(store, /function onMessage\(m: ServerMsg\) \{\s*if \(useGame\.getState\(\)\.demo\) return;/);
    assert.match(store, /if \(s && !pending && !useGame\.getState\(\)\.demo\)/, 'no session is resumed while the demo is open');
  });

  test('it opens only from a screen with no room, and closing puts every action back', () => {
    assert.match(session, /if \(g\.room \|\| g\.demo\) return;/);
    for (const key of ['create', 'join', 'setTeam', 'setDifficulty', 'start', 'endRace', 'backToLobby', 'endMatch', 'newMatch', 'openActivity', 'poseOp', 'triviaOp', 'answer', 'leave', 'kick', 'setEntry']) {
      assert.ok(session.includes(`'${key}'`), `${key} is replaced while the demo is open`);
    }
    assert.match(session, /\.\.\.\(saved \?\? \{\}\),\s*demo: false,\s*room: null,\s*me: null,/);
    assert.match(session, /leave: closeDemo,/, 'Leave / Exit race closes the demo instead of leaving a room');
  });

  test('a clear way in and out: a button on the dashboard and on TypeDrive’s landing page only, and Close demo (or Esc) in the bar', () => {
    assert.match(read('src/screens/Welcome.tsx'), /onClick=\{openDemo\}[\s\S]*?<span>40-player demo<\/span>/);
    const landing = read('src/screens/Landing.tsx');
    assert.match(landing, /\{!game && isAdmin && \(\s*<button className="lb-leave dd-open" onClick=\{openDemo\}/, 'not on the Funny Pose or Tech Trivia pages');
    for (const f of ['src/screens/FunnyPose.tsx', 'src/screens/TechTrivia.tsx']) assert.doesNotMatch(read(f), /openDemo|demo/i, f);
    assert.match(dock, /Close demo/);
    assert.match(dock, /e\.key === 'Escape'/);
    assert.match(dock, /<span>Close demo<\/span>/);
    for (const tab of ['Lobby', 'Race', 'Results']) assert.ok(dock.includes(`label: '${tab}'`), tab);
    assert.match(read('src/App.tsx'), /<DemoDock \/>/);
  });

  test('the bar says what it is, and the race stage fits below it', () => {
    assert.match(dock, /mock data/);
    assert.match(read('src/game/hooks.ts'), /getPropertyValue\('--demo-h'\)/);
    const css = read('src/ui/results.css');
    assert.match(css, /html\[data-demo\] #root \{\s*padding-top: var\(--demo-h\);/);
    assert.match(css, /html\[data-demo\] \.site-bar \{\s*top: var\(--demo-h\);/, 'the sticky header sits under the bar, not behind it');
    assert.doesNotMatch(css, /@import|url\(['"]?https?:/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.dd-tab\.hot \{\s*animation: none;/);
    // the bar's styles live with the results styles, loaded after the design system
    const main = read('src/main.tsx');
    assert.ok(main.indexOf("import './ui/results.css'") > main.indexOf("import './ui/theme.css'"));
  });
});
