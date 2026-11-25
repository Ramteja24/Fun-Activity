// Background music controller. Pure logic: everything browser-specific (the <audio> element, storage, user-gesture
// events) is passed in, so it can be tested without a DOM. music.ts wires it to the real browser, once.
//
// Rules it enforces:
//  • it only ever plays during a TypeDrive race (setActive): the countdown and the race itself — never on the dashboard, the
//    lobby, the results or the other two games;
//  • one audio element, ever (created on first use, kept for the life of the page — screens come and go, it does not);
//  • a muted player is never played again unprompted: the choice is stored and read back on every page load;
//  • browsers block sound until the user interacts, so a blocked start waits for the first gesture and retries;
//  • volume only ever ramps (never jumps), whether the music starts, is muted or sits under a sound effect (duck);
//  • nothing here touches the game: no sockets, timers of the race, or typing input.

// The soundtrack is the supplied F1 theme from 00:20 to the very end (10:14), mastered to about −14.7 LUFS with a gentle
// dynamics pass so that no stretch drops out (recipe: docs/music-filters.txt). It loops for as long as the player stays.
// The server revalidates /music/ on every load (Last-Modified → 304), so replacing the file in place is picked up at once.
export const MUSIC_SRC = '/music/f1-theme-trimmed.mp3';
/**
 * Playback volume as a share of the audio element's volume. The file is already a loud master (−14.7 LUFS), so 0.12
 * puts it at about −33 LUFS at the output: a quiet bed under the race that never competes with the call.
 */
export const MUSIC_VOLUME = 0.12;
export const MUSIC_PREF_KEY = 'typedrive.music';
export const MUSIC_VOLUME_KEY = 'typedrive.music.volume';
const FADE_IN_MS = 1500;
const FADE_OUT_MS = 400;
const STEP_MS = 30;
/** While the race-start sound effects play the music sits at this share of its level (≈ −9 dB), then eases back. */
export const DUCK_FACTOR = 0.35;
const DUCK_ATTACK_MS = 250;
const DUCK_RELEASE_MS = 1200;

/**
 * off = muted by the player · idle = wanted, but no race is running (nothing plays) · blocked = wanted during a race, but the
 * browser needs a gesture first · error = the file would not play
 */
export type MusicStatus = 'off' | 'idle' | 'blocked' | 'starting' | 'playing' | 'error';
export interface MusicState {
  status: MusicStatus;
  /** What the speaker icon shows: the music is (or is about to be) audible. */
  on: boolean;
}

export interface AudioLike {
  volume: number;
  loop: boolean;
  preload: string;
  src: string;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: 'playing' | 'pause' | 'error', listener: () => void): void;
}

export interface MusicEnv {
  createAudio(): AudioLike;
  storage: { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void };
  /** Calls `fn` for every user gesture (pointer, key, touch); `fromToggle` is true when it hit the speaker button itself. Returns an unsubscribe. */
  onGesture(fn: (fromToggle: boolean) => void): () => void;
  warn?(message: string, error?: unknown): void;
}

const derive = (status: MusicStatus): MusicState => ({ status, on: status === 'playing' || status === 'starting' });
const smooth = (t: number) => t * t * (3 - 2 * t);
const clampVol = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;

