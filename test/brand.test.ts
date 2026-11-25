import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlatformTitle, RacingWordmark, WordmarkStreaks } from '../src/components/arcade/Wordmark';
import { PlatformLogo } from '../src/components/PlatformLogo';
import { Vehicle } from '../src/components/Vehicle';
import { VEHICLE_TYPES } from '../shared/protocol';
import { BRAND, PLATFORM } from '../src/brand';

// Branding (the platform vs. TypeDrive), the racing wordmark, the race's arcade look and the move between games. Like the other UI
// tests these are source-level guards plus a few static renders — there is no DOM here; the screens were also driven in the browser.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const files = (dir: string, ext: RegExp) =>
  readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && ext.test(d.name))
    .map((d) => join(d.parentPath, d.name));

/** Every stylesheet of the app (the design system and the area stylesheets in src/ui). */
const uiCss = () =>
  readdirSync(join(root, 'src/ui'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => read(`src/ui/${f}`))
    .join('\n');

describe('branding: the platform on shared screens, TypeDrive only inside TypeDrive', () => {
  test('the platform has its own name and lockup, separate from TypeDrive’s', () => {
    assert.equal(PLATFORM.name, 'GANTEC');
    assert.equal(PLATFORM.sub, 'WEEKLY CONNECT');
    assert.equal(PLATFORM.full, 'Gantec Weekly Connect');
    assert.notEqual(PLATFORM.name, BRAND.first);
    const html = renderToStaticMarkup(createElement(PlatformLogo, { size: 26 }));
    assert.match(html, /GANTEC/);
    assert.match(html, /WEEKLY CONNECT/);
    assert.doesNotMatch(html, /TYPEDRIVE|GAME/i, 'no TypeDrive wording in the platform logo');
    assert.match(html, /aria-label="GANTEC WEEKLY CONNECT"/);
  });

  test('the dashboard and every screen the three games share wear the platform logo', () => {
    assert.match(read('src/screens/Welcome.tsx'), /<SiteHeader\s+(wide\s+)?brand="platform"/);
    const parts = read('src/portal/parts.tsx');
    assert.match(parts, /<SiteHeader\s+(wide\s+)?brand="platform"/, 'PortalFrame: the in-room dashboard, the Funny Pose Challenge and Tech Trivia');
    // …and so does the name/host/join page when it was opened for one of the other two games
    assert.match(read('src/screens/Landing.tsx'), /brand=\{game \? 'platform' : 'typedrive'\}/);
  });

  test('TypeDrive’s own screens keep TypeDrive’s logo: it is the header’s default', () => {
    const header = read('src/components/SiteHeader.tsx');
    assert.match(header, /brand = 'typedrive'/);
    assert.match(header, /brand === 'platform' \? \(\s*<PlatformLogo size=\{logoSize\} \/>\s*\) : \(\s*<>\s*<Logo size=\{20\} \/>/);
    assert.match(header, /logoSize = 24,/, 'the small lockup is the default; only the dashboard asks for the bigger one');
    for (const f of ['src/screens/Lobby.tsx', 'src/screens/Results.tsx', 'src/screens/MatchResults.tsx', 'src/screens/Spectator.tsx', 'src/components/race/Hud.tsx']) {
      assert.doesNotMatch(read(f), /brand="platform"/, `${f} is TypeDrive's`);
    }
  });

  test('no screen that belongs to the whole platform uses or mentions the TypeDrive logo or its name as a brand', () => {
    for (const f of ['src/screens/Welcome.tsx', 'src/screens/Hub.tsx', 'src/screens/FunnyPose.tsx', 'src/screens/TechTrivia.tsx', 'src/portal/parts.tsx']) {
      const src = read(f);
      assert.doesNotMatch(src, /<Logo\b|BRAND\.first|TYPEDRIVE/, f);
      assert.doesNotMatch(src, /import \{[^}]*\bLogo\b[^}]*\} from/, f);
    }
  });

  test('the browser tab and icon are the platform’s, and follow the game being played', () => {
    const html = read('index.html');
    assert.match(html, /<title>Weekly Fun Activity · Gantec Weekly Connect<\/title>/);
    assert.doesNotMatch(html.match(/<title>[^<]*<\/title>/)![0], /TYPEDRIVE/i, 'the tab is not named after one of the three games');
    const icon = read('public/favicon.svg');
    assert.doesNotMatch(icon, /<circle/, 'the platform icon is not the TypeDrive car with its wheels');
    const app = read('src/App.tsx');
    assert.match(app, /document\.title = `\$\{game \? game\.name : PLATFORM\.title\} · \$\{PLATFORM\.full\}`/);
    assert.match(app, /const gameId = room && me \? room\.activity : entry;/);
  });
});

