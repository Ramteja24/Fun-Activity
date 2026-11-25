import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ACTIVITIES } from '../shared/activities';

// Source-level guards for the Weekly Fun Activity screens (there is no DOM test environment here — the real screens were also
// driven in a browser). The rules behind them are tested in activities.test.ts.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('routing', () => {
  const app = read('src/App.tsx');

  test('the room’s activity picks the screen: dashboard, Funny Pose Challenge, Tech Trivia — and TypeDrive’s own screens are routed exactly as before', () => {
    const from = app.indexOf('let screen'); // the routing block (the music line above it also reads the room)
    const hub = app.indexOf("room.activity === 'hub'", from);
    const pose = app.indexOf("room.activity === 'pose'", from);
    const trivia = app.indexOf("room.activity === 'trivia'", from);
    const ended = app.indexOf('room.match.ended', from);
    assert.ok(hub > 0 && hub < pose && pose < trivia && trivia < ended, 'the new screens come before TypeDrive’s chain');
    for (const line of [
      'screen = <Lobby />;',
      'screen = <ResultsScreen />;',
      'screen = <MatchResultsScreen />;',
      "const racing = room.players.find((p) => p.id === me)?.racing;",
      'screen = !racing ? <SpectatorScreen /> : showResults ? <ResultsScreen /> : <RaceScreen />;',
    ]) {
      assert.ok(app.includes(line), `TypeDrive routing untouched: ${line}`);
    }
  });

  test('TypeDrive’s race screens know nothing about the portal', () => {
    for (const f of ['src/screens/Race.tsx', 'src/screens/Spectator.tsx', 'src/screens/Results.tsx', 'src/game/engine.ts', 'src/components/race/Track.tsx']) {
      assert.doesNotMatch(read(f), /activity|portal|\bpose\b|poseOp|trivia/i, f);
    }
  });

  test('the only changes inside TypeDrive’s lobby and match results are host-only buttons to the dashboard / next activity', () => {
    const lobby = read('src/screens/Lobby.tsx');
    assert.match(lobby, /\{isHost && \(\s*<button className="[^"]*" onClick=\{\(\) => openActivity\('hub'\)\}/);
    const results = read('src/screens/MatchResults.tsx');
    assert.match(results, /isHost[\s\S]{0,300}<button className="[^"]*" onClick=\{\(\) => openActivity\('pose'\)\}/, 'host-only: on to the Funny Pose Challenge');
    assert.match(results, /onClick=\{newMatch\}>\s*Start a new match · scores back to zero/, 'the new-match control keeps its words');
  });
});

