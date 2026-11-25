import { STAGE_MS } from '../../shared/protocol';

export type CountdownStage = 3 | 2 | 1 | 0 | null;

/**
 * Which stage of the start sequence is showing, from the server clock: 3 until two stages remain, then 2, 1, GO (0) for
 * a second after the green light, then nothing. The visible countdown (`useCountdown`) and its sound
 * (`audio/countdown-audio.ts`) both read this one definition, so they cannot drift apart.
 */
export function countdownStage(goAt: number, now: number, stageMs = STAGE_MS): CountdownStage {
  if (!goAt) return null;
  const remaining = goAt - now;
  if (remaining > stageMs * 2) return 3;
  if (remaining > stageMs) return 2;
  if (remaining > 0) return 1;
  return remaining > -1000 ? 0 : null;
}