describe('the racing wordmark', () => {
  const css = uiCss();
  const landing = read('src/screens/Landing.tsx');
  const wordmarkSrc = read('src/components/landing/RacingWordmark.tsx');

  test('only TypeDrive’s own headline renders the custom car-inspired wordmark; Funny Pose and Tech Trivia keep their plain headline', () => {
    assert.match(landing, /<h1 className="lp-h1 lp-car-wm" aria-label="Type fast\. Drive faster\.">/);
    assert.match(landing, /<span className="lp-sr-only">Type fast\. Drive faster\.<\/span>/);
    assert.match(landing, /<RacingWordmark \/>/);
    assert.match(landing, /\{game \? \(\s*<h1 className="en-h1">\{game\.name\}<\/h1>/, 'the other two games have a plain, sentence-case headline');
  });

  test('forms a custom vector car silhouette with 21 bespoke letter glyphs, alloy wheel arches, metallic finishes and two rear boosters, without the old title flames', () => {
    const html = renderToStaticMarkup(createElement(RacingWordmark));
    assert.match(html, /class="rwm" aria-hidden="true"/);
    // 9 custom glyphs for "TYPE FAST." + 12 custom glyphs for "DRIVE FASTER." = 21 vector glyphs, no <text> font fallback
    assert.equal((html.match(/class="rwm-glyph rwm-glyph-top"/g) ?? []).length, 9, '9 upper cabin glyphs (TYPE FAST.)');
    assert.equal((html.match(/class="rwm-glyph rwm-glyph-bot"/g) ?? []).length, 12, '12 lower chassis glyphs (DRIVE FASTER.)');
    assert.doesNotMatch(html, /<text\b/i, 'custom vector paths, not ordinary font text');
    // Integrated automotive details: chassis contours, front & rear forged alloy wheels, metallic silver / racing blue / fiery orange gradients
    assert.match(html, /class="rwm-chassis"/);
    assert.equal((html.match(/class="rwm-wheel"/g) ?? []).length, 2, 'front and rear integrated racing wheel arches');
    for (const grad of ['silver-blue', 'orange', 'silver', 'blue', 'ext-top', 'ext-bot']) {
      assert.match(html, new RegExp(`id="[^"]*-${grad}"`), `defines ${grad} gradient`);
    }
    assert.equal(new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])).size, [...html.matchAll(/ id="([^"]+)"/g)].length, 'SVG defs ids are unique');
    // The twin boosters are part of the chassis; the flames that once burned above the title's letters stay gone
    assert.equal((html.match(/class="rwm-booster"/g) ?? []).length, 2, 'two rear boosters');
    for (const src of [landing, wordmarkSrc, read('src/components/arcade/Wordmark.tsx'), css]) {
      assert.doesNotMatch(src, /WordmarkFire|wm-fire|wm-tongue|wm-jet|wm-embers/, 'no flames above the letters');
    }
    // PlatformTitle ("WEEKLY FUN ACTIVITY") on Welcome/Hub still works cleanly
    const pHtml = renderToStaticMarkup(createElement('div', null, createElement(PlatformTitle), createElement(WordmarkStreaks)));
    assert.match(pHtml, /Weekly/);
    assert.match(pHtml, /Fun Activity/);
  });

  test('animates with fast racing entry, staggered letter assembly, speed trails and short acceleration surge, settling clean', () => {
    for (const name of ['rwm-enter', 'rwm-accel', 'rwm-chassis-in', 'rwm-lock-top', 'rwm-lock-bot', 'rwm-wheel-rev', 'rwm-wheel-cruise', 'rwm-sheen-pass', 'rwm-trail-pass', 'rwm-pitch', 'rwm-surge', 'rwm-land', 'rwm-ride', 'rwm-ignite', 'rwm-burn', 'rwm-flick', 'rwm-lick', 'rwm-glow', 'rwm-glow-surge', 'rwm-spark', 'rwm-puff', 'rwm-streak', 'rwm-motion-in', 'rwm-motion-surge', 'rwm-brake', 'rwm-hl']) {
      assert.match(css, new RegExp(`@keyframes ${name}`), name);
    }
    // Speed trails run behind the wordmark and settle at opacity 0 (forwards fill) so the final mark stays clean and readable
    const trailsRule = css.slice(css.indexOf('.rwm-trails {'));
    assert.match(trailsRule.slice(0, trailsRule.indexOf('}')), /z-index: -1;/);
    assert.match(css, /animation: rwm-trail-pass [^;]*forwards;/);
  });

  test('reduced motion turns every wordmark animation off', () => {
    const art = read('src/ui/entry-art.css');
    const block = art.slice(art.indexOf('@media (prefers-reduced-motion: reduce)'));
    for (const cls of ['.rwm', '.rwm-car', '.rwm-chassis', '.rwm-fenders', '.rwm-glyph-top', '.rwm-glyph-bot', '.rwm-spokes', '.rwm-sheen', '.rwm-trails i', '.rwm-pitch', '.rwm-bob', '.rwm-plume', '.rwm-flick', '.rwm-glow', '.rwm-spark', '.rwm-hl-glow', '.rwm-tail-glow', '.rwm-motion', '.rwm-lick', '.rwm-puff', '.rwm-streak']) {
      assert.ok(block.includes(cls), cls);
    }
    assert.match(block, /animation: none !important;/);
    // and the design system stops every other animation (the game-to-game card included)
    const theme = read('src/ui/theme.css');
    assert.match(theme.slice(theme.indexOf('@media (prefers-reduced-motion: reduce)')), /animation-duration: 0\.001ms !important;/);
  });

  test('a phone header fits: the small labels give way first, the controls stay', () => {
    const theme = read('src/ui/theme.css');
    assert.match(theme, /@media \(max-width: 420px\) \{\s*\.plogo-sub \{\s*display: none;/, 'WEEKLY CONNECT folds away on a narrow phone');
    assert.match(theme, /@media \(max-width: 640px\) \{\s*\.logo-tag \{\s*display: none;/, 'TypeDrive’s tag line too');
    assert.match(theme, /\.status-chip span \{\s*display: none;/, 'the connection chip keeps only its dot');
  });
});

describe('the race as an arcade racer', () => {
  const track = read('src/components/race/Track.tsx');
  const css = uiCss();

  test('the race’s stylesheet loads after the design system and is only presentation', () => {
    const main = read('src/main.tsx');
    assert.ok(main.indexOf("import './ui/race.css'") > main.indexOf("import './ui/theme.css'"));
    assert.doesNotMatch(read('src/ui/race.css'), /@import|url\(['"]?https?:/, 'no network assets');
  });

  test('every one of the 50 looks has two turning wheels, gloss, lights and a shadow, and no look uses random values', () => {
    for (let i = 0; i < VEHICLE_TYPES * 10; i++) {
      const html = renderToStaticMarkup(createElement(Vehicle, { index: i }));
      assert.equal((html.match(/class="spokes"/g) ?? []).length, 2, `look ${i}: two wheels that turn`);
      for (const part of ['vx-gloss', 'vx-shadow', 'vx-head', 'vx-tail', 'vx-under']) assert.ok(html.includes(part), `look ${i}: ${part}`);
    }
    // clip ids are different per body so two bodies on screen never share a clip
    for (const f of ['src/components/Vehicle.tsx', 'src/components/race/Track.tsx']) assert.doesNotMatch(read(f), /Math\.random/, f);
    const ids = [...read('src/components/Vehicle.tsx').matchAll(/<Finish id="(\w+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('typing becomes effects through classes and CSS variables only — no React state, no per-frame re-render', () => {
    const fx = track.slice(track.indexOf('const paintFx'), track.indexOf('const clearPass'));
    assert.match(fx, /el\.style\.setProperty\('--k'/);
    assert.match(fx, /el\.style\.setProperty\('--n'/);
    assert.match(fx, /classList\.toggle\('rolling'/);
    assert.match(fx, /classList\.toggle\('nitro'/);
    assert.match(fx, /classList\.add\('pass'\)/);
    assert.doesNotMatch(fx, /setState|useState|useGame|dispatch\(/, 'nothing here re-renders React');
    // values are only written when they change
    assert.match(fx, /if \(kStr !== s\.kStr\)/);
    assert.match(fx, /if \(nStr !== s\.nStr\)/);
    // nitro has hysteresis so it does not flicker at the threshold
    assert.match(fx, /s\.nitro \? n > 0\.42 : n > 0\.62/);
    assert.match(fx, /uiSound\.whoosh\(\)/, 'passing someone makes the one soft whoosh');
  });

  test('an overtake needs a known previous side, a real gap, and a driver of my own (a spectator has none)', () => {
    const fx = track.slice(track.indexOf('// overtaking'), track.indexOf('const clearPass'));
    assert.match(fx, /const mine = id !== meId \? engine\.racers\.get\(meId\) : undefined;/);
    assert.match(fx, /gap > 0\.8 \? 1 : gap < -0\.8 \? -1 : s\.side/, 'a dead band, so two level cars do not flicker');
    assert.match(fx, /s\.side !== 0 && side !== s\.side && !engine\.spectating/);
  });

  test('the car layers are all there and the road scrolls on the same clock as before', () => {
    for (const cls of ['trail', 'flame', 'nitro-jet', 'beam']) assert.match(track, new RegExp(`<div className="${cls}" />`), cls);
    assert.match(track, /road\.style\.setProperty\('--pool-x'/);
    for (const sel of ['.car.nitro .nitro-jet', '.car.rolling .spokes', '.car.pass', '.car .beam', '.car .trail']) assert.ok(css.includes(sel), sel);
    assert.match(css, /animation: wheel-spin calc\(0\.5s \/ max\(var\(--f\), 0\.2\)\) linear infinite;/, 'wheels turn faster with speed');
  });

  test('the HUD: a gauge that follows the pace, a marked plate for the leader, a standings tower in team colours', () => {
    const gauge = read('src/components/race/Speedometer.tsx');
    for (const part of ['className="needle"', 'gauge-lit', 'strokeDasharray', 'TICKS.map']) assert.ok(gauge.includes(part), part);
    assert.match(read('src/components/race/Hud.tsx'), /pill pos\$\{hud\.rank === 1 \? ' lead' : ''\}/);
    const standings = read('src/components/race/Standings.tsx');
    assert.match(standings, /pos-plate/);
    assert.match(standings, /tm-\$\{p\.team\}/, 'the team’s colour down the side of each row');
    assert.match(standings, /Exit race/);
  });

  test('reduced motion stops the wheels, the nitro flicker, the flame and the overtake flash', () => {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    for (const cls of ['.car.rolling .spokes', '.car.pass', '.car.pass::after', '.car.nitro .nitro-jet', '.car .flame']) assert.ok(block.includes(cls), cls);
    assert.match(block, /animation: none !important;/);
  });
});

describe('between the games, and each game’s own look', () => {
  const app = read('src/App.tsx');
  const css = uiCss();

  test('the wipe appears only when the host moves the room to another screen, never blocks, and cannot delay anything', () => {
    const t = app.slice(app.indexOf('function GameTransition'), app.indexOf('export default function App'));
    assert.match(t, /if \(!was \|\| !activity \|\| was === activity\) return;/, 'not on first arrival, not on a re-render');
    assert.match(t, /window\.setTimeout\(\(\) => setShown\(null\), 1350\)/);
    assert.match(t, /aria-hidden/);
    assert.match(app, /<GameTransition \/>/);
    const rule = css.slice(css.indexOf('.gt {'));
    assert.match(rule.slice(0, rule.indexOf('}')), /pointer-events: none;/);
    // it reads nothing but the activity the server already put in the room
    assert.doesNotMatch(t, /send\(|fetch\(|WebSocket/);
  });

  test('Funny Pose Challenge and Tech Trivia keep their stage art inside their own cards, with plain light page chrome', () => {
    for (const f of ['src/screens/FunnyPose.tsx', 'src/screens/TechTrivia.tsx']) assert.match(read(f), /<Embers \/>/, f);
    assert.doesNotMatch(css, /content: 'ON AIR'|content: 'LIVE ARENA'/, 'no badge lettering on the page chrome');
  });

  test('no screen file other than the portal frame knows about the stage extras', () => {
    for (const f of files('src', /\.tsx$/)) {
      const src = readFileSync(f, 'utf8');
      if (/pt-set/.test(src)) assert.ok(f.replace(/\\/g, '/').endsWith('portal/parts.tsx'), f);
    }
  });
});
