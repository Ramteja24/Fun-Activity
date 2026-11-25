// Renders the two race-start sound effects into public/sfx/ (mono, 16-bit, 44.1 kHz WAV — uncompressed, so the first
// sample is the first sample played and the cue lands exactly when it is scheduled; MP3 would add ~25 ms of encoder delay).
//
//   npm run sfx
//
// countdown-beep.wav  the "3 · 2 · 1" cue: a bright start-light beep over a short low impact. The player plays the same
//                     file three times at rising pitch (playback rates 1, 1.122, 1.26 = +0, +2, +4 semitones).
// countdown-go.wav    the "GO!" cue: an A-major stab (A5 · C#6 · E6 · A6) on a deep impact, an engine-rev sweep and a
//                     rising air swoosh. Longer and fuller than the beeps, so GO is unmistakably the strongest sound.
//
// Pure synthesis, no samples and no dependencies. Noise comes from a fixed-seed generator, so the files are reproducible.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const TAU = Math.PI * 2;
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sfx');

function noise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 0x80000000) - 1;
  };
}

/** Evaluate `fn(t)` (t in seconds) for every sample. */
function render(seconds: number, fn: (t: number) => number): Float32Array {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR);
  return out;
}

/** Linear 3 ms attack and a raised-cosine release over the last `releaseS` seconds: no click at either end. */
function shape(buf: Float32Array, releaseS: number): Float32Array {
  const attack = Math.round(0.003 * SR);
  const release = Math.round(releaseS * SR);
  for (let i = 0; i < buf.length; i++) {
    let g = 1;
    if (i < attack) g = i / attack;
    const left = buf.length - i;
    if (left < release) g = Math.min(g, 0.5 - 0.5 * Math.cos((Math.PI * left) / release));
    buf[i]! *= g;
  }
  return buf;
}

/** A frequency sweep f(t) integrated into phase, so the pitch glides without zipper noise. */
function sweep(seconds: number, freq: (t: number) => number, amp: (t: number) => number, harmonics: number[] = [1]): Float32Array {
  let phase = 0;
  return render(seconds, (t) => {
    phase += (TAU * freq(t)) / SR;
    let v = 0;
    harmonics.forEach((h, k) => (v += h * Math.sin(phase * (k + 1))));
    return v * amp(t);
  });
}

function mix(length: number, ...layers: Float32Array[]): Float32Array {
  const out = new Float32Array(length);
  for (const l of layers) for (let i = 0; i < Math.min(length, l.length); i++) out[i]! += l[i]!;
  return out;
}

function normalise(buf: Float32Array, peak: number): Float32Array {
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  const g = peak / max;
  for (let i = 0; i < buf.length; i++) buf[i]! *= g;
  return buf;
}

// ------------------------------------------------------------------------------------------------ the beep
function beep(): Float32Array {
  const dur = 0.3;
  const hold = 0.17;
  const f0 = 880; // A5
  const tone = render(dur, (t) => {
    const env = t < hold ? 1 : Math.max(0, 0.5 + 0.5 * Math.cos((Math.PI * (t - hold)) / (dur - hold)));
    return env * (Math.sin(TAU * f0 * t) + 0.3 * Math.sin(TAU * 2 * f0 * t) + 0.14 * Math.sin(TAU * 3 * f0 * t));
  });
  const thump = sweep(0.14, (t) => 55 + 120 * Math.exp(-t * 16), (t) => 1.4 * Math.exp(-t * 26));
  const rnd = noise(7);
  const click = render(0.012, (t) => rnd() * Math.exp(-t * 500) * 0.35);
  return shape(normalise(mix(Math.round(dur * SR), tone, thump, click), 0.89), 0.05);
}

// ------------------------------------------------------------------------------------------------ the GO
function go(): Float32Array {
  const dur = 1.15;
  const notes = [
    { f: 880, a: 0.5 },
    { f: 1108.73, a: 0.42 },
    { f: 1318.51, a: 0.42 },
    { f: 1760, a: 0.26 },
  ];
  const stab = render(dur, (t) => {
    const env = Math.exp(-t * 3.4);
    let v = 0;
    for (const n of notes) v += n.a * (Math.sin(TAU * n.f * t) + 0.18 * Math.sin(TAU * 2 * n.f * t));
    return v * env;
  });
  const impact = sweep(0.32, (t) => 42 + 190 * Math.exp(-t * 11), (t) => 1.9 * Math.exp(-t * 9));
  // engine rev: a buzzy tone that climbs from 90 Hz to ~800 Hz over 0.5 s, swelling and fading as it goes
  const rev = sweep(
    0.55,
    (t) => 90 + 700 * Math.pow(Math.min(1, t / 0.5), 2),
    (t) => 0.55 * Math.pow(Math.sin(Math.PI * Math.min(1, t / 0.55)), 1.4),
    [1, 0.5, 0.33, 0.2],
  );
  // air swoosh: noise band-passed by two one-pole filters whose cut-offs rise together
  const rnd = noise(2024);
  let lo = 0;
  let hi = 0;
  const swoosh = render(0.5, (t) => {
    const x = rnd();
    const fc = 350 + 4200 * Math.pow(t / 0.5, 1.6);
    const aLo = 1 - Math.exp((-TAU * fc) / SR);
    const aHi = 1 - Math.exp((-TAU * (fc / 4)) / SR);
    lo += aLo * (x - lo);
    hi += aHi * (x - hi);
    return (lo - hi) * 1.9 * Math.pow(Math.sin(Math.PI * (t / 0.5)), 1.2);
  });
  const click = render(0.02, (t) => rnd() * Math.exp(-t * 350) * 0.5);
  // soft saturation packs more energy under the same peak, so GO hits harder than a beep that peaks just as high
  const body = normalise(mix(Math.round(dur * SR), stab, impact, rev, swoosh, click), 1);
  for (let i = 0; i < body.length; i++) body[i] = Math.tanh(2.2 * body[i]!);
  return shape(normalise(body, 0.89), 0.12);
}

// ------------------------------------------------------------------------------------------------ output
function wav(samples: Float32Array): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); // PCM header size
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

function report(name: string, s: Float32Array): void {
  let peak = 0;
  let sum = 0;
  for (const v of s) {
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  const db = (x: number) => (20 * Math.log10(x)).toFixed(1);
  console.log(`${name}: ${(s.length / SR).toFixed(3)} s, peak ${db(peak)} dBFS, RMS ${db(Math.sqrt(sum / s.length))} dBFS, ${s.length * 2 + 44} bytes`);
}

mkdirSync(outDir, { recursive: true });
for (const [name, samples] of [
  ['countdown-beep.wav', beep()],
  ['countdown-go.wav', go()],
] as const) {
  writeFileSync(join(outDir, name), wav(samples));
  report(name, samples);
}
