import { music } from './music';

// The short interface sounds of the arcade look: a click on buttons, the ticks of a spinner, a ding when it lands, a whoosh for a
// reveal, a chime for a right answer, a low buzz for a wrong one, a fanfare for a win. They are synthesised on the spot (no audio
// files, no dependency), kept short and quiet on purpose, and follow the same rule as every other effect in the game: the speaker
// button mutes them, and while the browser still blocks audio they are simply silent. Nothing in the game waits on a sound.
//
// The cues are plain data (`CUES`) so their length and loudness can be checked; `createUiSounds` plays them through whatever
// "synth" it is given (the real Web Audio one in the browser, a recording fake in the tests).

/** One note: a tone that may glide from `from` to `to` Hz, starting `at` seconds after the cue and lasting `dur` seconds. */
export interface Voice {
  type: 'sine' | 'triangle' | 'square' | 'sawtooth';
  from: number;
  to?: number;
  at: number;
  dur: number;
  gain: number;
}
/** A whoosh of filtered noise that sweeps from `fromHz` to `toHz`. */
export interface Noise {
  at: number;
  dur: number;
  gain: number;
  fromHz: number;
  toHz: number;
}
export interface Cue {
  voices: readonly Voice[];
  noise?: readonly Noise[];
  /** Cues of one kind are never closer together than this (milliseconds). */
  gapMs: number;
  /** Lower the music while it plays (a win, not a click). */
  duckMs?: number;
}

const v = (type: Voice['type'], from: number, at: number, dur: number, gain: number, to?: number): Voice => ({ type, from, at, dur, gain, ...(to ? { to } : {}) });

/** C major: C5 523 · E5 659 · G5 784 · C6 1047 · E6 1319 · G6 1568 */
export const CUES = {
  /** a button press */
  click: { voices: [v('triangle', 1250, 0, 0.05, 0.1, 820)], gapMs: 40 },
  /** choosing something (a team, a difficulty) */
  select: { voices: [v('triangle', 660, 0, 0.07, 0.1), v('triangle', 990, 0.065, 0.1, 0.1)], gapMs: 80 },
  /** a spinner passing a name */
  tick: { voices: [v('triangle', 1500, 0, 0.03, 0.09, 950)], gapMs: 45 },
  /** a spinner landing, a pose being revealed */
  ding: { voices: [v('sine', 1319, 0, 0.5, 0.14), v('sine', 1976, 0, 0.32, 0.05)], gapMs: 150 },
  /** a reveal */
  whoosh: { voices: [], noise: [{ at: 0, dur: 0.32, gain: 0.1, fromHz: 400, toHz: 2600 }], gapMs: 200 },
  /** points landing */
  pop: { voices: [v('sine', 520, 0, 0.09, 0.14, 940), v('sine', 1568, 0.07, 0.16, 0.06)], gapMs: 80 },
  /** someone joins the room */
  join: { voices: [v('triangle', 523, 0, 0.09, 0.07), v('triangle', 784, 0.08, 0.14, 0.07)], gapMs: 350 },
  /** a right answer, a completed pose */
  correct: { voices: [v('sine', 523, 0, 0.1, 0.14), v('sine', 659, 0.09, 0.1, 0.14), v('sine', 784, 0.18, 0.1, 0.14), v('sine', 1047, 0.27, 0.34, 0.16), v('triangle', 1319, 0.27, 0.34, 0.05)], gapMs: 300 },
  /** a wrong answer, a pose that was not completed */
  wrong: { voices: [v('sawtooth', 240, 0, 0.26, 0.09, 150), v('square', 160, 0.04, 0.22, 0.04, 110)], gapMs: 300 },
  /** a win: a short fanfare ending in a chord */
  fanfare: {
    voices: [
      v('triangle', 523, 0, 0.12, 0.13),
      v('triangle', 659, 0.12, 0.12, 0.13),
      v('triangle', 784, 0.24, 0.12, 0.13),
      v('triangle', 1047, 0.36, 0.7, 0.14),
      v('sine', 784, 0.36, 0.7, 0.09),
      v('sine', 1319, 0.36, 0.7, 0.07),
      v('sine', 523, 0.36, 0.7, 0.09),
    ],
    noise: [{ at: 0.34, dur: 0.22, gain: 0.04, fromHz: 1800, toHz: 5200 }],
    gapMs: 1500,
    duckMs: 1800,
  },
} as const satisfies Record<string, Cue>;
export type CueName = keyof typeof CUES;

/** What plays a cue: the real Web Audio one in the browser, a recorder in the tests. Times are seconds from now. */
export interface Synth {
  voice(v: Voice): void;
  noise(n: Noise): void;
}

