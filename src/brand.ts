// The wordmark follows the reel ("TYPEDRIVE" + orange "GAME"). It is someone else's product name:
// change it here (one place) before sharing beyond the team.
/** Lettering on the trackside sponsor boards (landing preview and race screen), repeated in this order. */
export const BOARD_TEXT = ['GANTEC', 'TYPE FAST', 'DRIVE FASTER'] as const;

/** The platform the games live in (the dashboard, the shared header, the browser tab). TypeDrive's own name is BRAND below. */
export const PLATFORM = {
  name: 'GANTEC',
  sub: 'WEEKLY CONNECT',
  title: 'Weekly Fun Activity',
  /** For the browser tab and spoken labels. */
  full: 'Gantec Weekly Connect',
} as const;

/** What kind of game each one is: the small line above its name on the dashboard's game cards. */
export const GAME_KICKER = { typedrive: 'Live multiplayer typing race', pose: 'Team entertainment challenge', cards: 'Visual memory challenge', trivia: 'Technical quiz challenge' } as const;

/** TypeDrive's own logo — only on TypeDrive's screens. */
export const BRAND = {
  first: 'TYPEDRIVE',
  second: 'GAME',
  tagline: 'Typing speed race',
  event: 'Gantec Weekly Connect',
} as const;
