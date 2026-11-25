// Tech Trivia. Five multiple-choice questions, one at a time; every participant answers on their own screen; the server times
// the question, scores it and shows the right answer. The host (an organiser, not a player) starts the quiz and moves it on.
//
// Scoring, decided here and recorded once per question: only the FIRST correct answer counts — the earliest on the server's clock
// (answers are kept in the order they arrived, so equal timestamps go to whoever arrived first). That player's team gets
// TRIVIA_POINTS; everyone else, and every team when nobody got it right, gets 0.
// The right answer never leaves the server until the question is revealed.
import { TRIVIA_LIMIT_MS, TRIVIA_POINTS, TRIVIA_QUESTIONS } from '../../shared/activities';
import type { TriviaInfo, TriviaReveal, TriviaStage, TriviaTop } from '../../shared/protocol';
import { TEAM_IDS, zeroPoints, type TeamId } from '../../shared/teams';
import { TRIVIA_BANK, type TriviaItem } from '../data/trivia-bank';
import { shuffle, type Eligible } from './shared';

type Rand = () => number;

export interface TriviaEnv {
  clock(): number;
  rand: Rand;
  /** Connected participants who picked a team (never the host). */
  eligible(): Eligible[];
  /** Questions used in earlier quizzes of this room (a new quiz avoids them until the bank would run short). */
  used: Set<string>;
  /** The state changed: tell everyone now. */
  changed(): void;
  /** Someone answered: tell everyone soon (answers come in bursts, so the room batches these). */
  answered(): void;
}

/** `n` questions from `n` different categories, never one used before (the used list resets when the bank would run short). */
export function pickQuestions(n: number, used: Set<string>, rand: Rand, bank: readonly TriviaItem[] = TRIVIA_BANK): TriviaItem[] {
  const categoriesWithFresh = () => new Set(bank.filter((q) => !used.has(q.id)).map((q) => q.category)).size;
  if (categoriesWithFresh() < n) used.clear();
  const byCategory = new Map<string, TriviaItem[]>();
  for (const q of bank.filter((q) => !used.has(q.id))) byCategory.set(q.category, [...(byCategory.get(q.category) ?? []), q]);
  const picked = shuffle([...byCategory.keys()], rand)
    .slice(0, n)
    .map((cat) => {
      const list = byCategory.get(cat)!;
      return list[Math.floor(rand() * list.length)]!;
    });
  for (const q of picked) used.add(q.id);
  return shuffle(picked, rand);
}

interface Answer {
  choice: number;
  at: number;
}

