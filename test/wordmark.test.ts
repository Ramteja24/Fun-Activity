import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RacingWordmark, WORDMARK_GEOMETRY as G } from '../src/components/landing/RacingWordmark';

// The "TYPE FAST. DRIVE FASTER." logo as a sports car made of its own letters. The shape is checked as numbers (the wheels, the arches,
// the roof and bonnet lines) and the markup is rendered for real; the picture itself was also looked at in the browser.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const spell = (row: ReadonlyArray<{ ch: string }>) => row.map((l) => l.ch).join('');

describe('the words are the car', () => {
  test('both rows still spell the slogan, as one row of letters each (nothing is hidden or replaced)', () => {
    assert.equal(spell(G.upper), 'TYPEFAST.');
    assert.equal(spell(G.lower), 'DRIVEFASTER.');
    // words stay apart: a wider gap between TYPE | FAST and DRIVE | FASTER than between letters
    const gap = (row: ReadonlyArray<{ u0: number; u1: number }>, i: number) => row[i + 1]!.u0 - row[i]!.u1;
    assert.ok(gap(G.upper, 3) > 2 * gap(G.upper, 0), 'TYPE | FAST');
    assert.ok(gap(G.lower, 4) > 3 * gap(G.lower, 0), 'DRIVE | FASTER');
  });

  test('the roof is one smooth line: a fastback rising to a crown, then a raked windshield falling to the cowl', () => {
    const us = Array.from({ length: 80 }, (_, i) => 196 + i * ((632 - 196) / 79));
    const ys = us.map(G.roofY);
    const crown = ys.indexOf(Math.min(...ys));
    assert.ok(us[crown]! > 300 && us[crown]! < 460, 'the crown sits over the middle of the cabin');
    for (let i = 1; i <= crown; i++) assert.ok(ys[i]! <= ys[i - 1]! + 1e-9, 'rising from the tail to the crown');
    for (let i = crown + 1; i < ys.length; i++) assert.ok(ys[i]! >= ys[i - 1]! - 1e-9, 'falling from the crown to the cowl');
    assert.ok(ys[ys.length - 1]! - Math.min(...ys) > 35, 'a real rake, not a flat roof');
    // no letter of the cabin is squashed below a third of the tallest one, so each stays readable
    const cabinBottom = 111;
    const tallest = cabinBottom - Math.min(...ys);
    for (const l of G.upper.filter((s) => s.ch !== '.')) {
      const shortest = cabinBottom - Math.max(G.roofY(l.u0), G.roofY(l.u1));
      assert.ok(shortest >= tallest / 3, `${l.ch} at u=${l.u0} keeps ${Math.round((shortest / tallest) * 100)}% of its height`);
    }
  });

  test('the body: a low rear deck, flat doors, a long bonnet falling toward the nose, with no letter cut below 70% of the belt height', () => {
    assert.ok(G.beltlineY(40) > G.beltY + 5, 'the tail deck is lower than the doors');
    for (const u of [200, 400, 600]) assert.equal(G.beltlineY(u), G.beltY, 'flat across the doors');
    assert.ok(G.beltlineY(940) > G.beltY + 25, 'the bonnet falls toward the nose');
    for (let u = 660; u < 950; u += 10) assert.ok(G.beltlineY(u + 10) >= G.beltlineY(u), 'and never rises again');
    const full = G.sillY - G.beltY;
    for (const l of G.lower.filter((s) => s.ch !== '.')) {
      assert.ok((G.sillY - G.beltlineY(l.u1)) / full >= 0.7, `${l.ch} at u=${l.u0}`);
    }
  });
});

