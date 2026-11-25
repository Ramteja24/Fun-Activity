import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CUES, createUiSounds, type CueName, type Noise, type Synth, type Voice } from '../src/audio/ui-sounds';
import { podiumSlots, type PodiumEntry } from '../src/components/arcade/Podium';

// The arcade look: the interface sounds (short, quiet, muted by the speaker button, never part of the game), the podium, and guards
// that keep the design decisions made earlier (no full-page animation behind the menus, one stylesheet loaded last, reduced motion).

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/** A synth that records what it was asked to play. */
function recorder() {
  const voices: Voice[] = [];
  const noises: Noise[] = [];
  const synth: Synth = { voice: (v) => voices.push(v), noise: (n) => noises.push(n) };
  return { synth, voices, noises };
}

function rig(opts: { wanted?: boolean; locked?: boolean } = {}) {
  const rec = recorder();
  const state = { wanted: opts.wanted ?? true, locked: opts.locked ?? false, now: 1000, ducked: [] as number[] };
  const sounds = createUiSounds({
    synth: () => (state.locked ? null : rec.synth),
    wanted: () => state.wanted,
    clock: () => state.now,
    duck: (ms) => state.ducked.push(ms),
  });
  return { sounds, rec, state };
}

describe('the interface sounds', () => {
  test('every cue is short and quiet: at most 1.3 s long, no note louder than 0.2, no more than 0.65 of gain sounding at once', () => {
    for (const [name, cue] of Object.entries(CUES) as [CueName, (typeof CUES)[CueName]][]) {
      const ends = [...cue.voices.map((v) => v.at + v.dur), ...(('noise' in cue ? cue.noise : []) as readonly Noise[]).map((n) => n.at + n.dur)];
      assert.ok(Math.max(...ends) <= 1.3, `${name} lasts ${Math.max(...ends)} s`);
      for (const v of cue.voices) assert.ok(v.gain <= 0.2 && v.gain > 0, `${name}: note gain ${v.gain}`);
      for (const n of ('noise' in cue ? cue.noise : []) as readonly Noise[]) assert.ok(n.gain <= 0.12, `${name}: noise gain ${n.gain}`);
      // the loudest moment: every note overlapping any note's start
      let peak = 0;
      for (const a of cue.voices) peak = Math.max(peak, cue.voices.filter((b) => b.at <= a.at && b.at + b.dur > a.at).reduce((s, b) => s + b.gain, 0));
      assert.ok(peak <= 0.65, `${name}: ${peak.toFixed(2)} of gain at once`);
    }
    // the small, frequent ones are really small
    for (const small of ['click', 'tick', 'select', 'join'] as const) assert.ok(Math.max(...CUES[small].voices.map((v) => v.at + v.dur)) <= 0.25, small);
  });

  test('only the win fanfare lowers the music, and the ordinary cues never do', () => {
    const { sounds, state } = rig();
    sounds.click();
    sounds.ding();
    sounds.correct();
    assert.deepEqual(state.ducked, []);
    sounds.fanfare();
    assert.deepEqual(state.ducked, [CUES.fanfare.duckMs]);
  });

  test('the speaker button silences every one of them, and nothing is played while the browser still blocks audio', () => {
    const muted = rig({ wanted: false });
    for (const name of Object.keys(CUES) as CueName[]) assert.equal(muted.sounds.play(name), false, name);
    assert.equal(muted.rec.voices.length + muted.rec.noises.length, 0);
    const locked = rig({ locked: true });
    for (const name of Object.keys(CUES) as CueName[]) assert.equal(locked.sounds.play(name), false, name);
    assert.equal(locked.rec.voices.length, 0);
    // un-muting brings them back
    muted.state.wanted = true;
    assert.equal(muted.sounds.click(), true);
  });

  test('a cue never repeats faster than its own gap, so a fast clicker or a quick spinner cannot machine-gun them', () => {
    const { sounds, rec, state } = rig();
    assert.equal(sounds.click(), true);
    state.now += CUES.click.gapMs - 1;
    assert.equal(sounds.click(), false, 'too soon');
    state.now += 1;
    assert.equal(sounds.click(), true);
    assert.equal(rec.voices.length, 2 * CUES.click.voices.length);
    // different cues do not hold each other back
    assert.equal(sounds.ding(), true);
    assert.equal(sounds.whoosh(), true);
    assert.equal(rec.noises.length, 1);
  });

  test('a spinner’s ticks climb in pitch as it slows', () => {
    const { sounds, rec, state } = rig();
    sounds.tick(0);
    state.now += 100;
    sounds.tick(1);
    const [slow, fast] = [rec.voices[0]!, rec.voices[1]!];
    assert.ok(Math.abs(fast.from / slow.from - 1.35) < 1e-9);
    assert.ok(fast.to && slow.to && Math.abs(fast.to / slow.to - 1.35) < 1e-9, 'the glide is scaled too');
    state.now += 100;
    sounds.tick(7); // out of range is clamped
    assert.equal(rec.voices[2]!.from, slow.from * 1.35);
  });

  test('the sounds are only ever started by screens: no server, shared or race-engine code knows about them', () => {
    for (const dir of ['server', 'shared', 'src/game', 'src/net']) {
      for (const f of readdirSync(join(root, dir), { recursive: true, withFileTypes: true }).filter((d) => d.isFile() && /\.tsx?$/.test(d.name))) {
        assert.doesNotMatch(readFileSync(join(f.parentPath, f.name), 'utf8'), /ui-sounds|uiSound/, `${dir}/${f.name}`);
      }
    }
    const src = read('src/audio/ui-sounds.ts');
    assert.match(src, /wanted: \(\) => music\.isEnabled\(\)/, 'follows the speaker button like every other effect');
    assert.match(src, /synth: \(\) => \(ctx && ctx\.state === 'running' \? webSynth : null\)/, 'silent while the browser blocks audio');
    assert.doesNotMatch(src.match(/const PRESSABLE = [^\n]+/)![0], /input|textarea/, 'never on the typing field');
    assert.match(src, /closest\('\[data-no-click-sound\]'\)/);
  });
});

