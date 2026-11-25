import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ACTIVITIES, type ActivityId } from '../shared/activities';
import { KeyArt } from '../src/components/arcade/KeyArt';
import { PlatformTitle } from '../src/components/arcade/Wordmark';

// The Weekly Fun Activity dashboard as a game launcher: three equal game cards (the first screen and the in-room dashboard use the same
// ones) with the games' own key art, the headline and "How it works" — on the light theme, fitting the window. Source-level guards plus
// static renders; the real page was also driven in a browser at 1920 × 1080, 1440 × 900, 1366 × 768 and 390 × 844.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const css = read('src/ui/home.css');
/** The declaration block of the first rule that starts with `selector {`. */
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `rule ${selector}`);
  return css.slice(at, css.indexOf('}', at));
};

describe('the three game cards are the same size', () => {
  test('the card fills its grid cell: equal heights come from the layout, never from fixed heights', () => {
    assert.match(rule('.ph-games'), /align-items: stretch;/);
    assert.match(rule('.ph-games > .ph-game'), /display: flex;/);
    const inner = rule('.ph-games .ph-game-in');
    for (const decl of ['display: flex;', 'flex: 1;', 'flex-direction: column;', 'width: 100%;']) assert.ok(inner.includes(decl), decl);
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (/\.ph-game(-in)?\s*$|\.ph-games\s*>?\s*\.ph-game(-in)?\s*$/.test(m[1]!.trim())) assert.doesNotMatch(m[2]!, /(^|\s)(max-)?height:/, `${m[1]!.trim()} has no fixed height`);
    }
  });

  test('the body is a column and the button sits at the bottom, so names, text and buttons line up across the row', () => {
    const body = rule('.ph-games .ph-body');
    for (const decl of ['flex: 1;', 'display: flex;', 'flex-direction: column;']) assert.ok(body.includes(decl), decl);
    assert.match(rule('.ph-games .ph-open'), /margin-top: auto;/);
    assert.match(rule('.ph-open-wait'), /margin-top: auto;/);
  });

  test('three equal columns from 820 px that share the window’s height (the picture takes what is left), one column below', () => {
    assert.match(css, /@media \(min-width: 820px\) \{\s*\.ph-games \{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
    const fit = css.slice(css.indexOf('.ph-games-sec > .ph-games {'));
    assert.match(fit, /^\.ph-games-sec > \.ph-games \{[^}]*flex: 1 1 auto;[^}]*min-height: 0;[^}]*grid-template-rows: minmax\(0, 1fr\);/s);
    assert.match(css, /\.ph-games-sec \.ph-art \{[^}]*flex: 1 1 0;[^}]*min-height: 64px;/s);
    for (const f of ['src/screens/Welcome.tsx', 'src/screens/Hub.tsx']) assert.match(read(f), /className="ph-games-sec rise"/, f);
  });

  test('the first screen and the in-room dashboard build their cards from the same parts, and keep every piece of information', () => {
    const welcome = read('src/screens/Welcome.tsx');
    const hub = read('src/screens/Hub.tsx');
    for (const [name, src] of [['Welcome', welcome], ['Hub', hub]] as const) {
      for (const part of ['ph-game-in', 'ph-art', 'ph-art-num', 'ph-body', 'ph-game-name', 'ph-game-tag', 'ph-open', '<KeyArt id={a.id} />', 'ACTIVITIES.map(']) assert.ok(src.includes(part), `${name}: ${part}`);
    }
    assert.match(welcome, /onClick=\{\(\) => setEntry\(a\.id\)\}/);
    assert.match(welcome, /isAdmin \? `Open \$\{a\.name\}` : 'Join a room'/);
    assert.match(welcome, /e\.stopPropagation\(\)/);
    for (const part of ['ph-mini', 'ph-pill', 'openActivity(a.id)', 'STATUS_LABEL[score.status]', 'ph-open-wait']) assert.ok(hub.includes(part), part);
  });
});

