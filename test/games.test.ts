import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { POSE_POINTS, POSE_ROUNDS, TRIVIA_LIMIT_MS, TRIVIA_POINTS, TRIVIA_QUESTIONS } from '../shared/activities';
import { POSE_BANK, poseById } from '../shared/poses';
import { GAME_FACTS, PoseStage, TriviaArena } from '../src/components/landing/GameStages';

// The Funny Pose Challenge and Tech Trivia landing pages: the stage and arena pictures are rendered for real; the rest is checked in the
// source. Nothing here touches how a room is made or joined, teams, scoring or the quiz — the page only gets a new look.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n');
const css = read('src/ui/entry-art.css');
const pageCss = read('src/ui/entry.css');
const landing = read('src/screens/Landing.tsx');

describe('the Funny Pose Challenge stage', () => {
  const html = renderToStaticMarkup(createElement(PoseStage));

  test('five of the game’s own poses on a game-show stage, one of them the star, all labelled with their real titles', () => {
    assert.equal((html.match(/class="gl-actor/g) ?? []).length, 5);
    assert.equal((html.match(/class="gl-actor star"/g) ?? []).length, 1);
    assert.equal((html.match(/class="gl-fig"/g) ?? []).length, 5, 'each actor is a pose drawing');
    for (const id of ['shocked', 'laughing', 'superhero', 'confused', 'disco']) {
      const pose = poseById(id);
      assert.ok(pose, `${id} is a pose in the game`);
      assert.ok(html.includes(`>${pose!.title}</span>`), `${id}: the plate reads "${pose!.title}"`);
    }
    // the stage dressing
    for (const part of ['gl-curtain-l', 'gl-curtain-r', 'gl-marquee', 'gl-beam', 'gl-pool', 'gl-boards', 'gl-confetti']) assert.ok(html.includes(part), part);
    assert.equal((html.match(/<i style="--i:\d+/g) ?? []).length, 30 + 16, '30 marquee bulbs and 16 pieces of confetti');
  });

  test('it is a decorative picture: hidden from screen readers, no text of its own except the pose names, no images', () => {
    assert.match(html, /^<section class="gl-stage gl-pose-stage" aria-hidden="true">/);
    assert.doesNotMatch(html, /<img\b|<image\b|href=/);
  });
});

describe('the Tech Trivia arena', () => {
  const html = renderToStaticMarkup(createElement(TriviaArena));

  test('a giant question mark, the five topics, and four answer panels with one lit', () => {
    assert.equal((html.match(/class="gl-q"/g) ?? []).length, 1);
    assert.equal((html.match(/>\?<\/text>/g) ?? []).length, 2, 'the mark and its extrusion');
    for (const topic of ['PYTHON', 'SQL', 'AI', 'CLOUD', 'GIT']) assert.ok(html.includes(`>${topic}</text>`), topic);
    assert.equal((html.match(/class="gl-t gl-t-/g) ?? []).length, 5);
    assert.equal((html.match(/class="gl-panel/g) ?? []).length, 4);
    assert.equal((html.match(/class="gl-panel gl-hot"/g) ?? []).length, 1);
    for (const letter of ['A', 'B', 'C', 'D']) assert.ok(html.includes(`>${letter}</text>`), `answer ${letter}`);
  });

  test('gradient ids are unique to the instance, and it is decorative', () => {
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(ids.length >= 4);
    assert.equal(new Set(ids).size, ids.length);
    assert.match(html, /^<section class="gl-stage gl-arena-stage" aria-hidden="true">/);
    assert.doesNotMatch(html, /<img\b|<image\b|href=/);
  });
});

describe('the facts under each introduction are the game’s own numbers', () => {
  test('Funny Pose: rounds, poses and points come from the shared rules', () => {
    assert.deepEqual([...GAME_FACTS.pose], [`${POSE_ROUNDS} rounds`, `${POSE_BANK.length} funny poses`, `+${POSE_POINTS} pts a round`]);
  });

  test('Tech Trivia: questions, seconds and the best score of a question come from the shared rules', () => {
    assert.deepEqual([...GAME_FACTS.trivia], [`${TRIVIA_QUESTIONS} questions`, `${TRIVIA_LIMIT_MS / 1000} s to answer`, `First correct: +${TRIVIA_POINTS} pts`]);
  });
});

describe('the landing page: only the look changed', () => {
  test('the artwork and the facts are for Funny Pose and Tech Trivia only; TypeDrive’s page keeps its own scene and how-to-play', () => {
    assert.match(landing, /className=\{game \? `lp lp-g lp-g-\$\{game\.id\} ac-\$\{game\.id\}` : 'lp ac-typedrive'\}/);
    assert.match(landing, /\{game \? \(\s*<div className="gl-wrap en-art rise"[^>]*>\s*\{game\.id === 'pose' \? <PoseStage \/> : <TriviaArena \/>\}/);
    assert.match(landing, /\) : \(\s*<div className="lp-scene en-art rise"[^>]*>\s*<RaceScene \/>/);
    assert.match(landing, /\{!game && <HowToPlay \/>\}/);
    assert.doesNotMatch(landing, /FeatureStrip/, 'the strip of four feature lines under the page is gone');
    assert.match(landing, /\{game && \(\s*<ul className="en-facts"/);
    // the page's dark lit backdrop was page decoration, not part of the art: gone with the dark theme
    assert.doesNotMatch(landing, /gl-bg/);
  });

  test('room creation, joining, the team pick and the name / code rules are the same code as before', () => {
    assert.match(landing, /if \(tab === 'host'\) create\(name\);\s*else if \(codeOk && team\) join\(code, name, team\);/);
    assert.match(landing, /const \[team, setTeam\] = useState<TeamId \| null>\(null\);/);
    assert.match(landing, /const \[name, setName\] = useState\(''\);/);
    assert.match(landing, /disabled=\{!ready \|\| !nameOk \|\| \(tab === 'join' && \(!codeOk \|\| !team\)\)\}/);
    assert.match(landing, /maxLength=\{ROOM_CODE_LEN\}/);
    assert.match(landing, /\{tab === 'join' && \(\s*<fieldset className="lp-fieldset tp-set">/);
    // the new files send nothing and keep no state of their own
    const stages = read('src/components/landing/GameStages.tsx');
    assert.doesNotMatch(stages, /useGame|socket|\.send\(|fetch\(|useState|useEffect|Math\.random/);
  });

  test('the art stylesheet is loaded by the landing page, loads nothing from the network, and every motion is off under reduced motion', () => {
    assert.match(landing, /import '\.\.\/ui\/entry-art\.css';/);
    assert.doesNotMatch(css, /@import|url\(['"]?https?:/, 'no network assets');
    // every animated selector appears in the reduced-motion block
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    const animated = [...css.slice(0, css.indexOf('@media (prefers-reduced-motion: reduce)')).matchAll(/([^{}]+)\{[^{}]*\banimation:[^{}]*\}/g)].map((m) => m[1]!.trim());
    assert.ok(animated.length > 10, 'there are animations to guard');
    for (const sel of ['.gl-marquee i', '.gl-actor', '.gl-fig', '.gl-q', '.gl-ico', '.gl-panel', '.gl-motes circle', '.gl-confetti']) assert.ok(block.includes(sel), sel);
    assert.match(block, /animation: none !important;/);
  });

  test('the accent colours are per game: pose is pink / gold, trivia is blue / cyan, and the other pages are not styled by this file', () => {
    assert.match(css, /\.lp-g-pose \{[^}]*--g:/s);
    assert.match(css, /\.lp-g-trivia \{[^}]*--g:/s);
    // the art file styles pictures only: every rule that starts from a page class names a game page, the wordmark or the race strip
    for (const sel of css.matchAll(/^(\.lp[^\s,{]*)[^{]*\{/gm)) assert.ok(/^\.lp-(g|h1\.lp-car-wm|scene)/.test(sel[1]!), `scoped: ${sel[0]}`);
    // and the page around the art is the light theme: no dark page backgrounds or neon glows in the entry layout
    assert.doesNotMatch(pageCss, /#0[0-9a-f]{5}\b|text-shadow/i);
  });
});
