import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BOARD_TEXT } from '../src/brand';
import { Crowd } from '../src/components/race/Crowd';
import { GAUGE_LANES, GAUGE_MIN_PX, BAR_PAD_PX, gaugeSize, laneHeightFor, stageHeight, typebarHeight } from '../src/game/sizing';

// Race-screen visuals: the speedometer's size and its place in the typing bar, and the spectator/sponsor-board scenery.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const raceCss = () => read('src/ui/race.css');
/** The crowd's part of ui/race.css (between its @scenery markers). */
const sceneryCss = () => {
  const css = raceCss();
  return css.slice(css.indexOf('/* @scenery-start'), css.indexOf('/* @scenery-end */'));
};

// ------------------------------------------------------------------------------------------------ speedometer
/** The previous gauge: max(58px, 1.15 × lane height). */
const oldGauge = (lane: number) => Math.max(58, lane * 1.15);

test('the speedometer is at least 1.4× its old size at every lane height (1.5×+ on desktop and tablet)', () => {
  for (let lane = 26; lane <= 72; lane += 2) {
    assert.ok(gaugeSize(lane) >= oldGauge(lane) * 1.4, `lane ${lane}: ${gaugeSize(lane).toFixed(0)}px vs old ${oldGauge(lane).toFixed(0)}px`);
  }
  assert.ok(gaugeSize(72) / oldGauge(72) >= 1.45, 'desktop lane height: about 1.5× bigger');
  assert.ok(gaugeSize(43) >= 84, 'phone: never below 84px');
});

test('the typing bar is taller than the gauge, so the gauge sits fully inside it and never covers the road', () => {
  for (const lane of [26, 38, 43, 52, 60, 72]) assert.ok(Math.abs(typebarHeight(lane) - gaugeSize(lane) - BAR_PAD_PX) < 1e-9, `lane ${lane}`);
});

test('the stage always fits the visible height (down to a short landscape phone) and the lane height grows with width up to a cap', () => {
  for (const [w, h] of [[1920, 1080], [1366, 768], [1280, 720], [1024, 768], [768, 1024], [414, 896], [375, 812], [360, 640], [667, 375]] as const) {
    const lane = laneHeightFor(w, h);
    assert.ok(lane <= 72 && lane >= 26, `${w}×${h}: lane ${lane}`);
    if (lane > 26) assert.ok(stageHeight(lane) <= h, `${w}×${h}: stage ${stageHeight(lane).toFixed(0)}px fits ${h}px`);
  }
  assert.equal(laneHeightFor(1920, 1080), 72, 'big screens use the maximum lane height');
  assert.ok(laneHeightFor(500, 900) < laneHeightFor(900, 900), 'narrower windows get a smaller lane');
});

test('ui/race.css lays the stage out with the same gauge numbers as the sizing helper', () => {
  const css = raceCss();
  assert.ok(css.includes(`--gauge-d: max(${GAUGE_MIN_PX}px, calc(var(--lane-h) * ${GAUGE_LANES}));`), 'gauge diameter');
  assert.ok(css.includes(`--typebar-h: calc(var(--gauge-d) + ${BAR_PAD_PX}px);`), 'typing bar height');
  assert.match(css, /\.gauge \{[^}]*left: 8px;[^}]*bottom: 6px;[^}]*width: var\(--gauge-d\);[^}]*height: var\(--gauge-d\);/s, 'gauge is seated bottom-left of the bar');
  assert.match(css, /\.type-window \{[^}]*inset: 0 0 0 calc\(var\(--gauge-d\) \+ 22px\);/s, 'the passage window starts to the right of the gauge');
});

test('the gauge has a smooth needle, a lit arc, ticks and a readable WPM readout', () => {
  const src = read('src/components/race/Speedometer.tsx');
  for (const part of ['className="needle"', 'gauge-lit', 'strokeDasharray', 'WPM', 'TICKS.map', 'aria-label']) assert.ok(src.includes(part), part);
  const css = raceCss();
  assert.match(css, /\.gauge \.needle \{[^}]*transition: transform 0\.28s/s);
});