export function createMusic(env: MusicEnv) {
  let enabled = readEnabled();
  let volume = readVolume();
  let lastVolume = volume > 0 ? volume : MUSIC_VOLUME;
  let state = derive(enabled ? 'idle' : 'off');
  /** A race is running on this screen: the only time the music plays. */
  let active = false;
  let audio: AudioLike | null = null;
  let ramp: ReturnType<typeof setTimeout> | null = null;
  let unarm: (() => void) | null = null;
  /** 1 normally; DUCK_FACTOR while a sound effect is playing over the music. */
  let duckFactor = 1;
  let duckTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const l of [...listeners]) l();
  }

  function readEnabled(): boolean {
    try {
      return env.storage.get(MUSIC_PREF_KEY) !== 'off';
    } catch {
      return true; // storage unavailable (private mode…): default to on
    }
  }
  function writeEnabled(on: boolean): void {
    try {
      if (on) env.storage.remove(MUSIC_PREF_KEY);
      else env.storage.set(MUSIC_PREF_KEY, 'off');
    } catch {
      /* the choice just won't survive a refresh */
    }
  }
  function readVolume(): number {
    try {
      const raw = env.storage.get(MUSIC_VOLUME_KEY);
      if (raw === null) return MUSIC_VOLUME;
      const n = Number(raw);
      return Number.isFinite(n) ? clampVol(n) : MUSIC_VOLUME;
    } catch {
      return MUSIC_VOLUME;
    }
  }
  function writeVolume(v: number): void {
    try {
      env.storage.set(MUSIC_VOLUME_KEY, String(v));
    } catch {
      /* the choice just won't survive a refresh */
    }
  }

  function setStatus(status: MusicStatus): void {
    if (state.status === status) return;
    state = derive(status);
    notify();
  }

  function ensureAudio(): AudioLike {
    if (audio) return audio;
    const a = env.createAudio();
    a.loop = true;
    a.preload = 'auto';
    a.volume = 0;
    a.src = MUSIC_SRC;
    a.addEventListener('playing', () => {
      if (enabled) setStatus('playing');
    });
    a.addEventListener('pause', () => {
      // paused by the browser/OS (headphones, a call…) mid-race while we wanted sound: wait for the next gesture
      if (enabled && active && state.status === 'playing') {
        setStatus('blocked');
        arm();
      }
    });
    a.addEventListener('error', () => {
      if (!enabled) return;
      env.warn?.('Background music could not be loaded; the game continues without it.');
      setStatus('error');
    });
    audio = a;
    return a;
  }

  /** Move the volume to `target` over `ms`, in small eased steps (so nothing ever jumps). One step at a time, each scheduling the next. */
  function rampTo(target: number, ms: number, done?: () => void): void {
    const a = audio;
    if (!a) return;
    if (ramp) clearTimeout(ramp);
    const from = a.volume;
    const steps = Math.max(1, Math.round(ms / STEP_MS));
    let i = 0;
    const step = () => {
      i += 1;
      a.volume = i >= steps ? target : from + (target - from) * smooth(i / steps);
      if (i >= steps) {
        ramp = null;
        done?.();
        return;
      }
      ramp = setTimeout(step, STEP_MS);
    };
    ramp = setTimeout(step, STEP_MS);
  }

  /** Where the music should be right now: the player's volume, lowered while a sound effect is playing. */
  const level = () => volume * duckFactor;

  function arm(): void {
    if (unarm) return;
    unarm = env.onGesture((fromToggle) => {
      // The speaker button decides for itself (a click on it must not both start and then toggle the music).
      if (fromToggle || !enabled || !active || state.on || state.status === 'error') return;
      void start();
    });
  }
  function disarm(): void {
    unarm?.();
    unarm = null;
  }

  async function start(immediate = false): Promise<void> {
    if (!enabled || !active) return;
    const a = ensureAudio();
    if (state.status === 'error') a.src = MUSIC_SRC; // a failed load only retries when the source is set again
    setStatus('starting');
    try {
      await a.play();
    } catch (err) {
      if (!enabled) return; // muted while the request was pending
      const name = (err as { name?: string } | null)?.name;
      if (name === 'NotAllowedError') {
        setStatus('blocked');
        arm();
      } else {
        env.warn?.('Background music could not start; the game continues without it.', err);
        setStatus('error');
      }
      return;
    }
    if (!enabled || !active) {
      a.pause();
      return;
    }
    setStatus('playing');
    disarm();
    if (immediate) {
      if (ramp) clearTimeout(ramp);
      ramp = null;
      a.volume = level();
    } else {
      rampTo(level(), FADE_IN_MS);
    }
  }

  /** The player turned the music on (a click is a gesture, so the browser allows it). */
  function enable(): void {
    let volRestored = false;
    if (volume === 0) {
      volume = lastVolume > 0 ? lastVolume : MUSIC_VOLUME;
      writeVolume(volume);
      volRestored = true;
    }
    enabled = true;
    writeEnabled(true);
    if (active) {
      arm();
      void start();
    } else {
      setStatus('idle');
    }
    if (volRestored) notify();
  }
  function mute(): void {
    enabled = false;
    writeEnabled(false);
    disarm();
    setStatus('off');
    rampTo(0, FADE_OUT_MS, () => audio?.pause());
  }

  /** Let go of the duck: the music eases back to its level (and stays put if it is muted or not playing). */
  function unduck(): void {
    if (duckTimer) clearTimeout(duckTimer);
    duckTimer = null;
    if (duckFactor === 1) return;
    duckFactor = 1;
    if (audio && state.on) rampTo(level(), DUCK_RELEASE_MS);
  }

  /** Set the playback volume (0..1), persisting it and adjusting the audio element immediately. */
  function setVolume(next: number): void {
    if (!Number.isFinite(next)) return;
    const clamped = clampVol(next);
    if (clamped > 0) lastVolume = clamped;
    const changed = clamped !== volume;
    volume = clamped;
    writeVolume(clamped);

    if (clamped === 0) {
      if (enabled || state.on) {
        mute();
      } else if (changed) {
        notify();
      }
      return;
    }

    if (ramp) {
      clearTimeout(ramp);
      ramp = null;
    }

    if (!enabled) {
      enabled = true;
      writeEnabled(true);
      if (active) {
        arm();
        void start(true);
      } else {
        setStatus('idle');
      }
      if (changed) notify();
      return;
    }

    if (audio && state.status === 'playing') {
      audio.volume = level();
    } else if (state.status === 'blocked') {
      void start(true);
    }
    if (changed) notify();
  }

  return {
    /**
     * A TypeDrive race is (or is no longer) running on this screen. On: the music starts (or waits for the first gesture the
     * browser needs). Off: it fades out and pauses — the player's mute choice and volume are kept for the next race.
     */
    setActive(on: boolean): void {
      if (on === active) return;
      active = on;
      if (on) {
        if (!enabled) return;
        arm();
        void start();
        return;
      }
      disarm();
      if (enabled) setStatus('idle');
      const a = audio;
      if (a) rampTo(0, FADE_OUT_MS, () => !active && a.pause());
    },
    toggle(): void {
      if (state.on) mute();
      else enable();
    },
    enable,
    mute,
    /** Does the player want sound at all (speaker on)? True while autoplay is still blocked; false only once muted. */
    isEnabled: (): boolean => enabled,
    /**
     * Sit under a sound effect: lower the music to DUCK_FACTOR of its level and, whatever happens to the caller, bring it
     * back by itself after `holdMs`. (A caller that forgets, or is torn down mid-effect, can never leave it quiet.)
     */
    duck(holdMs: number): void {
      duckFactor = DUCK_FACTOR;
      if (duckTimer) clearTimeout(duckTimer);
      duckTimer = setTimeout(unduck, Math.max(0, holdMs));
      if (audio && state.on) rampTo(level(), DUCK_ATTACK_MS);
    },
    unduck,
    setVolume,
    getVolume: (): number => volume,
    getState: (): MusicState => state,
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** For tests: stop timers and gesture listeners. */
    dispose(): void {
      if (ramp) clearTimeout(ramp);
      ramp = null;
      if (duckTimer) clearTimeout(duckTimer);
      duckTimer = null;
      disarm();
      listeners.clear();
    },
  };
}

export type Music = ReturnType<typeof createMusic>;
