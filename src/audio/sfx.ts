import { socket } from '../store';
import { createCountdownAudio, type CueSound, type Stage } from './countdown-audio';
import { music } from './music';

// The browser side of the race-start sounds: one Web Audio context for the whole app (created on the first user gesture,
// like the music), two short WAV cues decoded once, and cues played on the audio hardware clock. The pure scheduling
// lives in countdown-audio.ts.

const FILES = {
  beep: '/sfx/countdown-beep.wav',
  go: '/sfx/countdown-go.wav',
} as const;
type File = keyof typeof FILES;

/**
 * Level of the effects: the WAVs peak at −1 dBFS and this brings them to about −8…−10 dBFS peaks (−16 dBFS RMS for a beep,
 * −11 for GO) at the output — measured in a browser: about 12 dB above the music at its normal level (−28 dBFS) and 20 dB
 * above it while it is lowered for them. Raise or lower this one number to taste.
 */
export const SFX_VOLUME = 0.45;

/** 3 · 2 · 1 are one beep at rising pitch (+0, +2, +4 semitones); GO is its own, fuller sound. */
const CUES: Record<Stage, { file: File; rate: number }> = {
  3: { file: 'beep', rate: 1 },
  2: { file: 'beep', rate: 1.122 },
  1: { file: 'beep', rate: 1.26 },
  0: { file: 'go', rate: 1 },
};

const GESTURES = ['pointerdown', 'keydown', 'touchend', 'click'] as const;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let loading = false;
let armed = false;
const buffers: Partial<Record<File, AudioBuffer>> = {};
const listeners = new Set<() => void>();
const notify = () => {
  for (const fn of [...listeners]) fn();
};

const ready = () => ctx !== null && ctx.state === 'running' && buffers.beep !== undefined && buffers.go !== undefined;

async function load(context: AudioContext): Promise<void> {
  if (loading) return;
  loading = true;
  try {
    await Promise.all(
      (Object.keys(FILES) as File[]).map(async (name) => {
        const res = await fetch(FILES[name]);
        if (!res.ok) throw new Error(`${FILES[name]}: ${res.status}`);
        buffers[name] = await context.decodeAudioData(await res.arrayBuffer());
      }),
    );
  } catch (err) {
    loading = false; // the next screen change or gesture tries again
    console.warn('Countdown sounds could not be loaded; the countdown stays silent.', err);
    return;
  }
  notify();
}

/** Create the context (it only starts when a user gesture allows it) and start loading the cues. */
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
  master.gain.value = SFX_VOLUME;
  master.connect(ctx.destination);
  ctx.addEventListener('statechange', () => {
    if (ctx?.state === 'running') disarm();
    notify();
  });
  void load(ctx);
}

function unlock(): void {
  setup();
  if (!ctx) return;
  if (ctx.state !== 'running') ctx.resume().then(notify, () => undefined); // refused: the next gesture retries
  else disarm();
  if (!buffers.beep || !buffers.go) void load(ctx);
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

function play(stage: Stage, inMs: number): CueSound | null {
  if (!ctx || !master || !ready()) return null;
  const { file, rate } = CUES[stage];
  const source = ctx.createBufferSource();
  source.buffer = buffers[file]!;
  source.playbackRate.value = rate;
  source.connect(master);
  source.start(ctx.currentTime + Math.max(0, inMs) / 1000);
  return {
    stop() {
      try {
        source.stop();
      } catch {
        /* never started or already ended */
      }
      source.disconnect();
    },
  };
}

export const countdownAudio = createCountdownAudio({
  now: () => socket.serverNow(),
  play,
  wanted: () => music.isEnabled(),
  duck: (holdMs) => music.duck(holdMs),
  unduck: () => music.unduck(),
  onChange(fn) {
    listeners.add(fn);
    const offMusic = music.subscribe(fn);
    return () => {
      listeners.delete(fn);
      offMusic();
    };
  },
});

/**
 * Get the effects ready: called when the player is in the lobby or on the race screen, i.e. well before a race starts.
 * With a gesture already behind them (they clicked Host, Join or Start) the context starts at once; otherwise it starts on
 * the first gesture, the same one that starts the music.
 */
export function prepareSfx(): void {
  arm();
  if (navigator.userActivation?.hasBeenActive) unlock();
}
