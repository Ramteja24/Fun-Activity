import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ACTIVITIES } from '../shared/activities';
import { GAME_KICKER } from '../src/brand';
import { KeyArt } from '../src/components/arcade/KeyArt';
import { StepGame, StepKey, StepLobby, StepTrophy } from '../src/components/arcade/StepIcons';
import { GANTEC_LOGO, PlatformLogo } from '../src/components/PlatformLogo';
import { decodePng, findInks, LETTER_COLOUR, makeWebLogo, MARGIN, SCALE, separateInks } from '../scripts/make-gantec-logo';

// The dashboard on the light theme: the official GANTEC lockup, the hero and HOW IT WORKS, the three game cards and their key art. All of
// it is presentation — the room, the codes, the handlers and the three-game order are pinned by dashboard.test.ts / entry-flow.test.ts.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const css = read('src/ui/home.css');
const theme = read('src/ui/theme.css');
const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
/** The company's own logo file, as attached: if this hash changes, someone has redrawn, recoloured or replaced the official logo. */
const OFFICIAL_LOGO_SHA256 = '93a23e1f3241a35c7fe59e3137211a07dd30702859fb8aee1411bc945d4364d1';
const keyframes = (name: string) => {
  const at = css.indexOf(`@keyframes ${name} {`);
  assert.ok(at >= 0, `@keyframes ${name}`);
  let depth = 0;
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(at, i + 1);
  }
  throw new Error(`unterminated @keyframes ${name}`);
};

describe('the GANTEC logo: the official one, on the light theme', () => {
  const html = renderToStaticMarkup(createElement(PlatformLogo, { size: 'clamp(30px, 3.5vw, 50px)' }));
  const logoCss = theme.slice(theme.indexOf('.plogo {'), theme.indexOf("/* TypeDrive's own logo"));
  const original = readFileSync(join(root, 'assets/gantec-logo-original.png'));
  const made = readFileSync(join(root, 'public/gantec-logo.png'));

  test('the company\'s own file is kept untouched: the 248 × 70 PNG that was attached, byte for byte', () => {
    assert.equal(createHash('sha256').update(original).digest('hex'), OFFICIAL_LOGO_SHA256);
    const src = decodePng(original);
    assert.deepEqual([src.width, src.height], [248, 70]);
    assert.deepEqual(findInks(src), { orange: [246, 124, 1], grey: [66, 66, 66] });
  });

  test('the dashboard\'s copy is made from it by one deterministic script (npm run logo) and nothing else — so it is the official logo, not a redrawing', () => {
    assert.ok(made.equals(makeWebLogo(original)), 'public/gantec-logo.png is exactly what scripts/make-gantec-logo.ts makes from the original');
    assert.match(read('package.json'), /"logo": "tsx scripts\/make-gantec-logo\.ts"/);
  });

  test('the background is transparent: no white anywhere, the four corners and the margins clear, and only the logo\'s two inks are left — the original orange and the original grey of "ANTEC"', () => {
    const img = decodePng(made);
    assert.deepEqual([img.width, img.height], [GANTEC_LOGO.width, GANTEC_LOGO.height]);
    for (const [x, y] of [[0, 0], [img.width - 1, 0], [0, img.height - 1], [img.width - 1, img.height - 1]] as const) assert.equal(img.data[(y * img.width + x) * 4 + 3], 0, 'corner ' + x + ',' + y);
    const colours = new Set<string>();
    let opaque = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] === 0) continue;
      colours.add(img.data[i] + ',' + img.data[i + 1] + ',' + img.data[i + 2]);
      if (img.data[i + 3] === 255) opaque++;
    }
    assert.deepEqual([...colours].sort(), ['246,124,1', '66,66,66'], 'the orange of the icon and the G and the grey of the letters, both untouched');
    assert.ok(opaque > 8000, 'the shapes are solid');
    assert.deepEqual([...LETTER_COLOUR], [66, 66, 66]);
  });

  test('the shapes are the original\'s: the same amount of orange and of lettering, at 3×, and the same proportions (nothing stretched)', () => {
    const src = decodePng(original);
    const { orange, grey } = separateInks(src, findInks(src));
    const sum = (m: Float32Array) => m.reduce((t, v) => t + v, 0);
    const img = decodePng(made);
    let nOrange = 0;
    let nLetters = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      const alpha = img.data[i + 3]! / 255;
      if (img.data[i] === 246) nOrange += alpha;
      else nLetters += alpha;
    }
    assert.ok(Math.abs(nOrange / (SCALE * SCALE) / sum(orange) - 1) < 0.04, 'orange area ' + nOrange / 9 + ' vs ' + sum(orange));
    assert.ok(Math.abs(nLetters / (SCALE * SCALE) / sum(grey) - 1) < 0.04, 'lettering area ' + nLetters / 9 + ' vs ' + sum(grey));
    assert.equal(img.width % SCALE, 0);
    assert.equal(img.height % SCALE, 0);
    // the original's content is 184 × 31; the copy is that plus the margin, enlarged evenly
    assert.deepEqual([img.width / SCALE, img.height / SCALE], [184 + 2 * MARGIN + 1, 31 + 2 * MARGIN]);
  });

  test('it is used as an image — never a drawing or a text copy: one <img>, no card behind it, GANTEC is not typeset anywhere in the lockup', () => {
    assert.match(html, /<img class="plogo-img" src="\/gantec-logo\.png" width="573" height="111"/);
    assert.equal((html.match(/<img /g) ?? []).length, 1);
    assert.doesNotMatch(html, /<svg|<path|<text|<b>|plogo-mark|plogo-text|plogo-plate/, 'nothing is drawn, and there is no plate');
    assert.doesNotMatch(html, />\s*GANTEC\s*</, 'the name GANTEC is not typed out — only the picture says it');
    assert.match(html, /aria-label="GANTEC WEEKLY CONNECT"/, 'a screen reader still hears the name');
    assert.doesNotMatch(read('src/components/PlatformLogo.tsx'), /<svg|<path|linearGradient|useId/);
    const img = logoCss.slice(logoCss.indexOf('.plogo-img {'), logoCss.indexOf('}', logoCss.indexOf('.plogo-img {')));
    assert.match(img, /height: 1em;/);
    assert.match(img, /width: auto;/);
    assert.doesNotMatch(img, /background|filter|object-fit|clip|mask|invert|hue-rotate|grayscale|brightness|contrast|saturate|mix-blend|transform/, 'shown exactly as the file is');
  });

  test('WEEKLY CONNECT is a separate subtitle beside the logo', () => {
    assert.match(html, /<\/span><span class="plogo-sub" aria-hidden="true">WEEKLY CONNECT<\/span>/);
    assert.ok(html.indexOf('plogo-logo') < html.indexOf('plogo-sub'), 'the logo first, then the subtitle');
    assert.match(logoCss, /\.plogo-sub \{[^}]*text-transform: uppercase;/s);
  });

  test('the dashboard (first screen and in-room) shows it a little larger; the games’ own screens use the same file at the default size', () => {
    assert.match(html, /style="font-size:clamp\(30px, 3\.5vw, 50px\)"/);
    assert.match(read('src/screens/Welcome.tsx'), /logoSize=\{DASHBOARD_LOGO_SIZE\}/);
    assert.match(read('src/portal/parts.tsx'), /logoSize=\{screen === 'hub' \? DASHBOARD_LOGO_SIZE : undefined\}/);
    for (const f of ['src/screens/Landing.tsx', 'src/screens/FunnyPose.tsx', 'src/screens/TechTrivia.tsx']) assert.doesNotMatch(read(f), /logoSize/, f);
  });
});

