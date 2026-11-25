import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calcAccuracy,
  calcScore,
  calcWpm,
  formatTime,
  liveWpm,
  normalizeRoomCode,
  ordinal,
  sanitizeName,
  trophiesFor,
} from '../shared/game';
import { NAME_MAX, ROOM_CODE_ALPHABET } from '../shared/protocol';
import { TEAMS } from '../shared/teams';
import { PASSAGES } from '../server/passages';

const REEL_PASSAGE =
  'Carved by monumental glacial ice over thousands of years, emerald waters wind between towering vertical cliffs lined with roaring mountain waterfalls.';

test('the reel passage (exactly 150 characters) opens the first passage', () => {
  assert.equal(REEL_PASSAGE.length, 150);
  assert.ok(PASSAGES[0]!.startsWith(`${REEL_PASSAGE} `), 'passage #0 starts with the reel text, then continues');
});

test('every passage is typeable and long enough: ASCII letters/space/comma/period, 300–350 characters, readable sentences', () => {
  for (const p of PASSAGES) {
    assert.match(p, /^[A-Za-z][A-Za-z ,.]*[.]$/, p);
    assert.ok(p.length >= 300 && p.length <= 350, `${p.length} chars: ${p}`);
    assert.ok(!p.includes('  '), p);
    const words = p.split(' ');
    assert.ok(words.length >= 50 && words.length <= 75, `${words.length} words: ${p}`);
    assert.ok(words.every((w) => /^[A-Za-z]+[,.]?$/.test(w)), `every word is plain text: ${p}`);
    assert.ok((p.match(/\./g) ?? []).length >= 2, `at least two sentences: ${p}`);
  }
  assert.equal(new Set(PASSAGES).size, PASSAGES.length);
});

test('the passages are roughly double the old ones (the old set averaged ~165 characters)', () => {
  const avg = PASSAGES.reduce((n, p) => n + p.length, 0) / PASSAGES.length;
  assert.ok(avg >= 320 && avg <= 350, `average ${avg.toFixed(0)}`);
});

test('WPM matches the reel: 150 chars in 31.4 s = 57 WPM', () => {
  assert.equal(Math.round(calcWpm(150, 31_400)), 57);
  assert.equal(calcWpm(0, 1000), 0);
  assert.equal(calcWpm(100, 0), 0);
});

test('score formula reproduces the reel sample (57.3 WPM / 93 % → +643)', () => {
  assert.equal(calcScore(calcWpm(150, 31_400), 93, 1), 643);
  assert.equal(calcScore(60, 100, 0.5), Math.round((600 + 75) * 0.5));
});

test('accuracy', () => {
  assert.equal(calcAccuracy(0, 0), 100);
  assert.equal(Math.round(calcAccuracy(150, 11)), 93);
});

test('trophies: 1st +25 (from the reel), podium and finishers scale down, DNF none', () => {
  assert.deepEqual([1, 2, 3, 4, 9].map((r) => trophiesFor(r, true)), [25, 15, 10, 5, 5]);
  assert.equal(trophiesFor(1, false), 0);
});

test('live WPM is a short rolling window', () => {
  const goAt = 10_000;
  // 6 correct chars by 1.8 s after GO ≈ 40 WPM (reel: 41)
  const t = [0.3, 0.6, 0.9, 1.2, 1.5, 1.8].map((s) => goAt + s * 1000);
  assert.equal(Math.round(liveWpm(t, goAt + 1800, goAt)), 40);
  // typing stops → decays to 0 once the window has passed
  assert.equal(liveWpm(t, goAt + 20_000, goAt), 0);
  assert.equal(liveWpm([], goAt + 5000, goAt), 0);
});

test('sanitizeName', () => {
  assert.equal(sanitizeName('  Ada   Lovelace  '), 'Ada Lovelace');
  assert.equal(sanitizeName('<b>Bob</b>'), 'bBob/b');
  assert.equal(sanitizeName('x'.repeat(40))?.length, NAME_MAX);
  assert.equal(NAME_MAX, 20);
  // every name on the team lists survives whole (the longest is "Kailashnath Sharma", 18 characters)
  for (const t of TEAMS) for (const m of t.members) assert.equal(sanitizeName(m), m, m);
  assert.equal(sanitizeName('   '), null);
  assert.equal(sanitizeName(42), null);
  assert.equal(sanitizeName('a\u0000b\u001fc'), 'abc');
});

test('room codes: normalised, vowel-free alphabet', () => {
  assert.equal(normalizeRoomCode(' k7-bq '), 'K7BQ');
  assert.equal(normalizeRoomCode('abc'), null);
  assert.equal(normalizeRoomCode('ABCDE'), null);
  assert.equal(normalizeRoomCode('AEIO'), null); // vowels are not in the alphabet
  for (const v of 'AEIOUY01') assert.ok(!ROOM_CODE_ALPHABET.includes(v));
});

test('ordinal / formatTime', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st']);
  assert.equal(formatTime(31_400), '0:31.4');
  assert.equal(formatTime(65_250), '1:05.3');
  assert.equal(formatTime(0), '0:00.0');
});
