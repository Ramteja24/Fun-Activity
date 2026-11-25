import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Source-level guards for UI requirements that have no DOM test environment here (the real behaviour was also checked
// in a browser). They exist so a refactor cannot quietly bring back pre-filled names or lettered barrier boards.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

test('names are never pre-filled or remembered: Host and Join start empty, with the "Enter your name" placeholder', () => {
  const landing = read('src/screens/Landing.tsx');
  const store = read('src/store.ts');
  assert.match(landing, /useState\(''\)/, 'the name field starts empty (one state for both tabs)');
  assert.match(landing, /placeholder="Enter your name"/);
  assert.doesNotMatch(landing, /rememberedName|localStorage/);
  assert.doesNotMatch(store, /rememberedName/, 'the store neither reads nor writes a stored name');
  for (const m of store.matchAll(/localStorage\.(getItem|setItem)\(([^,)]+)/g)) assert.equal(m[2], 'ADMIN_KEY', 'the only thing kept in localStorage is the admin login');
  assert.match(store, /localStorage\.removeItem\(LEGACY_NAME_KEY\)/, 'a name left by an older build is cleared');
  // creating/joining still requires a name
  assert.match(landing, /nameOk = name\.trim\(\)\.length > 0/);
  assert.match(landing, /if \(!ready \|\| !nameOk\) return;/);
  assert.match(landing, /disabled=\{!ready \|\| !nameOk/);
  // no hard-coded default names anywhere in the screens
  for (const f of ['src/screens/Landing.tsx', 'src/screens/Lobby.tsx']) assert.doesNotMatch(read(f), /defaultValue=|value="(Guest|Player|Racer|Asha)/i, f);
});

test('the landing preview boards are three alternating dark panels (the lettering itself is checked in race-visuals.test.ts)', () => {
  const css = read('src/ui/entry-art.css');
  const boards = css.slice(css.indexOf('.sc-boards span {'), css.indexOf('.sc-kerb {'));
  for (const n of ['3n + 1', '3n + 2', '3n']) assert.ok(boards.includes(`.sc-boards span:nth-child(${n})`), `panel style ${n}`);
  assert.ok(css.includes('translateX(calc(var(--bw) * -3))'), 'the loop length matches the three-panel set');
});

test('the landing preview animation is slowed down by roughly 40–50% from the previous build', () => {
  const css = read('src/ui/entry-art.css');
  const scene = read('src/components/landing/RaceScene.tsx');
  // [pattern, previous duration in seconds]
  const before: [RegExp, number][] = [
    [/sc-pan (\d+(?:\.\d+)?)s/, 90],
    [/sc-kerb-t (\d+(?:\.\d+)?)s/, 0.2],
    [/sc-kerb-b (\d+(?:\.\d+)?)s/, 0.16],
    [/sc-slide calc\((\d+(?:\.\d+)?)s \+ var\(--k\) \* (\d+(?:\.\d+)?)s\)/, 0.13],
    [/sc-boards (\d+(?:\.\d+)?)s/, 11],
    [/sc-trail (\d+(?:\.\d+)?)s/, 0.55],
    [/sc-wpm (\d+(?:\.\d+)?)s/, 9],
    [/sc-typing (\d+(?:\.\d+)?)s/, 9],
  ];
  for (const [re, was] of before) {
    const m = css.match(re);
    assert.ok(m, `${re} is still defined`);
    const slower = 1 - was / Number(m![1]); // fraction of speed removed
    assert.ok(slower >= 0.38 && slower <= 0.52, `${re}: ${was}s → ${m![1]}s slows it by ${(slower * 100).toFixed(0)}%`);
  }
  // car drift durations (were 7.5–11 s)
  const drifts = [...scene.matchAll(/d: (\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  assert.ok(drifts.length >= 5 && Math.min(...drifts) >= 13 && Math.max(...drifts) <= 21, `car drift durations ${drifts.join(', ')} s`);
});

test('the three-line race menu shows an "Exit Race" option that asks for confirmation before leaving the room', () => {
  const standings = read('src/components/race/Standings.tsx');
  assert.match(standings, /Exit Race/, 'menu contains Exit Race option');
  assert.match(standings, /confirmingExit/, 'tracks confirmation state');
  assert.match(standings, /role="alertdialog"/, 'confirmation dialog is rendered');
  assert.match(standings, /Cancel/, 'has a Cancel button');
  assert.match(standings, /Confirm/, 'has a Confirm button');
  assert.match(standings, /leave\(\)/, 'calls store leave() when confirmed');
});

test('the speaker icon opens a volume slider popover with mute/unmute, sharing volume state across screens', () => {
  const toggle = read('src/components/MusicToggle.tsx');
  assert.match(toggle, /type="range"/, 'renders a volume slider');
  assert.match(toggle, /music\.setVolume\(/, 'slider updates music controller volume');
  assert.match(toggle, /music\.toggle\(\)/, 'mute/unmute toggle is available');
  assert.match(toggle, /useMusicVolume\(\)/, 'subscribes to shared volume state');
});