describe('the wheels are part of the body', () => {
  const letterAt = (u: number) => G.lower.find((l) => u >= l.u0 && u <= l.u1);

  test('they sit under the two narrowest letters — the I of DRIVE and the second T of FASTER — so no word is hidden behind a wheel', () => {
    const rear = letterAt(G.rearU)!;
    const front = letterAt(G.frontU)!;
    assert.equal(rear.ch, 'I');
    assert.equal(front.ch, 'T');
    assert.ok(front.u0 > G.lower.findIndex((l) => l.ch === 'F'), 'the T of FASTER, not of anything else');
    assert.equal(G.lower.filter((l) => l.ch === 'T').length, 1);
    // wheelbase and overhangs of a coupé: the rear axle about a fifth in, the front axle about three quarters of the way
    const x0 = G.lower[0]!.u0;
    const len = G.lower[G.lower.length - 1]!.u1 - x0;
    assert.ok(Math.abs((G.rearU - x0) / len - 0.21) < 0.04);
    assert.ok(Math.abs((G.frontU - x0) / len - 0.75) < 0.05);
  });

  test('the tyres are 25–30% bigger than the first version’s (radius 35), with the arch, the sill and the wheel centre moved down to match', () => {
    assert.ok(G.tyreR >= 35 * 1.25 && G.tyreR <= 35 * 1.3, `tyre radius ${G.tyreR}`);
    assert.ok(G.wheelCy < G.sillY, 'the axle stays above the sill, as on a car');
    assert.ok(G.wheelCy + G.tyreR > G.sillY + 25, 'and the tyre reaches well below it, to the road');
  });

  test('each arch is a round bite that leaves every letter at least 55% of its height, and it clears the tyre', () => {
    assert.ok(G.archR > G.tyreR + 2, 'the arch is bigger than the tyre');
    for (const wheelU of [G.rearU, G.frontU]) {
      for (const l of G.lower) {
        let worst = 0;
        for (let u = l.u0; u <= l.u1; u += 1) {
          const dx = u - wheelU;
          if (Math.abs(dx) >= G.archR) continue;
          const depth = G.sillY - (G.wheelCy - Math.sqrt(G.archR ** 2 - dx ** 2));
          worst = Math.max(worst, depth / (G.sillY - G.beltlineY(u)));
        }
        assert.ok(worst <= 0.45, `${l.ch} at u=${l.u0} loses ${Math.round(worst * 100)}% of its height`);
      }
    }
  });

  test('the markup: two wheels in two masked arches, glass and nose behind the letters, unique ids, vector letters (no font text)', () => {
    const html = renderToStaticMarkup(createElement(RacingWordmark));
    assert.equal((html.match(/class="rwm-wheel"/g) ?? []).length, 2);
    const mask = html.match(/<mask id="[^"]*-arches"[^>]*>.*?<\/mask>/s)?.[0] ?? '';
    assert.equal((mask.match(/<circle /g) ?? []).length, 2, 'one round bite per wheel');
    assert.match(html, /<g class="rwm-tier rwm-tier-bot" mask="url\(#[^"]*-arches\)">/, 'only the body row is cut by the arches');
    assert.doesNotMatch(html, /<g class="rwm-tier rwm-tier-top"[^>]*mask=/);
    assert.equal((html.match(/class="rwm-glyph rwm-glyph-top"/g) ?? []).length, 9);
    assert.equal((html.match(/class="rwm-glyph rwm-glyph-bot"/g) ?? []).length, 12);
    assert.doesNotMatch(html, /<text\b/i);
    assert.equal(new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])).size, [...html.matchAll(/ id="([^"]+)"/g)].length);
    assert.match(html, /class="rwm" aria-hidden="true"/, 'decorative: the heading’s own text is what screen readers get');
  });

  test('two boosters sit in the tail, each a nozzle with its own burn, drawn inside the car — not a separate image or an oversized rocket', () => {
    const html = renderToStaticMarkup(createElement(RacingWordmark));
    assert.equal(G.boosters, 2);
    assert.equal((html.match(/class="rwm-booster"/g) ?? []).length, 2);
    assert.equal((html.match(/class="rwm-plume"/g) ?? []).length, 2);
    // inside the chassis group, behind the letters, so the body is what they are mounted on
    const chassis = html.slice(html.indexOf('class="rwm-chassis"'), html.indexOf('class="rwm-tier rwm-tier-top"'));
    assert.equal((chassis.match(/class="rwm-booster"/g) ?? []).length, 2, 'both nozzles are part of the chassis');
    // each burn is orange outside and blue-white inside
    assert.match(html, /id="[^"]*-plume-o"/);
    assert.match(html, /id="[^"]*-plume-b"/);
    // proportion: the burn at full power is a small fraction of the car's length
    const car = G.lower[G.lower.length - 1]!.u1 - G.lower[0]!.u0;
    assert.ok(G.plumeLen / car < 0.08, `full burn is ${Math.round((G.plumeLen / car) * 100)}% of the car`);
  });

  test('the rear wing, the lamps and the nose are drawn behind the letters, and nothing is an image or a font', () => {
    const src = read('src/components/landing/RacingWordmark.tsx');
    assert.doesNotMatch(src, /<image\b|href=|<text\b|<foreignObject|rocket|missile/i);
    const html = renderToStaticMarkup(createElement(RacingWordmark));
    const chassis = html.slice(html.indexOf('class="rwm-chassis"'), html.indexOf('class="rwm-tier rwm-tier-top"'));
    for (const part of ['rwm-hl-glow', 'rwm-tail-glow', 'rwm-glow']) assert.ok(chassis.includes(part), part);
  });
});