describe('the dashboard', () => {
  const hub = read('src/screens/Hub.tsx');

  test('lists the three activities from the shared definition, in order, with status and their own team scores', () => {
    assert.deepEqual(ACTIVITIES.map((a) => a.name), ['TypeDrive', 'Funny Pose Challenge', 'Tech Trivia']);
    assert.match(hub, /ACTIVITIES\.map\(\(a, i\) =>/);
    assert.match(hub, /STATUS_LABEL\[score\.status\]/);
    assert.match(hub, /score\.points\[t\.id\]/);
    assert.match(hub, /aria-label=\{`\$\{a\.name\} team scores`\}/);
  });

  test('only the host can open an activity; everyone else is told it is up to the host', () => {
    assert.match(hub, /\{isHost \? \(\s*<button type="button" className="ph-open[^"]*" onClick=\{\(\) => openActivity\(a\.id\)\}/);
    assert.match(hub, /waiting for the host/i);
    const parts = read('src/portal/parts.tsx');
    assert.match(parts, /return isHost \? \(\s*<button key=\{target\} type="button" className=\{cls\}/, 'the stepper is clickable for the host only');
  });

  test('shows the overall leaderboard (placements + each activity’s own points), the teams with their members, the room code and a tie as a tie', () => {
    assert.match(hub, /room\.overall\]\.sort\(/);
    assert.match(hub, /r\.tied \? `T\$\{r\.rank\}` : r\.rank/);
    assert.match(hub, /placement pts/);
    assert.match(hub, /TeamRoster room=\{room\} me=\{me\} onPick=\{setTeam\}/);
    assert.match(hub, /lb-plate/);
    assert.match(hub, /overallLeaders\(room\.overall\)/);
    assert.match(hub, /never decided at random/);
  });

  test('is the room’s home: it is what a new room shows, and the chip header says what it is', () => {
    assert.match(read('src/portal/parts.tsx'), /tagline="Weekly Fun Activity"/);
    assert.match(read('src/components/SiteHeader.tsx'), /tagline = BRAND\.tagline/, 'TypeDrive’s own header text is the default');
  });
});

describe('Funny Pose Challenge', () => {
  const screen = read('src/screens/FunnyPose.tsx');
  const drawing = read('src/portal/PoseDrawing.tsx');

  test('the host chooses only the team: there is no way in the screen, the store or the protocol to choose a player', () => {
    for (const src of [screen, drawing, read('src/screens/Hub.tsx'), read('src/screens/TechTrivia.tsx'), read('src/portal/parts.tsx')]) {
      assert.doesNotMatch(src, /Math\.random|shuffle/, 'the pick is never made on a client');
    }
    assert.match(screen, /poseOp\(\{ op: 'team', team: t\.id \}\)/);
    assert.doesNotMatch(screen, /op: 'player'|op: 'back'|Change player|Choose who/, 'no player buttons, no "change player"');
    assert.doesNotMatch(screen, /fp-player|\.map\(\(m\) =>/, 'no list of players to click');
    assert.doesNotMatch(read('shared/protocol.ts'), /op: 'player'|op: 'back'/);
    assert.doesNotMatch(read('src/store.ts'), /'player'/);
  });

  test('only the host can click a team (everyone else watches), a team with nobody here or a spin in progress cannot be clicked', () => {
    assert.match(screen, /disabled=\{!isHost \|\| here\(t\.id\) === 0 \|\| spinning \|\| \(selected && p\.team === t\.id\)\}/);
    assert.match(screen, /TEAMS\.map\(\(t\) =>/, 'the three existing teams');
    assert.match(screen, /<HostBar isHost=\{isHost\}/, 'participants get a waiting message in place of the controls');
  });

  test('the spinner: one reel through the team’s names, timed from the server clock, stopping on the server’s pick, then the pick is highlighted', () => {
    const hooks = read('src/portal/hooks.ts');
    assert.match(hooks, /socket\.serverNow\(\) - startedAt\) \/ ms/);
    assert.match(hooks, /requestAnimationFrame/);
    assert.match(screen, /useSpinProgress\(p\.spinStartedAt, p\.spinMs\)/);
    assert.match(screen, /pool\.findIndex\(\(x\) => x\.id === p\.player\?\.id\)/, 'the reel stops on the player the server picked');
    assert.match(screen, /<Reel items=\{items\} target=\{target\} progress=\{run\}/);
    assert.match(screen, /useReducedMotion\(\)/);
    assert.match(read('src/portal/Reel.tsx'), /reduced \?/);
    assert.match(screen, /className="fp-selected" role="status"/, 'the picked player is highlighted when it stops');
    assert.match(screen, /\{spinning \? \(\s*<Spinner p=\{p\} \/>\s*\) : \(\s*<div className="fp-selected"/, 'and nobody is named while it spins');
  });

  test('the picked player is not lit or named anywhere until the spinner has stopped', () => {
    assert.match(screen, /const settled = !!p && \(p\.stage === 'selected' \|\| p\.stage === 'ready' \|\| p\.stage === 'posing' \|\| p\.stage === 'judged'\)/);
    assert.match(screen, /activePlayer=\{settled \? p\.player\?\.id : null\}/);
    assert.match(screen, /const mine = !!player && player\.id === me && p\.stage !== 'pick' && p\.stage !== 'spin'/);
  });

  test('shows the player and team prominently, the round, a clock and the team scores; the pose stays hidden until the host reveals it', () => {
    assert.match(screen, /Round <b>\{p\.round\}<\/b> \/ \{p\.rounds\}/);
    assert.match(screen, /<h2 className="er-up-name">\{player\.name\}<\/h2>/);
    assert.match(screen, /<p className="er-up-team">\{teamName\(team\)\}<\/p>/);
    assert.match(screen, /useSecondsLeft\(p\.endsAt\)/);
    assert.match(screen, /<ScoreStrip scores=\{p\.scores\}/);
    assert.match(screen, /const pose = poseById\(p\.poseId\)/, 'the pose exists on screen only once the server has sent its id');
    assert.match(screen, /\{pose && <PoseCard pose=\{pose\} outcome=\{judged \? p\.result : undefined\} \/>\}/);
    assert.match(screen, /The pose is hidden until the host reveals it/);
  });

  test('the host runs every step: start the round once the spinner has landed, reveal the pose, mark completed / not completed, next round', () => {
    for (const op of ['begin', 'reveal', 'done', 'notdone', 'next', 'start']) assert.match(screen, new RegExp(`poseOp\\(\\{ op: '${op}' \\}\\)`), op);
    assert.match(screen, /disabled=\{p\.stage !== 'selected'\}/, 'Start round waits for the spinner');
    assert.match(screen, /Completed · \+\{POSE_POINTS\} for \{teamName\(team\)\}/);
    assert.match(screen, /Not completed · 0 points/);
  });

  test('a finished session shows the winner (or a tie), every round, and the host’s next steps', () => {
    assert.match(screen, /It’s a tie!/);
    assert.match(screen, /openActivity\('trivia'\)/);
    assert.match(screen, /Next: Tech Trivia/);
  });

  test('the reference picture is drawn from joint angles as SVG, so every pose has a visual, and it respects reduced motion', () => {
    assert.match(drawing, /figureJoints\(figure\)/);
    assert.match(drawing, /<svg viewBox=/);
    assert.match(screen, /<PoseDrawing figure=\{pose\.figure\}/);
    const css = read('src/ui/home.css');
    assert.match(css, /\.fp-card \{[^}]*animation: ui-rise/s, 'the pose card arrives with a short entrance');
    assert.match(css, /\.fp-curtain::before \{[^}]*animation: arc-curtain-l/s, 'and a curtain that opens on it');
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^@]*\.fp-curtain \{\s*display: none;/s, 'no curtain under reduced motion');
  });

  test('Emoji Royale is gone: no code, text or style of the old game is left', () => {
    for (const f of ['src/screens/FunnyPose.tsx', 'src/screens/Hub.tsx', 'src/screens/Welcome.tsx', 'src/screens/Landing.tsx', 'src/screens/MatchResults.tsx', 'src/portal/parts.tsx', 'src/App.tsx', 'shared/activities.ts', 'shared/protocol.ts', 'server/room.ts', 'server/app.ts', 'src/ui/home.css']) {
      assert.doesNotMatch(read(f), /emoji/i, f);
    }
  });
});


describe('Tech Trivia', () => {
  const screen = read('src/screens/TechTrivia.tsx');

  test('one question at a time with A–D options and a timer; a participant’s answer is sent once and is final', () => {
    assert.match(screen, /const LETTERS = \['A', 'B', 'C', 'D'\]/);
    assert.match(screen, /useSecondsLeft\(t\.endsAt\)/);
    assert.match(screen, /const canAnswer = open && !isHost && picked === undefined && left > 0/);
    assert.match(screen, /disabled=\{!canAnswer\}/);
    assert.match(screen, /onClick=\{\(\) => answer\(t\.index, i\)\}/);
    const store = read('src/store.ts');
    assert.match(store, /if \(key in myAnswers\) return; \/\/ final/);
    assert.match(store, /socket\.send\(\{ t: 'answer', q, choice \}\)/);
    assert.match(store, /sessionStorage\.setItem\(ANSWERS_KEY/, 'a refresh keeps the pick shown');
  });

  test('the right answer is not drawn until the server has revealed it', () => {
    assert.match(screen, /const revealed = t\.stage === 'reveal' \? t\.reveal : undefined/);
    assert.match(screen, /const right = revealed && i === revealed\.correct/);
    assert.doesNotMatch(screen, /question\.correct|\bt\.correct/, 'it never reads a correct index off the question');
  });

  test('shows who has answered (counts only), the per-team points of the question, the explanation and the final leaderboard with top players', () => {
    assert.match(screen, /<b>\{t\.answered\}<\/b> of \{t\.eligible\} answered/);
    assert.match(screen, /t\.answeredByTeam\[x\.id\]/);
    assert.match(screen, /revealed\.gained\[x\.id\]/);
    assert.match(screen, /revealed\.explanation/);
    assert.match(screen, /Final leaderboard/);
    assert.match(screen, /Top players/);
    assert.match(screen, /It’s a tie!/);
  });

  test('the host starts, reveals and moves on; other players only answer', () => {
    assert.match(screen, /triviaOp\('start'\)/);
    assert.match(screen, /triviaOp\('reveal'\)/);
    assert.match(screen, /triviaOp\('next'\)/);
    assert.match(screen, /<HostBar isHost=\{isHost\}/);
    assert.match(screen, /openActivity\('hub'\)/);
  });
});

describe('the store', () => {
  const store = read('src/store.ts');

  test('sends the portal’s messages; there is no host-only secret any more', () => {
    assert.match(store, /socket\.send\(\{ t: 'activity', activity \}\)/);
    assert.match(store, /socket\.send\(\{ t: 'pose', \.\.\.cmd \} as PoseCommand\)/);
    assert.match(store, /socket\.send\(\{ t: 'trivia', op \}\)/);
    assert.doesNotMatch(store, /secret|emoji/i, 'the old emoji game is gone from the client store');
  });

  test('leaving, being removed or a closed room forget the remembered trivia picks', () => {
    assert.equal((store.match(/me: null, entry: null, myAnswers: \{\}/g) ?? []).length, 3);
  });
});

describe('the look', () => {
  const theme = read('src/ui/theme.css');
  const css = read('src/ui/home.css');

  test('each activity has its own accent (from the design system), and the portal stylesheet is loaded once by the app', () => {
    assert.match(theme, /\.ac-typedrive \{ --ac: var\(--g-typedrive\);/);
    assert.match(theme, /\.ac-pose \{ --ac: var\(--g-pose\);/);
    assert.match(theme, /\.ac-trivia \{ --ac: var\(--g-trivia\);/);
    assert.match(read('src/main.tsx'), /import '\.\/ui\/home\.css';/);
    assert.match(read('src/portal/parts.tsx'), /<div className=\{`lp pt pt-on-\$\{screen\} ac-\$\{screen\}`\}>/, 'the frame carries the screen’s accent');
  });

  test('the light theme: no dark arena, no glows or skewed plates in the portal stylesheet', () => {
    assert.doesNotMatch(css, /\.(pt|ph|er|fp|tt)-[\w-]*[^{}]*\{[^}]*skewX/, 'no skewed plates (the key art keeps its own kerb animation)');
    assert.doesNotMatch(css, /text-shadow/);
    assert.doesNotMatch(read('src/portal/parts.tsx'), /<Arena|arc-spots/);
  });

  test('every screen fits the window on a desktop: a stage and a side rail that fill the frame, long lists scroll inside', () => {
    assert.match(read('src/portal/parts.tsx'), /export function PortalLayout/);
    for (const f of ['src/screens/Hub.tsx', 'src/screens/FunnyPose.tsx', 'src/screens/TechTrivia.tsx']) assert.match(read(f), /<PortalLayout/, f);
    assert.match(css, /@media \(min-width: 1000px\) \{\s*\.pt-layout \{[^}]*flex: 1 1 auto;[^}]*min-height: 0;/s);
    assert.match(css, /\.pt-side > \.pt-side-teams \{[^}]*overflow-y: auto;/s);
  });
});