describe('no dark arena behind the dashboard', () => {
  test('the arena (truss, searchlights, floor grid, sparks) is gone; the dashboard sits on the plain light page', () => {
    assert.ok(!existsSync(join(root, 'src/components/arcade/Arena.tsx')));
    const users = readdirSync(join(root, 'src'), { recursive: true, withFileTypes: true }).filter((d) => d.isFile() && /\.tsx$/.test(d.name) && readFileSync(join(d.parentPath, d.name), 'utf8').includes('<Arena'));
    assert.deepEqual(users, []);
    assert.doesNotMatch(css, /\.arena\b|\.ar-(rig|lamp|beam|spark)/);
  });
});

describe('the hero and HOW IT WORKS', () => {
  const welcome = read('src/screens/Welcome.tsx');

  test('the first screen reads top to bottom: branding, a centred headline, the steps, then the four cards — every word still there', () => {
    for (const text of ['Three live team games', 'Three games, one leaderboard. Pick a game to host a room — you run each game and everyone’s screen follows.']) assert.ok(welcome.includes(text), text);
    const order = ['<SiteHeader', 'className="ph-hero ph-hero-c', 'ph-how-card', '<ol className="ph-games">'].map((part) => welcome.indexOf(part));
    assert.ok(order.every((at) => at > 0) && order.every((at, i) => i === 0 || at > order[i - 1]!), `order: ${order}`);
    assert.match(css, /\.ph-hero-c \{[^}]*text-align: center;/s);
  });

  test('HOW IT WORKS: four numbered steps, each with its own line icon; four across on a wide screen, two on a tablet, one on a phone', () => {
    for (const icon of ['<StepGame />', '<StepKey />', '<StepLobby />', '<StepTrophy />']) assert.ok(welcome.includes(icon), icon);
    assert.match(welcome, /<i className="ph-how-ico" aria-hidden>/);
    for (const Icon of [StepGame, StepKey, StepLobby, StepTrophy]) {
      const svg = renderToStaticMarkup(createElement(Icon));
      assert.match(svg, /^<svg viewBox="0 0 24 24"[^>]*aria-hidden="true"/);
      assert.doesNotMatch(svg, /<text|<title/, 'drawn lines only');
    }
    assert.match(css, /@media \(min-width: 600px\) \{\s*\.ph-how \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    assert.match(css, /@media \(min-width: 1000px\) \{\s*\.ph-how \{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  });
});

describe('the game cards', () => {
  test('each says what kind of game it is above its name — on the first screen and on the in-room dashboard', () => {
    assert.deepEqual({ ...GAME_KICKER }, { typedrive: 'Live multiplayer typing race', pose: 'Team entertainment challenge', cards: 'Visual memory challenge', trivia: 'Technical quiz challenge' });
    for (const f of ['src/screens/Welcome.tsx', 'src/screens/Hub.tsx']) {
      const src = read(f);
      const kick = src.indexOf('<p className="ph-kick">{GAME_KICKER[a.id]}</p>');
      assert.ok(kick > 0, f);
      assert.ok(kick < src.indexOf('<h3 className="ph-game-name">'), `${f}: above the name`);
    }
    assert.deepEqual(ACTIVITIES.map((a) => a.id), ['typedrive', 'cards', 'trivia'], 'the play order (Funny Pose is hidden)');
  });

  test('a flat light card: white surface, a hairline border, a soft shadow; the launch button is a solid button in the game’s colour', () => {
    assert.match(css, /\.ph-games \.ph-game-in \{[^}]*background: var\(--surface\);[^}]*box-shadow: var\(--sh-1\);/s);
    assert.match(read('src/screens/Welcome.tsx'), /className="btn btn-accent btn-block ph-open"/);
    assert.match(theme, /\.btn-accent \{[^}]*background: var\(--ac, var\(--brand\)\);/s);
    assert.doesNotMatch(css, /\.ph-open[^{]*\{[^}]*skewX/);
  });
});

describe('the key art: every piece, with its motion, still off under reduced motion', () => {
  const art = (id: 'typedrive' | 'pose' | 'trivia') => renderToStaticMarkup(createElement(KeyArt, { id }));
  const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

  test('TypeDrive keeps its car and road, kerbs, LED boards, wind and gantry lights', () => {
    const html = art('typedrive');
    assert.equal(count(html, /class="ka-kerb ka-kerb-l"/g), 8);
    assert.equal(count(html, /class="ka-kerb ka-kerb-r"/g), 8);
    for (const part of ['class="ka-led"', 'ka-wind ka-wind-l', 'ka-wind ka-wind-r']) assert.ok(html.includes(part), part);
    assert.match(css, /@keyframes ka-kerb-l \{[^@]*skewX\(-60\.4deg\)/);
    assert.match(css, /@keyframes ka-kerb-r \{[^@]*skewX\(60\.4deg\)/);
  });

  test('Funny Pose Challenge: the stage with its LED wall, equaliser, confetti, performer and crowd', () => {
    const html = art('pose');
    assert.equal(count(html, /class="ka-eq"/g), 10);
    assert.equal(count(html, /class="ka-confetti"/g), 9);
    for (const part of ['class="ka-ring"', 'ka-figure', 'ka-crowd', 'ka-bulb']) assert.ok(html.includes(part), part);
  });

  test('Tech Trivia: the hologram question mark, technical symbols, circuit traces, four answers, the clock and the standings', () => {
    const html = art('trivia');
    assert.equal(count(html, /class="ka-trace"/g), 4);
    assert.equal(count(html, /class="ka-glyph/g), 4);
    for (const part of ['&lt;/&gt;', '{ }', '>01<', '>AI<', 'class="ka-ring"']) assert.ok(html.includes(part), part);
    assert.equal(count(html, /<text[^>]*>[ABCD]<\/text>/g), 4);
    assert.equal(count(html, /class="ka-bar"/g), 3);
  });

  test('every motion has a reduced-motion rule', () => {
    for (const cls of ['.ka-kerb', '.ka-led', '.ka-wind', '.ka-ring', '.ka-eq', '.ka-confetti', '.ka-glyph', '.ka-trace']) assert.ok(reduced.includes(cls), cls);
    for (const name of ['ka-kerb-l', 'ka-kerb-r', 'ka-fall', 'ka-eq', 'ka-spin', 'ka-trace', 'ka-glow', 'ka-wind', 'ka-led']) keyframes(name);
  });
});