describe('the animation', () => {
  const css = read('src/ui/entry-art.css').replace(/\r\n/g, '\n');
  const delay = (selector: string, name: string): number => {
    const rule = css.slice(css.indexOf(`${selector} {`));
    const m = rule.slice(0, rule.indexOf('}')).match(new RegExp(`${name} [\\d.]+s [^;]*? ([\\d.]+)s`));
    assert.ok(m, `${selector} animates ${name} with a delay`);
    return Number(m![1]);
  };

  const keyframes = (name: string) => css.match(new RegExp(`@keyframes ${name} \\{[\\s\\S]*?\\n\\}`))![0];

  test('the car accelerates in with a little motion blur and a trail follows and fades', () => {
    assert.match(css, /@keyframes rwm-enter \{\s*0% \{\s*opacity: 0;\s*transform: translate3d\(-230px, 0, 0\) skewX\(-12deg\);\s*filter: blur\(5px\);/);
    assert.match(css, /animation: rwm-trail-pass [^;]*forwards;/, 'the entry trails end invisible');
    assert.match(css, /@keyframes rwm-enter[\s\S]*?100% \{\s*opacity: 1;\s*transform: none;\s*filter: blur\(0\);/, 'and the car settles sharp');
  });

  test('the wheels spin up for two turns and then keep turning at speed: the cruise starts the moment the spin-up ends', () => {
    assert.match(keyframes('rwm-wheel-rev'), /rotate\(0deg\)[\s\S]*rotate\(720deg\)/, 'two whole turns, so the hand-over is seamless');
    assert.match(keyframes('rwm-wheel-cruise'), /rotate\(0deg\)[\s\S]*rotate\(360deg\)/);
    const rule = css.slice(css.indexOf('.rwm-spokes {'));
    const body = rule.slice(0, rule.indexOf('}'));
    const rev = body.match(/rwm-wheel-rev ([\d.]+)s .*? ([\d.]+)s backwards/)!;
    const cruise = body.match(/rwm-wheel-cruise ([\d.]+)s linear ([\d.]+)s infinite/)!;
    assert.ok(rev && cruise, 'both animations are on the spokes');
    assert.ok(Math.abs(Number(rev[1]) + Number(rev[2]) - Number(cruise[2])) < 1e-9, 'the cruise begins when the spin-up ends');
    assert.ok(Number(cruise[1]) <= 0.4 && Number(cruise[1]) >= 0.2, 'a turn takes about a third of a second: fast, but slow enough to read as turning');
  });

  test('the order is: enter and wheels turn → boosters ignite → trails → the car plants → the ride and the surge cycle', () => {
    const spin = delay('.rwm-spokes', 'rwm-wheel-rev');
    const ignite = delay('.rwm-plume', 'rwm-ignite');
    const plant = delay('.rwm-bob', 'rwm-land');
    const idle = delay('.rwm-bob', 'rwm-ride');
    const surge = delay('.rwm-plume', 'rwm-burn');
    // the ignition ends exactly when the repeating burn begins, so the flame never jumps
    const plume = css.slice(css.indexOf('.rwm-plume {'));
    const ign = plume.slice(0, plume.indexOf('}')).match(/rwm-ignite ([\d.]+)s .*? ([\d.]+)s backwards/)!;
    assert.ok(Math.abs(Number(ign[1]) + Number(ign[2]) - surge) < 1e-9, 'the ignition hands over to the cycle');
    assert.ok(spin < ignite, 'the wheels are already turning when the boosters light');
    for (const t of ['t1', 't2', 't3', 't4']) {
      const rule = css.slice(css.indexOf(`.rwm-trails .rwm-${t} {`));
      const d = Number(rule.slice(0, rule.indexOf('}')).match(/animation-delay: ([\d.]+)s/)![1]);
      assert.ok(d >= ignite - 0.05 && d < plant, `trail ${t} starts with the burn and before the car plants`);
    }
    assert.ok(ignite < plant, 'the car plants after the boosters have lit');
    assert.ok(idle >= plant + 0.7 - 1e-9, 'the ride starts only after the landing has finished');
  });

  test('the boosters really burn: a strong resting flame, a brief surge every cycle, a flicker that is never in step', () => {
    const rest = css.match(/\.rwm-plume \{[^}]*?transform: scale\(([\d.]+), ([\d.]+)\);/)!;
    assert.ok(Number(rest[1]) >= 0.85 && Number(rest[2]) >= 0.85, 'the resting flame is nearly full size, clearly visible');
    // the ignition ends at the resting scale, so nothing jumps when the animation finishes
    assert.ok(keyframes('rwm-ignite').trimEnd().endsWith(`transform: scale(${rest[1]}, ${rest[2]});\n    opacity: 1;\n  }\n}`), 'the last keyframe is the resting scale');
    // the surge stretches the flame by at most 1.6x, and it is back at rest by 40% of the cycle
    const steps = [...keyframes('rwm-burn').matchAll(/(\d+)%[^{]*\{\s*transform: scale\(([\d.]+),/g)].map((m) => ({ at: Number(m[1]), x: Number(m[2]) }));
    const peak = Math.max(...steps.map((p) => p.x));
    assert.ok(peak > Number(rest[1]) * 1.25 && peak <= 1.6, `the surge stretches the flame to ${peak}`);
    assert.ok(steps.filter((p) => p.at >= 34).every((p) => p.x <= Number(rest[1]) + 0.05), 'and it is over by the third of the cycle');
    assert.match(css, /\.rwm-plume \{[^}]*transform-origin: 100% 50%;/, 'the flame grows out of the nozzle');
    // two flicker periods that are not the same
    const flick = css.match(/animation: rwm-flick ([\d.]+)s/)![1];
    const lick = css.match(/animation: rwm-lick ([\d.]+)s/)![1];
    assert.notEqual(Number(flick), Number(lick));
    assert.ok(Number(flick) <= 0.3 && Number(lick) <= 0.4, 'quick enough to read as fire');
  });

  test('the car never leaves its mark: only a faint rock, a small ride and a squat — nothing slides it away', () => {
    for (const m of keyframes('rwm-ride').matchAll(/translateY\((-?[\d.]+)px\)/g)) assert.ok(Math.abs(Number(m[1])) <= 2, `ride ${m[1]}px`);
    assert.doesNotMatch(keyframes('rwm-ride'), /translateX/);
    for (const name of ['rwm-surge', 'rwm-pitch']) {
      for (const m of keyframes(name).matchAll(/rotate\((-?[\d.]+)deg\)/g)) assert.ok(Math.abs(Number(m[1])) <= 1, `${name} ${m[1]}deg`);
      assert.doesNotMatch(keyframes(name), /translate/, `${name} only tilts the car`);
    }
    // the infinite loops are all parts of the one driving effect
    const infinite = [...css.matchAll(/animation:[^;]*infinite[^;]*;/g)].map((m) => m[0]).filter((a) => a.includes('rwm-'));
    assert.ok(infinite.length >= 8, infinite.join(' | '));
    for (const a of infinite) assert.match(a, /rwm-(wheel-cruise|ride|surge|burn|flick|lick|glow-surge|motion-surge|spark|puff|streak)/);
  });

  test('exhaust particles and moving streaks: sparks and puffs stream back from each nozzle, streaks of air run away behind the car', () => {
    const html = renderToStaticMarkup(createElement(RacingWordmark));
    assert.equal((html.match(/class="rwm-spark"/g) ?? []).length, 16, 'eight sparks at each of the two nozzles');
    assert.equal((html.match(/class="rwm-puff"/g) ?? []).length, 6, 'three puffs of exhaust at each nozzle');
    assert.equal((html.match(/class="rwm-streak"/g) ?? []).length, G.wind);
    // the streaks are drawn first, so they sit behind everything; and they move away from the car (leftwards)
    assert.ok(html.indexOf('class="rwm-wind"') < html.indexOf('class="rwm-chassis"'));
    assert.match(keyframes('rwm-streak'), /translateX\(20px\)[\s\S]*translateX\(-170px\)/);
    assert.match(keyframes('rwm-spark'), /translate\(var\(--dx, -50px\), var\(--dy, 0px\)\)/);
    assert.match(keyframes('rwm-puff'), /scale\(2\.4\)/);
  });

  test('on a phone the lightest parts do the work: no exhaust puffs and no soft shadow behind the mark', () => {
    assert.match(css, /@media \(max-width: 640px\) \{\s*\.rwm-puff \{\s*display: none;\s*\}\s*\.rwm \{\s*filter: none;/);
  });

  test('the bounce moves the body and not the wheels: the wheels sit between two body groups', () => {
    const html = renderToStaticMarkup(createElement(RacingWordmark));
    const bobs = [...html.matchAll(/class="rwm-bob/g)].length;
    assert.equal(bobs, 2, 'one group under the wheels (body and arches) and one over them (fender lips)');
    const firstBob = html.indexOf('class="rwm-bob"');
    const wheel = html.indexOf('class="rwm-wheel"');
    const lips = html.indexOf('class="rwm-bob rwm-lips"');
    assert.ok(firstBob < wheel && wheel < lips);
  });
});
