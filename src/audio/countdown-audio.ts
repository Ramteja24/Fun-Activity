// Race-start sound effects: a beep for 3, 2 and 1 and a stronger sound for GO, each exactly when its light shows.
// Pure logic: the audio engine, the clock, the music ducking and "something changed" notifications are passed in, so it
// can be tested without a browser. sfx.ts wires it to the real Web Audio engine, once.
//
// How it stays in sync and never doubles up:
//  • every moment comes from the same server-clock `goAt` that drives the lights (`countdownStage`), so every player's
//    sounds line up with their own screen, and with each other's;
//  • each cue is handed to the audio hardware clock up front (a few seconds ahead), so a busy page, a slow render or a
//    throttled timer can delay nothing — the browser plays it on the sample it was told to;
//  • cues are remembered per race (`key`): re-renders, StrictMode's double effects, a reconnect or a refresh that calls
//    begin() again never schedule a cue twice, and a cue whose moment has already passed is dropped, never played late;
//  • sound never drives the game: nothing here is read by the race, the timer or the engine.
import { STAGE_MS } from '../../shared/protocol';

export type Stage = 3 | 2 | 1 | 0; // 0 = GO
export const STAGES: readonly Stage[] = [3, 2, 1, 0];

/** A cue whose moment is already this far behind is dropped rather than played late. */
export const LATE_GRACE_MS = 150;
/** "3" belongs to the moment the race is announced: a race with at least this long to go is brand new (not a reconnect). */
export const FRESH_MS = 3 * STAGE_MS - 200;
/** The GO sound rings for about this long after the green light; the music stays lowered for it. */
export const GO_TAIL_MS = 900;

/** When (server clock) a stage's cue is due: 3 as soon as a fresh race is announced, then 2, 1, GO on their lights. */
export function cueDueAt(stage: Stage, goAt: number, now: number): number {
  if (stage === 3) return goAt - now >= FRESH_MS ? now : -Infinity;
  return goAt - stage * STAGE_MS;
}

export interface CueSound {
  /** Silence a cue that has not started yet (or cut one short). */
  stop(): void;
}

export interface CountdownAudioEnv {
  /** The server clock, in ms (the one the lights use). */
  now(): number;
  /** Sound a cue `inMs` from now on the audio clock. null = it cannot sound right now (audio locked, still loading). */
  play(stage: Stage, inMs: number): CueSound | null;
  /** Does the player want sound (speaker on)? */
  wanted(): boolean;
  /** Lower the music under the effects for about `holdMs` (it comes back by itself), or bring it back now. */
  duck(holdMs: number): void;
  unduck(): void;
  /** Calls `fn` when anything that decides whether cues can sound changes (audio unlocked or loaded, speaker toggled). */
  onChange(fn: () => void): () => void;
}

export function createCountdownAudio(env: CountdownAudioEnv) {
  let current: { key: string; goAt: number } | null = null;
  const scheduled = new Map<Stage, { due: number; sound: CueSound }>();
  let unsubscribe: (() => void) | null = null;

  /** Silence every cue that has not started; the ones already sounding are left to finish. */
  function stopFuture(): void {
    const now = env.now();
    for (const [stage, cue] of scheduled) {
      if (cue.due > now) {
        cue.sound.stop();
        scheduled.delete(stage);
      }
    }
  }

  /** Schedule every cue that is still due and not yet scheduled. Safe to call any number of times. */
  function schedule(): void {
    if (!current) return;
    if (!env.wanted()) {
      stopFuture();
      env.unduck();
      return;
    }
    const now = env.now();
    let added = false;
    for (const stage of STAGES) {
      if (scheduled.has(stage)) continue;
      const due = cueDueAt(stage, current.goAt, now);
      if (now - due > LATE_GRACE_MS) continue; // its moment has passed
      const sound = env.play(stage, Math.max(0, due - now));
      if (!sound) break; // cannot sound yet: onChange calls us again when it can
      scheduled.set(stage, { due, sound });
      added = true;
    }
    if (added) env.duck(Math.max(0, current.goAt - now) + GO_TAIL_MS);
  }

  function cancel(): void {
    stopFuture();
    unsubscribe?.();
    unsubscribe = null;
    env.unduck();
  }

  return {
    /**
     * The race has been announced (`goAt` is the server-clock time of the green light). Returns the clean-up for the
     * screen that called it. `key` identifies the race; calling again with the same key is a no-op for cues already set.
     */
    begin(key: string, goAt: number): () => void {
      if (current?.key !== key) {
        stopFuture();
        scheduled.clear();
        current = { key, goAt };
      }
      unsubscribe ??= env.onChange(schedule);
      schedule();
      return cancel;
    },
    cancel,
    /** For tests: which cues are scheduled for the current race. */
    scheduledStages: (): Stage[] => STAGES.filter((s) => scheduled.has(s)),
  };
}

export type CountdownAudio = ReturnType<typeof createCountdownAudio>;
