import { DEFAULT_MAX_PLAYERS } from '../shared/protocol';

export interface RoomConfig {
  /** Delay between "start" and the green light. Must exceed 3 × STAGE_MS so every client sees all of 3-2-1. */
  countdownLeadMs: number;
  /**
   * Hard deadline for a race, measured from GO. This is the ONLY thing that cuts off a racer who is still typing:
   * a win by someone else never shortens it. Passages are up to 350 characters (70 words), so 8 minutes lets
   * anyone who keeps typing at 9 WPM or more finish.
   */
  raceMaxMs: number;
  /**
   * Once somebody has finished, a racer who then makes no keystroke at all for this long stops holding the race open
   * (an AFK player must not stall everyone's results). Anyone who keeps typing is never affected by it.
   */
  idleDnfMs: number;
  /** An unfinished racer offline this long stops holding the race open (and is recorded DNF if the race ends). */
  racerOfflineMs: number;
  /** Offline players are dropped from the lobby after this long. */
  lobbyPruneMs: number;
  /** Rooms with nobody connected for this long are deleted. */
  roomIdleMs: number;
  /** Keystrokes accepted per rolling second per player (600+ WPM — well beyond human). */
  maxKeysPerSecond: number;
  /** Flood guard per socket (a real client sends ≈ 15/s while typing). */
  maxMessagesPerSecond: number;
  /** Players per room. */
  maxPlayers: number;
  maxRooms: number;
}

export const defaultConfig: RoomConfig = {
  countdownLeadMs: 3600,
  raceMaxMs: 480_000,
  idleDnfMs: 45_000,
  racerOfflineMs: 30_000,
  lobbyPruneMs: 60_000,
  roomIdleMs: 30 * 60_000,
  maxKeysPerSecond: 40,
  maxMessagesPerSecond: 120,
  maxPlayers: DEFAULT_MAX_PLAYERS,
  maxRooms: 500,
};