// ------------------------------------------------------------------------------------------------ scenery
test('the boards carry exactly GANTEC, TYPE FAST and DRIVE FASTER in both the race scene and the landing preview', () => {
  assert.deepEqual([...BOARD_TEXT], ['GANTEC', 'TYPE FAST', 'DRIVE FASTER']);
  const sources = [read('src/components/race/Crowd.tsx'), read('src/components/landing/RaceScene.tsx')];
  for (const src of sources) {
    assert.ok(src.includes("from '../../brand'") && src.includes('BOARD_TEXT'), 'uses the shared lettering');
    for (const word of ['WEEKLY CONNECT', 'TYPEDRIVE', 'INDUSTRIAL']) assert.ok(!src.includes(word), `${word} must not be on a board`);
  }
});

test('the race scenery renders a crowd (three tiles of spectators with two pose layers) and the repeating sponsor boards', () => {
  const noRef = { current: null };
  const html = renderToStaticMarkup(createElement(Crowd, { crowdRef: noRef, boardsRef: noRef }));
  assert.equal((html.match(/class="cr-tile"/g) ?? []).length, 3, 'three crowd tiles so the stands loop without a gap');
  assert.ok((html.match(/<use /g) ?? []).length > 500, 'hundreds of spectators and arms');
  for (const group of ['cr-g0', 'cr-g1', 'cr-g2', 'cr-back']) assert.ok(html.includes(group), group);
  assert.ok(html.includes('cr-p1') && html.includes('cr-p2'), 'cheering = two arm poses per group');
  assert.ok(html.includes('id="cr-flag"') && html.includes('id="cr-clap"') && html.includes('id="cr-up"'), 'flags, clapping and raised arms');
  assert.ok(html.includes('cr-glow'), 'floodlights');
  // sponsor boards: 18 panels = 6 repeats of the three phrases, in order
  const boards = [...html.matchAll(/<span class="sb sb(\d)">([^<]+)<\/span>/g)].map((m) => m[2]);
  assert.equal(boards.length, 18);
  assert.deepEqual(boards, Array.from({ length: 18 }, (_, i) => BOARD_TEXT[i % 3]));
  assert.ok(html.indexOf('class="crowd"') < html.indexOf('class="boards"'), 'the barrier of boards is drawn after (in front of) the crowd');
});

test('the industrial skyline (buildings, pylons) is gone from the race screen; the crowd replaces it and sits behind the road', () => {
  const track = read('src/components/race/Track.tsx');
  const css = raceCss();
  assert.ok(!track.includes('scenery.svg') && !track.includes('className="layer"'), 'Track no longer draws the skyline layer');
  assert.ok(track.includes('<Crowd '), 'Track draws the crowd');
  assert.ok(!/\.scenery \.layer/.test(css) && !/\.scenery[^}]*scenery\.svg/s.test(css), 'no skyline background left in the scenery band');
  const scenery = sceneryCss();
  assert.match(scenery, /\.crowd \{[^}]*inset: 0 0 calc\(13px \+ var\(--boards-h\)\) 0;[^}]*overflow: hidden;/s, 'the crowd stays inside the scenery band, above the track edge');
  assert.doesNotMatch(scenery, /z-index/, 'no z-index: the crowd stays behind the road, HUD and typing bar');
  assert.match(css, /\.road \{[^}]*z-index: 1;/s);
});

test('crowd animation is light and respects reduced motion', () => {
  const scenery = sceneryCss();
  // arm poses toggle by opacity: one rule per pose layer, shared by every group (never per spectator), plus one hop
  assert.equal((scenery.match(/animation: cr-/g) ?? []).length, 3, 'pose layer 1, pose layer 2, and the hop of one group');
  assert.match(scenery, /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.cr-p1,[^}]*\.cr-p2,[^}]*\.cr-g2 \.cr-hop \{[^}]*animation: none;/s);
  // parallax is done with transforms from Track.tsx (no per-frame custom-property writes on the crowd's ancestor)
  const track = read('src/components/race/Track.tsx');
  assert.ok(track.includes('crowdRef.current.style.transform') && track.includes('boardsRef.current.style.transform'));
  assert.ok(!track.includes("'--sx'"));
});
