// Playing Cards — find the joker. Five rounds; each round the cards are shown face up (the joker visible), turned face down and
// shuffled — fast — on every screen at once, timed from the server's clock. Then every participant taps the card they think the
// joker is under. The host (an organiser, not a player) shows the joker, reveals the answer and moves on.
//
// Scoring, decided here and recorded once per round: only the FIRST correct pick counts — the earliest on the server's clock
// (picks are kept in the order they arrived, so equal timestamps go to whoever arrived first). That player's team gets
// CARDS_POINTS; everyone else, and every team when nobody found the joker, gets 0.
//
// The swap list is sent to every screen when the shuffle starts — the screens need it to animate the same shuffle — so a client
// could work out where the joker ends up. That is the game itself (following the card), not a leak worth hiding.
import { CARDS_PER_ROUND, CARDS_POINTS, CARDS_PREVIEW_MS, CARDS_ROUNDS, CARDS_SHUFFLE_LEAD_MS, CARDS_SWAP_MS, CARDS_SWAPS } from '../../shared/activities';
import { finalPosition } from '../../shared/cards';
import type { CardsInfo, CardsReveal, CardsStage } from '../../shared/protocol';
import { TEAM_IDS, zeroPoints, type TeamId } from '../../shared/teams';
import type { Eligible, Rand } from './shared';

export { finalPosition };
export type Swap = [number, number];

/** `count` swaps of two different positions among `cards`; never the same pair twice in a row (that would look like a stall). */
export function makeSwaps(cards: number, count: number, rand: Rand): Swap[] {
  const swaps: Swap[] = [];
  for (let i = 0; i < count; i++) {
    let a = 0;
    let b = 0;
    for (let tries = 0; tries < 20; tries++) {
      a = Math.floor(rand() * cards);
      b = Math.floor(rand() * (cards - 1));
      if (b >= a) b += 1;
      const prev = swaps[swaps.length - 1];
      if (!prev || !((prev[0] === a && prev[1] === b) || (prev[0] === b && prev[1] === a))) break;
    }
    swaps.push(a < b ? [a, b] : [b, a]);
  }
  return swaps;
}

export interface CardsEnv {
  clock(): number;
  rand: Rand;
  /** Connected participants who picked a team (never the host). */
  eligible(): Eligible[];
  /** The state changed: tell everyone now. */
  changed(): void;
  /** Someone picked: tell everyone soon (picks come in bursts, so the room batches these). */
  picked(): void;
}

interface Pick {
  card: number;
  at: number;
  name: string;
  team: TeamId;
}

export class CardsSession {
  private stage: CardsStage = 'ready';
  private round = 1;
  private start = 0;
  private swaps: Swap[] = [];
  private previewEndsAt = 0;
  private startsAt = 0;
  private picks = new Map<string, Pick>();
  private reveal: CardsReveal | undefined;
  private readonly history: { round: number; gained: Record<TeamId, number> }[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly env: CardsEnv,
    readonly id: number,
    readonly rounds = CARDS_ROUNDS,
  ) {
    this.setUp();
  }

  private get cards(): number {
    return CARDS_PER_ROUND[this.round - 1] ?? CARDS_PER_ROUND[CARDS_PER_ROUND.length - 1]!;
  }
  private get swapMs(): number {
    return CARDS_SWAP_MS[this.round - 1] ?? CARDS_SWAP_MS[CARDS_SWAP_MS.length - 1]!;
  }

  /** A fresh round: the cards face down, the joker somewhere, the shuffle decided (and kept here until it starts). */
  private setUp(): void {
    this.stage = 'ready';
    this.start = Math.floor(this.env.rand() * this.cards);
    this.swaps = makeSwaps(this.cards, CARDS_SWAPS[this.round - 1] ?? CARDS_SWAPS[CARDS_SWAPS.length - 1]!, this.env.rand);
    this.picks = new Map();
    this.reveal = undefined;
    this.previewEndsAt = 0;
    this.startsAt = 0;
  }

