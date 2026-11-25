// TypeDrive difficulty levels: shared metadata and validation used by both server and client.

export type Difficulty = 'easy' | 'medium' | 'hard';

export const DEFAULT_DIFFICULTY: Difficulty = 'medium';

export interface DifficultyDef {
  id: Difficulty;
  /** Full level name displayed on cards, lobby, and HUD ("Easy Typing", "Medium Typing", "Hard Typing"). */
  name: string;
  /** Compact label ("Easy", "Medium", "Hard"). */
  short: string;
  /** Tier tag shown on selection cards. */
  tier: string;
  /** Speed-meter intensity bars (1..3). */
  bars: 1 | 2 | 3;
  /** Short player-facing description explaining what makes this level distinct. */
  description: string;
  /** Quick characteristic chips shown on the selection card. */
  highlights: readonly string[];
}

export const DIFFICULTIES: readonly DifficultyDef[] = [
  {
    id: 'easy',
    name: 'Easy Typing',
    short: 'Easy',
    tier: 'Level 1 · Beginner',
    bars: 1,
    description: 'Simple words, short sentences, and easy vocabulary. Suitable for beginners.',
    highlights: ['Simple words', 'Short sentences', 'Easy vocabulary'],
  },
  {
    id: 'medium',
    name: 'Medium Typing',
    short: 'Medium',
    tier: 'Level 2 · Standard',
    bars: 2,
    description: 'Medium-length sentences with varied vocabulary, punctuation, and moderately challenging words.',
    highlights: ['Varied vocabulary', 'Punctuation', 'Medium sentences'],
  },
  {
    id: 'hard',
    name: 'Hard Typing',
    short: 'Hard',
    tier: 'Level 3 · Pro',
    bars: 3,
    description: 'Longer passages with complex vocabulary, numbers, punctuation, and special characters.',
    highlights: ['Complex vocabulary', 'Numbers & symbols', 'Longer passages'],
  },
];

export const DIFFICULTY_IDS: readonly Difficulty[] = DIFFICULTIES.map((d) => d.id);

export const isDifficulty = (x: unknown): x is Difficulty =>
  typeof x === 'string' && (DIFFICULTY_IDS as readonly string[]).includes(x);

export const difficultyDef = (id: Difficulty): DifficultyDef =>
  DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[1]!;

export const difficultyName = (id: Difficulty): string => difficultyDef(id).name;
