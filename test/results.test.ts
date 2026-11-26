import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ResultRow, TeamStanding } from '../shared/protocol';
import { teamPointsFor, TEAMS, type TeamId } from '../shared/teams';
import { awardSlots, AwardsPodium, WinnerBanner, type AwardEntry } from '../src/components/results/Awards';
import { teamRaceSummary } from '../src/components/results/summary';
import { TeamResults } from '../src/components/results/TeamResults';
import { metalFor } from '../src/components/results/Trophy';

// The race results as an awards ceremony: the team summary is checked as a pure function against the server's own numbers, the podium /
// winner / team cards are rendered for real from fixtures, and source guards pin that nothing is scored or ranked again on the client.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const row = (id: string, name: string, rank: number, team: TeamId | null, extra: Partial<ResultRow> = {}): ResultRow => {
  const finished = extra.finished ?? true;
  return { id, name, rank, finished, progress: finished ? 1 : 0.4, wpm: 80 - rank, accuracy: 97, timeMs: finished ? 50000 + rank * 1000 : null, score: 100, trophies: 0, team, teamPoints: team ? teamPointsFor(rank, finished) : 0, ...extra } as ResultRow;
};
const standings = (pts: [number, number, number]): TeamStanding[] => TEAMS.map((t, i) => ({ id: t.id, name: t.name, points: pts[i]!, rank: [...pts].sort((a, b) => b - a).indexOf(pts[i]!) + 1, tied: pts.filter((p) => p === pts[i]).length > 1 }));

// a race of six: ctrl wins and is third, titans second and fifth, vibe fourth and DNF
const rows = [
  row('a', 'Chitra', 1, 'ctrl'),
  row('b', 'Dev', 2, 'titans'),
  row('c', 'Farhan', 3, 'ctrl'),
  row('d', 'Esha', 4, 'vibe'),
  row('e', 'Asha', 5, 'titans'),
  row('f', 'Hari', 6, 'vibe', { finished: false }),
];

describe('the team summary is built only from the server’s numbers', () => {
  test('each team’s total is the sum of its drivers’ points, which is exactly what the server sends as `gained`', () => {
    const sums = Object.fromEntries(TEAMS.map((t) => [t.id, rows.filter((r) => r.team === t.id).reduce((s, r) => s + r.teamPoints, 0)])) as Record<TeamId, number>;
    const fromRows = teamRaceSummary(rows, standings([50, 20, 100]), undefined);
    const fromServer = teamRaceSummary(rows, standings([50, 20, 100]), sums);
    for (const t of TEAMS) {
      assert.equal(fromRows.find((l) => l.id === t.id)!.gained, sums[t.id], `${t.id}: summed from the rows`);
      assert.equal(fromServer.find((l) => l.id === t.id)!.gained, sums[t.id], `${t.id}: the server's figure`);
      const line = fromServer.find((l) => l.id === t.id)!;
      assert.equal(line.drivers.reduce((s, d) => s + d.points, 0), line.gained, `${t.id}: contributions add up to the team's total`);
    }
    // 1st = 10, 2nd = 8, 3rd = 6, 4th = 4, 5th = 2, a DNF = 0 (the server's table, not recomputed here)
    assert.deepEqual(Object.fromEntries(fromRows.map((l) => [l.id, l.gained])), { ctrl: 16, titans: 10, vibe: 4 });
  });

  test('the server’s figure wins when it differs: the client never "corrects" it', () => {
    const lines = teamRaceSummary(rows, standings([0, 0, 0]), { titans: 1, vibe: 2, ctrl: 3 });
    assert.deepEqual(Object.fromEntries(lines.map((l) => [l.id, l.gained])), { titans: 1, vibe: 2, ctrl: 3 });
  });

  test('teams are listed by what they earned in this race; the match total and rank come from the standings; drivers best first', () => {
    const lines = teamRaceSummary(rows, standings([50, 20, 100]), undefined);
    assert.deepEqual(lines.map((l) => l.id), ['ctrl', 'titans', 'vibe']);
    assert.deepEqual(lines.map((l) => l.raceRank), [1, 2, 3]);
    const ctrl = lines[0]!;
    assert.equal(ctrl.total, 100);
    assert.equal(ctrl.rank, 1);
    assert.deepEqual(ctrl.drivers.map((d) => d.name), ['Chitra', 'Farhan']);
    const vibe = lines[2]!;
    assert.deepEqual(vibe.drivers.map((d) => [d.name, d.finished, d.points]), [['Esha', true, 4], ['Hari', false, 0]], 'a DNF is listed with 0');
  });

  test('the race winner flag: one team, or every team on equal top points (a tie is never broken at random), or nobody when nobody scored', () => {
    assert.deepEqual(teamRaceSummary(rows, standings([0, 0, 0]), undefined).map((l) => l.best), [true, false, false]);
    const tied = teamRaceSummary(rows, standings([0, 0, 0]), { titans: 100, vibe: 100, ctrl: 40 });
    assert.deepEqual(tied.filter((l) => l.best).map((l) => l.id).sort(), ['titans', 'vibe']);
    assert.ok(tied.filter((l) => l.best).every((l) => l.raceRank === 1 && l.raceTied));
    const none = teamRaceSummary([row('x', 'Solo', 1, null)], standings([0, 0, 0]), undefined);
    assert.ok(none.every((l) => !l.best && l.gained === 0 && l.drivers.length === 0), 'no team scored: nobody is lit');
  });
});