export interface UiSoundsEnv {
  /** The synth, or null while the browser still blocks audio (or has none). */
  synth(): Synth | null;
  /** The player's choice: the speaker button. */
  wanted(): boolean;
  clock(): number;
  duck?(holdMs: number): void;
}

export function createUiSounds(env: UiSoundsEnv) {
  const last = new Map<CueName, number>();

  function play(name: CueName, pitch = 1): boolean {
    if (!env.wanted()) return false;
    const cue: Cue = CUES[name];
    const now = env.clock();
    const prev = last.get(name);
    if (prev !== undefined && now - prev < cue.gapMs) return false;
    const synth = env.synth();
    if (!synth) return false;
    last.set(name, now);
    for (const voice of cue.voices) synth.voice(pitch === 1 ? voice : { ...voice, from: voice.from * pitch, ...(voice.to ? { to: voice.to * pitch } : {}) });
    for (const n of cue.noise ?? []) synth.noise(n);
    if (cue.duckMs) env.duck?.(cue.duckMs);
    return true;
  }

  return {
    play,
    click: () => play('click'),
    select: () => play('select'),
    /** `step` 0…1: a spinner's ticks climb a little in pitch as it slows. */
    tick: (step = 0) => play('tick', 1 + Math.min(1, Math.max(0, step)) * 0.35),
    ding: () => play('ding'),
    whoosh: () => play('whoosh'),
    pop: () => play('pop'),
    join: () => play('join'),
    correct: () => play('correct'),
    wrong: () => play('wrong'),
    fanfare: () => play('fanfare'),
  };
}
export type UiSounds = ReturnType<typeof createUiSounds>;

// ------------------------------------------------------------------------------------------------ the browser side
const GESTURES = ['pointerdown', 'keydown', 'touchend', 'click'] as const;
/** Level of every interface sound together; the cues themselves are already quiet. */
export const UI_SOUND_VOLUME = 0.55;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let armed = false;

function setup(): void {
  if (ctx) return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC({ latencyHint: 'interactive' });
  } catch {
    return;
  }
  master = ctx.createGain();
  master.gain.value = UI_SOUND_VOLUME;
  master.connect(ctx.destination);
  const len = Math.floor(ctx.sampleRate * 0.4);
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
}

function unlock(): void {
  setup();
  if (!ctx) return;
  if (ctx.state !== 'running') ctx.resume().catch(() => undefined); // refused: the next gesture retries
  else disarm();
}
function arm(): void {
  if (armed) return;
  armed = true;
  for (const type of GESTURES) window.addEventListener(type, unlock, { capture: true, passive: true });
}
function disarm(): void {
  if (!armed) return;
  armed = false;
  for (const type of GESTURES) window.removeEventListener(type, unlock, { capture: true });
}

const webSynth: Synth = {
  voice(vc) {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + vc.at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = vc.type;
    osc.frequency.setValueAtTime(vc.from, t0);
    if (vc.to) osc.frequency.exponentialRampToValueAtTime(vc.to, t0 + vc.dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vc.gain, t0 + Math.min(0.012, vc.dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + vc.dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + vc.dur + 0.03);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  },
  noise(n) {
    if (!ctx || !master || !noiseBuffer) return;
    const t0 = ctx.currentTime + n.at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(n.fromHz, t0);
    filter.frequency.exponentialRampToValueAtTime(n.toHz, t0 + n.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(n.gain, t0 + n.dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + n.dur + 0.03);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  },
};

export const uiSound = createUiSounds({
  synth: () => (ctx && ctx.state === 'running' ? webSynth : null),
  wanted: () => music.isEnabled(),
  clock: () => performance.now(),
  duck: (ms) => music.duck(ms),
});

/** Get the interface sounds ready (they start on the first user gesture, the same one that starts the music). */
export function prepareUiSounds(): void {
  arm();
  if (navigator.userActivation?.hasBeenActive) unlock();
}

/** Everything a person can press makes the same small click — one listener for the whole app, never on the typing field. */
const PRESSABLE = 'button, [role="radio"], [role="tab"], summary, a[href]';
export function installClickSounds(): () => void {
  const onDown = (e: PointerEvent) => {
    const el = e.target instanceof Element ? e.target.closest<HTMLElement>(PRESSABLE) : null;
    if (!el || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[data-no-click-sound]')) return;
    if (el.matches('[role="radio"], .tp-opt, .df-card, .fp-team')) uiSound.select();
    else uiSound.click();
  };
  document.addEventListener('pointerdown', onDown, true);
  return () => document.removeEventListener('pointerdown', onDown, true);
}
