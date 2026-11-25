import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Source-level guards for the team screens (there is no DOM test environment here — the real thing was also checked in a
// browser): picking a team when joining, the three team sections in the lobby, the standings after a race and the match
// results screen. The rules themselves are tested in teams.test.ts.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('picking a team', () => {
  test('joining asks for a team, with no default: the Join button stays disabled until one is chosen, and the host needs none', () => {
    const landing = read('src/screens/Landing.tsx');
    assert.match(landing, /useState<TeamId \| null>\(null\)/, 'no team is pre-selected');
    assert.match(landing, /role="radiogroup"/);
    assert.match(landing, /aria-checked=\{team === t\.id\}/);
    assert.match(landing, /TEAMS\.map\(/, 'all three teams are offered');
    assert.match(landing, /\(!codeOk \|\| !team\)/, 'no team, no join');
    assert.match(landing, /else if \(codeOk && team\) join\(code, name, team\)/);
    assert.match(landing, /\{tab === 'join' && \(\s*<fieldset/, 'the picker belongs to the join tab only');
    assert.doesNotMatch(landing, /setTeam\(TEAMS\[|setTeam\('titans'\)|Math\.random/, 'never assigned, never random');
  });

  test('a name on a team list is only a hint — a badge on that team — and never selects it', () => {
    const landing = read('src/screens/Landing.tsx');
    assert.match(landing, /rosterTeamFor\(name\)/);
    assert.match(landing, /suggested === t\.id &&/);
    assert.match(landing, /tp-sugg/);
    assert.doesNotMatch(landing, /setTeam\(suggested/);
  });

  test('the store sends the pick with the join and offers switching, ending the match and a new match', () => {
    const store = read('src/store.ts');
    assert.match(store, /socket\.send\(\{ t: 'join', room: code, name, team, \.\.\.\(admin \? \{ admin: admin\.token \} : \{\}\) \}\)/);
    assert.match(store, /socket\.send\(\{ t: 'team', team \}\)/);
    assert.match(store, /socket\.send\(\{ t: 'match_end' \}\)/);
    assert.match(store, /socket\.send\(\{ t: 'match_new' \}\)/);
  });

  test('the rehearsal bots pick their teams too (spread over the three)', () => {
    assert.match(read('scripts/bots.ts'), /team: TEAM_IDS\[i % TEAM_IDS\.length\]/);
  });
});

describe('the lobby', () => {
  test('shows the three teams separately — name, player names, player count, points and rank — and updates from the room snapshot', () => {
    const board = read('src/components/lobby/TeamBoard.tsx');
    assert.match(board, /TEAMS\.map\(\(def(, bay)?\) =>/);
    assert.match(board, /drivers\.filter\(\(p\) => p\.team === def\.id\)/, 'each team lists the players who chose it');
    assert.match(board, /\{members\.length\} \{members\.length === 1 \? 'player' : 'players'\}/, 'with a player count');
    assert.match(board, /<b>\{s\.points\}<\/b>/, 'and the running points');
    assert.match(board, /rankLabel\(s\.rank, s\.tied, scored\)/, 'and the rank (T1 for a tie, a dash before the first race)');
    assert.match(board, /room\.teams\.map\(/, 'points and ranks come from the server’s snapshot');
    assert.doesNotMatch(board, /Math\.random|shuffle|autoAssign|assignTeam/i, 'nobody is put on a team for the player');
  });

  test('the reference lists show who is still to join, and a driver can switch teams only between races', () => {
    const board = read('src/components/lobby/TeamBoard.tsx');
    assert.match(board, /def\.members\.filter\(\(m\) => !joined\.has\(nameKey\(m\)\)\)/);
    assert.match(board, /have not joined yet|has not joined yet/);
    assert.match(board, /const canPick = !isHost && !room\.match\.ended && \(room\.phase === 'lobby' \|\| room\.phase === 'results'\)/);
    assert.match(board, /canPick && !isMine &&/);
    assert.match(board, /Choose a team/, 'a driver without a team is told to pick');
  });

  test('the lobby uses it, and a driver who has not picked a team is not counted as racing', () => {
    const lobby = read('src/screens/Lobby.tsx');
    assert.match(lobby, /<TeamBoard room=\{room\} me=\{me\} isHost=\{isHost\} onKick=\{kick\} onPick=\{setTeam\} \/>/);
    assert.match(lobby, /Teams on the grid/);
    assert.match(lobby, /p\.connected && p\.team !== null/);
  });

  test('each team has its own accent colour', () => {
    // the team colours are part of the design system (src/ui/theme.css): each .tm-<id> hook paints with its own token
    const css = read('src/ui/theme.css');
    const colours = ['titans', 'vibe', 'ctrl'].map((id) => {
      assert.match(css, new RegExp(`\\.tm-${id} \\{\\s*--tm: var\\(--${id}\\);`));
      return css.match(new RegExp(`--${id}: (#[0-9a-f]{6});`))![1];
    });
    assert.equal(new Set(colours).size, 3, 'three different colours');
  });
});

describe('results and the match', () => {
  test('after each race the results page shows every team’s rank, what the race added and the running total', () => {
    // the results screen and the team cards it is built from (components/results/TeamResults.tsx)
    const r = read('src/screens/Results.tsx') + read('src/components/results/TeamResults.tsx');
    assert.match(r, /Team standings <span>after/);
    assert.match(r, /room\.match\.last\?\.gained/);
    assert.match(r, /\+\{g\} this race/);
    assert.match(r, /\+\{l\.teamPoints\}\s*<span className="rk-u"> team pts/, 'each driver’s row shows what they earned their team');
    assert.match(r, /\+0<span className="rk-u"> team pts/, 'a DNF shows 0');
  });

  test('the host ends the match from the results page (after a confirmation); drivers cannot', () => {
    const r = read('src/screens/Results.tsx');
    assert.match(r, /room\.match\.races > 0 &&/);
    assert.match(r, /aria-label="Confirm end match"/);
    assert.match(r, /End match · declare the winning team/);
    // …and it sits in the host-only branch
    const hostBranch = r.slice(r.indexOf(') : isHost ? ('), r.indexOf('Waiting for the host to start the next race'));
    assert.match(hostBranch, /End match/);
  });

  test('once the match has ended everyone gets the match results screen', () => {
    const app = read('src/App.tsx');
    assert.match(app, /room\.match\.ended/);
    assert.match(app, /<MatchResultsScreen \/>/);
    assert.ok(app.indexOf('room.match.ended') < app.indexOf("room.phase === 'lobby'"), 'checked before the lobby / race screens');
  });

  test('the match results name the winner — or a tie — rank every team, list each driver’s contribution, and let only the host start over', () => {
    const m = read('src/screens/MatchResults.tsx');
    assert.match(m, /const tie = winners\.length > 1/);
    assert.match(m, /It’s a tie!/);
    assert.match(m, /Match winners/);
    assert.match(m, /<h1 className="win">\{top \? teamName\(top\.id\) : ''\}<\/h1>/);
    assert.match(m, /finish level on/);
    assert.match(m, /room\.match\.contributions/);
    assert.match(m, /rankLabel\(t\.rank, t\.tied, true\)/);
    assert.match(m, /c\.races/);
    const hostBranch = m.slice(m.indexOf('{isHost ? ('), m.indexOf('Waiting for the host to start a new match'));
    assert.match(hostBranch, /onClick=\{newMatch\}/, 'only the host can start a new match');
    assert.doesNotMatch(m, /Math\.random/, 'a tie is never broken at random');
  });
});

describe('the rest of the game is untouched', () => {
  test('racing, the countdown and the audio know nothing about teams', () => {
    for (const f of ['src/game/engine.ts', 'src/game/countdown.ts', 'src/audio/countdown-audio.ts', 'src/audio/sfx.ts', 'src/audio/controller.ts', 'src/screens/Race.tsx', 'src/screens/Spectator.tsx']) {
      assert.doesNotMatch(read(f), /teams?\b|TeamId/i, f);
    }
  });
});