describe('the pictures (the games’ own key art, kept as it was)', () => {
  const art = (id: ActivityId) => renderToStaticMarkup(createElement(KeyArt, { id }));

  test('all three are drawn on the same 320 × 200 canvas inside the same wrapper, with unique ids', () => {
    for (const a of ACTIVITIES) {
      const html = art(a.id);
      assert.match(html, new RegExp(`^<div class="ka ka-${a.id}" aria-hidden="true">`), a.id);
      assert.match(html, /<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">/, a.id);
      const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
      assert.equal(new Set(ids).size, ids.length, `${a.id}: gradient / clip ids are unique`);
    }
  });

  test('TypeDrive: the road and the racer, with its light and motion hooks', () => {
    const html = art('typedrive');
    for (const part of ['M150 98 L170 98 L350 200 L-30 200 Z', 'M154 98 V90 H166 V98']) assert.ok(html.includes(part), part);
    for (const cls of ['ka-sun', 'ka-beam', 'ka-streaks', 'ka-trail', 'ka-car', 'ka-tail', 'ka-flame', 'ka-flare', 'ka-dash-still', 'ka-dash-flow']) assert.ok(html.includes(`class="${cls}`), cls);
  });

  test('Funny Pose Challenge has its stage, spotlights, audience and performer; Tech Trivia its screen, answers, clock and standings', () => {
    const pose = art('pose');
    for (const cls of ['ka-bulb', 'ka-spark', 'ka-beam', 'ka-crowd', 'ka-figure']) assert.ok(pose.includes(cls), cls);
    const trivia = art('trivia');
    assert.equal((trivia.match(/<text[^>]*>[ABCD]<\/text>/g) ?? []).length, 4, 'four answers');
    for (const cls of ['ka-q', 'ka-glint', 'ka-timer', 'ka-hot', 'ka-bar', 'ka-beam']) assert.ok(trivia.includes(cls), cls);
    assert.equal((trivia.match(/class="ka-bar"/g) ?? []).length, 3, 'one standings bar per team');
  });

  test('every picture animation is off under reduced motion, and the road falls back to still dashes', () => {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    for (const cls of ['.ka-sun', '.ka-beam', '.ka-dash', '.ka-streaks path', '.ka-car', '.ka-tail', '.ka-trail', '.ka-flare', '.ka-flame', '.ka-bulb', '.ka-spark', '.ka-figure', '.ka-q', '.ka-glint', '.ka-timer', '.ka-hot', '.ka-bar']) {
      assert.ok(block.includes(cls), cls);
    }
    assert.match(block, /animation: none !important;/);
    assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.ka-dash-still \{\s*display: none;\s*\}\s*\.ka-dash-flow \{\s*display: inline;/);
  });
});

describe('the dashboard around the cards', () => {
  test('all three cards are equally important: no per-game glow or filter, the same hover lift, the next activity outlined in its colour', () => {
    assert.doesNotMatch(css, /\.ph-game\.ac-(typedrive|pose|trivia)[^{]*\{[^}]*filter:/);
    assert.match(css, /\.ph-game:hover \.ph-game-in \{[^}]*transform: translateY\(-2px\);/s);
    assert.match(css, /\.ph-game\.next \.ph-game-in \{[^}]*border-color: var\(--ac\);/s);
  });

  test('the headline is a plain level-one heading in sentence case — no chrome lettering, no speed lines', () => {
    const html = renderToStaticMarkup(createElement(PlatformTitle));
    assert.equal(html, '<h1 class="ph-h1">Weekly Fun Activity</h1>');
    for (const f of ['src/screens/Welcome.tsx', 'src/screens/Hub.tsx']) assert.match(read(f), /<PlatformTitle \/>/, f);
    assert.doesNotMatch(css, /\.ph-h1[^{]*\{[^}]*(text-transform: uppercase|font-style: italic|text-shadow|background-clip)/);
  });

  test('HOW IT WORKS keeps all four steps, each with its own icon', () => {
    const welcome = read('src/screens/Welcome.tsx');
    assert.match(welcome, /<ol className="ph-how">/);
    for (const step of ['Open a game below.', '4-letter code', 'Everyone waits in the lobby until you start the game.', 'Team points from all three games add up on one overall leaderboard.']) {
      assert.ok(welcome.includes(step), step);
    }
    for (const icon of ['<StepGame />', '<StepKey />', '<StepLobby />', '<StepTrophy />']) assert.ok(welcome.includes(icon), icon);
  });

  test('the shared header carries the GANTEC lockup, and the first screen keeps the 40-player demo', () => {
    assert.match(read('src/components/SiteHeader.tsx'), /<PlatformLogo size=\{logoSize\} \/>/);
    assert.match(read('src/screens/Welcome.tsx'), /onClick=\{openDemo\}/);
  });

  test('the look changes no behaviour (no scripts, no network, no hidden content), and the stylesheet is loaded by the app', () => {
    assert.match(read('src/main.tsx'), /import '\.\/ui\/home\.css';/);
    assert.doesNotMatch(css, /@import|url\(['"]?https?:|display: none;[^}]*\.ph-(mini|pill|game-tag)/);
    for (const f of ['src/components/arcade/KeyArt.tsx', 'src/components/arcade/Wordmark.tsx']) assert.doesNotMatch(read(f), /useGame|send\(|WebSocket/, f);
  });
});
