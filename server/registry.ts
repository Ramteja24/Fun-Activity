import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LEN } from '../shared/protocol';
import type { RoomConfig } from './config';
import { Room } from './room';

export class RoomRegistry {
  readonly rooms = new Map<string, Room>();
  private sweeper: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly cfg: RoomConfig,
    private readonly log: (line: string) => void = () => {},
  ) {}

  create(): Room | null {
    if (this.rooms.size >= this.cfg.maxRooms) return null;
    let code = '';
    do {
      code = '';
      for (let i = 0; i < ROOM_CODE_LEN; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
    } while (this.rooms.has(code));
    const room = new Room(code, this.cfg);
    this.rooms.set(code, room);
    this.log(`room ${code} created (${this.rooms.size} open)`);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  sweep(): void {
    for (const [code, room] of this.rooms) {
      if (room.sweep()) {
        room.dispose();
        this.rooms.delete(code);
        this.log(`room ${code} closed (${this.rooms.size} open)`);
      }
    }
  }

  startSweeper(everyMs = 15_000): void {
    this.sweeper = setInterval(() => this.sweep(), everyMs);
    this.sweeper.unref?.();
  }

  stop(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
  }
}