describe('the podium', () => {
  const e = (rank: number, name: string): PodiumEntry => ({ key: name, rank, name, value: `${rank}` });
  test('2nd on the left, 1st in the middle, 3rd on the right; missing places stay empty', () => {
    assert.deepEqual(podiumSlots([e(1, 'a'), e(2, 'b'), e(3, 'c')]).map((s) => s?.name), ['b', 'a', 'c']);
    assert.deepEqual(podiumSlots([e(1, 'a'), e(2, 'b')]).map((s) => s?.name ?? null), ['b', 'a', null]);
    assert.deepEqual(podiumSlots([e(1, 'a')]).map((s) => s?.name ?? null), [null, 'a', null]);
    assert.deepEqual(podiumSlots([]), [null, null, null]);
    assert.equal(podiumSlots([e(1, 'a'), e(2, 'b'), e(3, 'c'), e(4, 'd')]).length, 3, 'only the top three');
  });
  test('a tie keeps its rank numbers (two firsts are shown as two 1s), so nobody is placed above a team they tied', () => {
    const slots = podiumSlots([e(1, 'a'), e(1, 'b'), e(3, 'c')]);
    assert.deepEqual(slots.map((s) => s?.rank), [1, 1, 3]);
  });
});

describe('the design system and the game art', () => {
  const ui = (f: string) => read(`src/ui/${f}`);
  const theme = ui('theme.css');
  const css = readdirSync(join(root, 'src/ui'))
    .filter((f) => f.endsWith('.css'))
    .map(ui)
    .join('\n');
  const OLD = ['styles', 'arcade', 'brand', 'racing', 'dashboard', 'pit', 'ceremony', 'demo', 'games', 'landing', 'lobby', 'teams', 'portal', 'music', 'difficulty', 'spectate', 'scenery', 'field'];

  test('one light design system is loaded first, then one stylesheet per area; the old dark stylesheets are gone', () => {
    const main = read('src/main.tsx');
    const order = ['theme', 'home', 'entry', 'lobby', 'race', 'results'].map((n) => main.indexOf(`import './ui/${n}.css'`));
    assert.ok(order.every((i) => i > 0), 'every area stylesheet is imported');
    assert.deepEqual([...order].sort((x, y) => x - y), order, 'the design system comes first');
    const srcCss = readdirSync(join(root, 'src')).filter((f) => f.endsWith('.css'));
    assert.deepEqual(srcCss, [], 'no stylesheet left outside src/ui');
    for (const f of readdirSync(join(root, 'src'), { recursive: true, withFileTypes: true }).filter((d) => d.isFile() && /\.tsx?$/.test(d.name))) {
      const src = readFileSync(join(f.parentPath, f.name), 'utf8');
      for (const old of OLD) assert.doesNotMatch(src, new RegExp(`import '(\\.\\./)+${old}\\.css'`), `${f.name} imports ${old}.css`);
    }
  });

  test('the theme is light: a pale page, white surfaces, dark ink and GANTEC orange as the brand colour', () => {
    assert.match(theme, /--bg: #f5f6fa;/);
    assert.match(theme, /--surface: #ffffff;/);
    assert.match(theme, /--ink: #151a2d;/);
    assert.match(theme, /--brand: #f67c01;/);
    assert.match(theme, /color-scheme: light;/);
    assert.match(theme, /body \{[^}]*background: var\(--bg\);/);
  });

  test('screens fit the window: a full-height frame, no visible scrollbars anywhere', () => {
    assert.match(theme, /scrollbar-width: none;/);
    assert.match(theme, /::-webkit-scrollbar \{[^}]*display: none;/);
    assert.match(theme, /\.lp-body \{[^}]*height: calc\(100dvh - var\(--demo-h, 0px\)\);/);
    assert.match(theme, /\.lp-main \{[^}]*flex: 1 1 auto;[^}]*min-height: 0;/);
  });

  test('embers are only on the two game stages — never behind the landing page, the first screen, the lobby or the hub', () => {
    const using = (needle: RegExp) =>
      readdirSync(join(root, 'src'), { recursive: true, withFileTypes: true })
        .filter((d) => d.isFile() && /\.tsx$/.test(d.name))
        .map((d) => join(d.parentPath, d.name))
        .filter((f) => needle.test(readFileSync(f, 'utf8')))
        .map((f) => f.slice(root.length + 5).replace(/\\/g, '/'));
    assert.deepEqual(using(/<Embers \/>/).sort(), ['screens/FunnyPose.tsx', 'screens/TechTrivia.tsx']);
    for (const f of ['src/screens/Landing.tsx', 'src/screens/Welcome.tsx', 'src/screens/Lobby.tsx', 'src/screens/Hub.tsx']) assert.doesNotMatch(read(f), /Embers|arc-spots|<Arena/, f);
  });

  test('reduced motion turns animation off everywhere', () => {
    const block = theme.slice(theme.indexOf('@media (prefers-reduced-motion: reduce)'));
    assert.match(block, /animation-duration: 0\.001ms !important;/);
    assert.match(block, /transition-duration: 0\.001ms !important;/);
    assert.match(read('src/components/arcade/CountUp.tsx'), /prefers-reduced-motion/);
  });

  test('the three games keep their own key art on the first screen and on the in-room dashboard, in the fixed order', () => {
    for (const f of ['src/screens/Welcome.tsx', 'src/screens/Hub.tsx']) {
      const src = read(f);
      assert.match(src, /<KeyArt id=\{a\.id\} \/>/, f);
      assert.match(src, /ACTIVITIES\.map\(/, f);
    }
    const art = read('src/components/arcade/KeyArt.tsx');
    for (const part of ["id === 'typedrive'", "id === 'pose'", '<TypeDriveArt', '<PoseArt', '<TriviaArt']) assert.ok(art.includes(part), part);
  });

  test('the race start is a full-lane sequence on the same numbers, lights and clock; GO flashes and throws rays', () => {
    const overlays = read('src/components/race/Overlays.tsx');
    assert.match(overlays, /data-stage=\{stage\}/);
    assert.match(overlays, /\{stage === 0 \? 'GO!' : stage\}/, 'the numbers are the ones already shown');
    assert.match(overlays, /<div className="cd-flash"/);
    assert.match(overlays, /<div className="cd-rays"/);
    assert.match(css, /\.countdown\[data-stage='0'\] \.cd-vignette/);
    // the race screen still schedules its sounds from the server-clock goAt, untouched
    assert.match(read('src/screens/Race.tsx'), /countdownAudio\.begin\(`\$\{raceId\}@\$\{goAt\}`, goAt\)/);
  });

  test('speed lines are a picture of the WPM the HUD shows, and only while racing', () => {
    const overlays = read('src/components/race/Overlays.tsx');
    assert.match(overlays, /Math\.min\(1, Math\.max\(0, \(wpm - 8\) \/ 100\)\)/);
    assert.match(read('src/screens/Race.tsx'), /<SpeedLines wpm=\{engine\.hud\.wpm\} racing=\{room\.phase === 'racing' && !engine\.localFinish\} \/>/);
  });

  test('results, match results and both game finales put the winners on a podium; difficulty cards keep their hooks and gain a gauge', () => {
    assert.match(read('src/screens/Results.tsx'), /<AwardsPodium entries=\{podium\} \/>/);
    for (const f of ['src/screens/MatchResults.tsx', 'src/screens/FunnyPose.tsx', 'src/screens/TechTrivia.tsx']) assert.match(read(f), /<TeamPodium scores=/, f);
    const picker = read('src/components/DifficultyPicker.tsx');
    assert.match(picker, /data-difficulty-card=\{d\.id\}/);
    assert.match(picker, /<DifficultyGauge level=\{d\.bars\} \/>/);
  });

  test('the game screens make their sounds from what is already on screen: spinner ticks, reveal, verdict, answers, timers', () => {
    const pose = read('src/screens/FunnyPose.tsx');
    for (const call of ['uiSound.tick(run)', 'uiSound.ding()', 'uiSound.whoosh()', 'uiSound.correct()', 'uiSound.wrong()']) assert.ok(pose.includes(call), `FunnyPose: ${call}`);
    const trivia = read('src/screens/TechTrivia.tsx');
    for (const call of ['uiSound.whoosh()', 'uiSound.tick(1)', 'uiSound.correct()', 'uiSound.wrong()']) assert.ok(trivia.includes(call), `TechTrivia: ${call}`);
    assert.match(read('src/components/race/Overlays.tsx'), /uiSound\.fanfare\(\)/);
    assert.match(read('src/App.tsx'), /installClickSounds\(\)/);
  });
});
