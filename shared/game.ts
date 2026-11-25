import { NAME_MAX, ROOM_CODE_ALPHABET, ROOM_CODE_LEN } from './protocol';

// Pure game rules. Imported by the server (authoritative) and the client (prediction/preview only).

/** Standard typing maths: 5 characters = 1 word. Verified against the reel: 150 chars in 31.4 s = 57 WPM. */
export function calcWpm(chars: number, ms: number): number {
  if (chars <= 0 || ms <= 0) return 0;
  return chars / 5 / (ms / 60000);
}

/** Correct keystrokes ÷ all keystrokes, 0–100. */
export function calcAccuracy(correct: number, wrong: number): number {
  const total = correct + wrong;
  if (total === 0) return 100;
  return (correct / total) * 100;
}

/**
 * Global score. The reel shows +643 for 57 WPM / 93 % accuracy; the original formula is not visible,
 * so this one is defined here (and reproduces +643 for that sample): 10 per WPM + 0.75 per accuracy point,
 * scaled by the share of the passage completed so DNFs score proportionally.
 */
export function calcScore(wpm: number, accuracy: number, progress: number): number {
  return Math.round((wpm * 10 + accuracy * 0.75) * progress);
}

/** Room-championship trophies. 1st = 25 is taken from the reel; the rest are defined here. */
export function trophiesFor(rank: number, finished: boolean): number {
  if (!finished) return 0;
  if (rank === 1) return 25;
  if (rank === 2) return 15;
  if (rank === 3) return 10;
  return 5;
}

export const LIVE_WPM_WINDOW_MS = 4000;
const LIVE_WPM_MIN_WINDOW_MS = 1500;

/**
 * Live (rolling-window) WPM — in the reel the HUD number swings between ~30 and ~90, so it is a short window,
 * not a whole-race average. `times` = ascending timestamps of correct keystrokes.
 */
export function liveWpm(times: readonly number[], now: number, goAt: number): number {
  const from = now - LIVE_WPM_WINDOW_MS;
  let n = 0;
  for (let i = times.length - 1; i >= 0 && times[i] >= from; i--) n++;
  if (n === 0) return 0;
  const elapsed = Math.max(0, now - goAt);
  const win = Math.min(LIVE_WPM_WINDOW_MS, Math.max(LIVE_WPM_MIN_WINDOW_MS, elapsed));
  return n / 5 / (win / 60000);
}

export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX).trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function normalizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== ROOM_CODE_LEN) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** Ordinal for display: 1 → "1st". */
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function formatTime(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