  /** Host: turn the cards face up so everyone sees the joker; the shuffle follows by itself. */
  show(): boolean {
    if (this.stage !== 'ready') return false;
    this.stage = 'preview';
    this.previewEndsAt = this.env.clock() + CARDS_PREVIEW_MS;
    this.later(CARDS_PREVIEW_MS, () => this.beginShuffle());
    return true;
  }

  private beginShuffle(): void {
    if (this.stage !== 'preview') return;
    this.stage = 'shuffle';
    this.startsAt = this.env.clock() + CARDS_SHUFFLE_LEAD_MS;
    this.later(CARDS_SHUFFLE_LEAD_MS + this.swaps.length * this.swapMs, () => this.openPicks());
    this.env.changed();
  }

  private openPicks(): void {
    if (this.stage !== 'shuffle') return;
    this.stage = 'pick';
    this.env.changed();
  }

  /** A participant's pick: only while picking, for this round, a real position, one per player and final. */
  pick(player: Eligible, round: number, card: number): boolean {
    if (this.stage !== 'pick' || round !== this.round) return false;
    if (!Number.isInteger(card) || card < 0 || card >= this.cards) return false;
    if (this.picks.has(player.id)) return false;
    this.picks.set(player.id, { card, at: this.env.clock(), name: player.name, team: player.team });
    this.env.picked();
    return true;
  }

  /** Host: turn every card over and score the round — once. */
  revealNow(): boolean {
    if (this.stage !== 'pick') return false;
    const joker = finalPosition(this.start, this.swaps);
    const picks = Array.from({ length: this.cards }, () => 0);
    let first: { id: string; at: number } | null = null;
    for (const [id, p] of this.picks) {
      picks[p.card] = (picks[p.card] ?? 0) + 1;
      if (p.card === joker && (!first || p.at < first.at)) first = { id, at: p.at };
    }
    const gained = zeroPoints();
    const winner = first ? { id: first.id, ...this.picks.get(first.id)! } : null;
    if (winner) gained[winner.team] += CARDS_POINTS;
    this.reveal = { joker, picks, gained, ...(winner ? { first: { id: winner.id, name: winner.name, team: winner.team } } : {}) };
    this.history.push({ round: this.round, gained });
    this.stage = 'reveal';
    return true;
  }

  /** Host: the next round — or, after the last, the end of the session. */
  next(): boolean {
    if (this.stage !== 'reveal') return false;
    if (this.round >= this.rounds) {
      this.stage = 'over';
      return true;
    }
    this.round += 1;
    this.setUp();
    return true;
  }

  get over(): boolean {
    return this.stage === 'over';
  }

  scores(): Record<TeamId, number> {
    const s = zeroPoints();
    for (const h of this.history) for (const t of TEAM_IDS) s[t] += h.gained[t];
    return s;
  }

  info(): CardsInfo {
    const shown = this.stage !== 'ready' && this.stage !== 'over';
    const shuffled = this.stage === 'shuffle' || this.stage === 'pick' || this.stage === 'reveal';
    const here = new Set(this.env.eligible().map((e) => e.id));
    for (const id of this.picks.keys()) here.add(id);
    return {
      session: this.id,
      stage: this.stage,
      rounds: this.rounds,
      round: this.round,
      cards: this.cards,
      ...(shown ? { start: this.start, previewEndsAt: this.previewEndsAt } : {}),
      ...(shuffled ? { swaps: this.swaps.map(([a, b]) => [a, b] as Swap), startsAt: this.startsAt } : {}),
      swapMs: this.swapMs,
      eligible: here.size,
      picked: this.picks.size,
      ...(this.reveal ? { reveal: this.reveal } : {}),
      scores: this.scores(),
      history: this.history,
    };
  }

  private later(ms: number, fn: () => void): void {
    this.clear();
    this.timer = setTimeout(() => {
      this.timer = null;
      fn();
    }, ms);
    this.timer.unref?.();
  }
  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  dispose(): void {
    this.clear();
  }
}