export class TriviaSession {
  private stage: TriviaStage = 'question';
  private index = 0;
  private endsAt = 0;
  private answers = new Map<string, Answer>();
  private eligible = new Map<string, Eligible>();
  private reveal: TriviaReveal | undefined;
  private readonly questions: TriviaItem[];
  private readonly history: { index: number; gained: Record<TeamId, number> }[] = [];
  private readonly totals = new Map<string, TriviaTop>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    private readonly env: TriviaEnv,
    readonly id: number,
    readonly total: number,
  ) {
    this.questions = pickQuestions(total, env.used, env.rand);
  }

  /** A new quiz with question 1 open, or null when nobody eligible is here to play. */
  static create(env: TriviaEnv, id: number, total = TRIVIA_QUESTIONS): TriviaSession | null {
    if (env.eligible().length === 0) return null;
    const s = new TriviaSession(env, id, total);
    s.open();
    return s;
  }

  private get q(): TriviaItem {
    return this.questions[this.index]!;
  }

  private open(): void {
    this.stage = 'question';
    this.answers = new Map();
    this.eligible = new Map(this.env.eligible().map((e) => [e.id, e]));
    this.reveal = undefined;
    this.endsAt = this.env.clock() + TRIVIA_LIMIT_MS;
    this.clear();
    this.timer = setTimeout(() => void this.revealNow(), TRIVIA_LIMIT_MS);
    this.timer.unref?.();
  }

  /** A participant's answer: one per question, final, only from someone who was in the room when it opened. */
  answer(playerId: string, q: number, choice: number): boolean {
    if (this.stage !== 'question' || q !== this.index) return false;
    if (!Number.isInteger(choice) || choice < 0 || choice >= this.q.options.length) return false;
    if (!this.eligible.has(playerId) || this.answers.has(playerId)) return false;
    this.answers.set(playerId, { choice, at: this.env.clock() });
    if (this.answers.size >= this.eligible.size) {
      this.revealNow(); // everyone has answered: no need to wait out the clock
    } else {
      this.env.answered();
    }
    return true;
  }

  /** Close the question (the clock ran out, everyone answered, or the host pressed Reveal): score it — once — and show the answer. */
  revealNow(): boolean {
    if (this.stage !== 'question') return false;
    this.clear();
    const q = this.q;
    const gained = zeroPoints();
    const tally = Object.fromEntries(TEAM_IDS.map((t) => [t, { correct: 0, eligible: 0 }])) as Record<TeamId, { correct: number; eligible: number }>;
    const picks = q.options.map(() => 0);
    // the first correct answer: earliest timestamp; the map keeps arrival order, so a tie goes to whoever arrived first
    let first: { id: string; at: number } | null = null;
    for (const [id, a] of this.answers) {
      if (a.choice === q.correct && this.eligible.has(id) && (!first || a.at < first.at)) first = { id, at: a.at };
    }
    for (const e of this.eligible.values()) {
      const a = this.answers.get(e.id);
      tally[e.team].eligible += 1;
      if (a) picks[a.choice] = (picks[a.choice] ?? 0) + 1;
      const right = !!a && a.choice === q.correct;
      const points = first?.id === e.id ? TRIVIA_POINTS : 0;
      if (right) tally[e.team].correct += 1;
      gained[e.team] += points;
      const t = this.totals.get(e.id) ?? { id: e.id, name: e.name, team: e.team, points: 0, correct: 0 };
      t.points += points;
      t.correct += right ? 1 : 0;
      this.totals.set(e.id, t);
    }
    const winner = first ? this.eligible.get(first.id)! : null;
    this.reveal = {
      correct: q.correct,
      explanation: q.explanation,
      gained,
      tally,
      picks,
      ...(winner ? { first: { id: winner.id, name: winner.name, team: winner.team } } : {}),
    };
    this.history.push({ index: this.index, gained });
    this.stage = 'reveal';
    this.env.changed();
    return true;
  }

  /** Host: the next question — or, after the last, the end of the quiz. */
  next(): boolean {
    if (this.stage !== 'reveal') return false;
    if (this.index + 1 >= this.total) {
      this.stage = 'over';
    } else {
      this.index += 1;
      this.open();
    }
    this.env.changed();
    return true;
  }

  get over(): boolean {
    return this.stage === 'over';
  }
  get stageNow(): TriviaStage {
    return this.stage;
  }

  scores(): Record<TeamId, number> {
    const s = zeroPoints();
    for (const h of this.history) for (const t of TEAM_IDS) s[t] += h.gained[t];
    return s;
  }

  info(): TriviaInfo {
    const q = this.q;
    const answeredByTeam = Object.fromEntries(TEAM_IDS.map((t) => [t, { answered: 0, eligible: 0 }])) as Record<TeamId, { answered: number; eligible: number }>;
    for (const e of this.eligible.values()) {
      answeredByTeam[e.team].eligible += 1;
      if (this.answers.has(e.id)) answeredByTeam[e.team].answered += 1;
    }
    const top = [...this.totals.values()].sort((a, b) => b.points - a.points || b.correct - a.correct || a.name.localeCompare(b.name)).slice(0, 5);
    return {
      session: this.id,
      stage: this.stage,
      total: this.total,
      index: this.index,
      question: { text: q.text, options: [...q.options], category: q.category },
      limitMs: TRIVIA_LIMIT_MS,
      endsAt: this.endsAt,
      eligible: this.eligible.size,
      answered: this.answers.size,
      answeredByTeam,
      ...(this.reveal ? { reveal: this.reveal } : {}),
      scores: this.scores(),
      history: this.history,
      ...(this.stage === 'over' ? { top } : {}),
    };
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  dispose(): void {
    this.clear();
  }
}