describe('the podium and the winner announcement', () => {
  const entry = (rank: number, name: string, team: TeamId | null, me = false): AwardEntry => ({ key: name, rank, name, team, wpm: 90 - rank, accuracy: 98, timeMs: 47200 + rank * 900, teamPoints: team ? teamPointsFor(rank, true) : null, me });
  const three = [entry(1, 'Chitra', 'ctrl'), entry(2, 'Dev', 'titans', true), entry(3, 'Farhan', 'ctrl')];

  test('2nd stands on the left, 1st in the middle, 3rd on the right, in silver, gold and bronze, each with a trophy', () => {
    assert.deepEqual(awardSlots(three).map((e) => e?.name), ['Dev', 'Chitra', 'Farhan']);
    assert.deepEqual(awardSlots(three.slice(0, 1)).map((e) => e?.name ?? null), [null, 'Chitra', null]);
    assert.deepEqual([1, 2, 3, 4].map(metalFor), ['gold', 'silver', 'bronze', 'bronze']);
    const html = renderToStaticMarkup(createElement(AwardsPodium, { entries: three }));
    assert.match(html, /class="rc-step second silver me tm-titans"/);
    assert.match(html, /class="rc-step first gold tm-ctrl"/);
    assert.match(html, /class="rc-step third bronze tm-ctrl"/);
    assert.equal((html.match(/class="rc-trophy rc-pod-trophy"/g) ?? []).length, 3);
    assert.match(html, /Dev<em> · you<\/em>/, 'your own place is marked');
    assert.match(html, /\+10 team pts/);
    assert.match(html, /The Titans/);
  });

  test('the winner is named with team, speed, accuracy, time and the points they earned; a shared first place names everyone', () => {
    const html = renderToStaticMarkup(createElement(WinnerBanner, { winners: [three[0]!] }));
    assert.match(html, /Race winner/);
    assert.match(html, /<span class="rc-wface">Chitra<\/span>/);
    assert.match(html, /data-text="Chitra"/);
    assert.match(html, /<b>89<\/b> WPM/);
    assert.match(html, /<b>98%<\/b> accuracy/);
    assert.match(html, /<b>48\.1s<\/b> time/);
    assert.match(html, /<b>\+10<\/b> team pts/);
    assert.match(html, /Ctrl \+ Alt \+ Defeat/);
    const shared = renderToStaticMarkup(createElement(WinnerBanner, { winners: [entry(1, 'Ana', 'vibe'), entry(1, 'Raj', 'titans')] }));
    assert.match(shared, /Joint race winners/);
    assert.match(shared, /Ana &amp; Raj/);
    assert.match(renderToStaticMarkup(createElement(WinnerBanner, { winners: [entry(1, 'Me', 'vibe', true)] })), /You are the winner/);
    assert.equal(renderToStaticMarkup(createElement(WinnerBanner, { winners: [] })), '', 'no finisher, no announcement');
  });

  test('the team cards light the winning team and list what each driver earned', () => {
    const lines = teamRaceSummary(rows, standings([50, 20, 100]), undefined);
    const html = renderToStaticMarkup(createElement(TeamResults, { lines, myTeam: 'titans' }));
    assert.equal((html.match(/class="rt tm-/g) ?? []).length, 3);
    assert.equal((html.match(/rt tm-\w+ best/g) ?? []).length, 1);
    assert.match(html, /Race winners/);
    assert.match(html, /\+16 this race/);
    assert.match(html, /\+10 this race/);
    assert.match(html, /\+4 this race/);
    assert.match(html, /rt tm-titans mine/, 'your own team is marked');
    assert.match(html, /<span class="rt-dwpm">DNF<\/span><b class="rt-dpts">\+0<\/b>/);
    assert.match(html, /2nd in this race/);
  });
});

describe('the results screen: look changed, results not', () => {
  const screen = read('src/screens/Results.tsx');
  const css = read('src/ui/results.css');

  test('every figure is the server’s: nothing is scored, ranked or randomised on the client', () => {
    assert.doesNotMatch(screen, /Math\.random|teamPointsFor|rankTeams|winningTeams|\.sort\(\(a, b\) => b\.wpm/);
    assert.match(screen, /const gained = room\.match\.last\?\.gained;/);
    assert.match(screen, /teamRaceSummary\(final, room\.teams, gained\)/);
    // the podium is the first three finishers of the server's final rows, in the server's order
    assert.match(screen, /\.filter\(\(l\) => l\.finished && l\.rank <= 3\)\s*\.sort\(\(a, b\) => a\.rank - b\.rank\)/);
    for (const src of ['src/components/results/summary.ts', 'src/components/results/Awards.tsx', 'src/components/results/TeamResults.tsx']) {
      assert.doesNotMatch(read(src), /Math\.random|teamPointsFor|rankTeams/, src);
    }
  });

  test('host spectator mode and the host’s controls are unchanged', () => {
    assert.match(screen, /const celebrate = ceremony && \(podium\.some\(\(p\) => p\.me\) \|\| isHost\);/);
    assert.match(screen, /Race complete/);
    assert.match(screen, /disabled=\{driversOnline === 0\}/);
    assert.match(screen, /End match · declare the winning team/);
    assert.match(screen, /aria-label="Confirm end match"/);
  });

  test('the live results (race still running for others) keep their rows and have no ceremony', () => {
    assert.match(screen, /const ceremony = podium\.length > 0;/);
    assert.match(screen, /const podium: AwardEntry\[\] = final\s*\?/);
    assert.match(screen, /Racing… \{Math\.round\(l\.progress \* 100\)\}%/);
    assert.match(screen, /\{ceremony && \(\s*<section className="rc-stage"/);
  });

  test('the reveal runs podium first, then the ranking, then the side panels; reduced motion shows the finished picture', () => {
    assert.match(css, /\.res-final \.rk-row \{\s*animation-delay: calc\(2\.3s \+ var\(--n, 0\) \* 55ms\);/);
    assert.match(css, /\.res-final \.res-side > \* \{\s*animation: rc-side-in 0\.6s var\(--ease\) 2\.6s backwards;/);
    assert.match(css, /\.rc-step\.third \{\s*--r: 0\.25s;/);
    assert.match(css, /\.rc-step\.second \{\s*--r: 0\.7s;/);
    assert.match(css, /\.rc-step\.first \{\s*--r: 1\.15s;/);
    assert.match(screen, /<div className="rc-lights" aria-hidden>/, 'the stadium: spotlights, camera flashes and the crowd');
    assert.match(screen, /<Confetti durationMs=\{5200\} \/>/);
    const block = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    for (const sel of ['.rc-lights > i', '.rc-hero-trophy', '.rc-wname', '.rc-pod-trophy', '.rc-pedestal', '.rk-row', '.rt', '.rc-shine', '.rc-sparks i', '.arc-pod-who', '.arc-pod-base', '.arc-burst-rays', '.dd-tab.hot']) assert.ok(block.includes(sel), sel);
    assert.match(block, /animation: none !important;/);
    assert.match(read('src/main.tsx'), /import '\.\/ui\/results\.css';/);
  });

  test('the stage keeps its own art inside a card; everything around it is the light theme', () => {
    // the dark stadium is drawn inside .rc-stage only; tables, team cards, the match screen and the bar use the light tokens
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }));
    for (const r of rules.filter((r) => /^(\.rk|\.rt|\.res-|\.mr-|\.ts-total|\.ts-gain)/.test(r.sel))) {
      assert.doesNotMatch(r.body, /italic|text-shadow|skew|#0[0-9a-f]{5}\b|rgba\(\s*[0-9]\s*,\s*[0-9]\s*,\s*[0-9]{1,2}\s*,/, `${r.sel} stays light and plain`);
    }
    assert.match(screen, /className=\{`lp res\$\{ceremony \? ' res-final' : ''\}`\}/, 'the light page shell, not the old dark one');
    assert.doesNotMatch(screen, /site-bg/);
    assert.match(css, /\.rk-row\.me \{\s*background: var\(--brand-50\);/, 'your own row is highlighted');
    for (const m of ['m1', 'm2', 'm3']) assert.ok(css.includes(`.rk-badge.${m}`), m);
  });

  test('the screen fits the window: a full-height grid, and long lists scroll inside their panel without a bar', () => {
    assert.match(css, /\.res-main \{\s*display: grid;\s*grid-template-rows: auto minmax\(0, 1fr\) auto;/);
    assert.match(css, /\.rk-scroll \{[^}]*min-height: 0;\s*overflow-y: auto;\s*scrollbar-width: none;/);
    assert.match(css, /\.rk-scroll::-webkit-scrollbar \{\s*display: none;/);
    assert.match(css, /\.res-side \{[^}]*overflow-y: auto;\s*scrollbar-width: none;/);
    assert.match(css, /\.mr-teams \{[^}]*overflow-y: auto;\s*scrollbar-width: none;/);
    assert.match(css, /html\[data-demo\] \.lp,\s*html\[data-demo\] \.lp-body \{\s*height: calc\(100dvh - var\(--demo-h\)\);/, 'the demo bar does not push the page past the window');
  });

  test('the ranking keeps every column: speed, accuracy, time and the points earned for the team, and a reason for every DNF', () => {
    for (const label of ['Speed', 'Accuracy', 'Time', 'Team']) assert.ok(screen.includes(`<small>${label}</small>`), label);
    assert.match(screen, /\+\{l\.teamPoints\}\s*<span className="rk-u"> team pts<\/span>/);
    assert.match(screen, /\+0<span className="rk-u"> team pts<\/span>/);
    assert.match(screen, /REASON_SHORT\[l\.dnfReason\]/);
    assert.match(css, /@container \(max-width: 380px\) \{\s*\.rk-headrow \{\s*display: none;\s*\}\s*\.rk-row \{\s*grid-template-columns: var\(--b\) minmax\(0, 1fr\);/, 'in a narrow panel each driver is two lines');
    for (const label of ['Speed', 'Accuracy', 'Time', 'Team pts']) assert.ok(screen.includes(`>${label}</span>`), `column header ${label}`);
  });
});
