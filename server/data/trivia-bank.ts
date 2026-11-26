export type TriviaCategory =
  | 'Python'
  | 'AI'
  | 'SQL'
  | 'Git'
  | 'Cloud'
  | 'Software';

export interface TriviaItem {
  id: string;
  category: TriviaCategory;
  text: string;
  options: readonly [string, string, string, string];
  correct: 0 | 1 | 2 | 3;
  explanation: string;
}

export interface CodingItem {
  id: string;
  category: 'Python';
  difficulty: 'Medium';
  text: string;
  exampleInput: string;
  exampleOutput: string;
  starterCode: string;
  solution: string;
  explanation: string;
  timeLimit: number;
}

// ==========================================
// PYTHON CODING CHALLENGES
// Server-side only
// ==========================================

export const CODING_BANK: readonly CodingItem[] = [
  {
    id: 'py-longest-substring',
    category: 'Python',
    difficulty: 'Medium',
    text: 'Find the length of the longest substring without repeating characters. Try to solve it in O(n) time.',
    exampleInput: '"abcabcbb"',
    exampleOutput: '3',
    starterCode: 'def longest_substring(s):\n    pass',
    solution: `def longest_substring(s):
    seen, left, best = {}, 0, 0
    for right, ch in enumerate(s):
        left = max(left, seen.get(ch, -1) + 1)
        seen[ch] = right
        best = max(best, right - left + 1)
    return best`,
    explanation: 'Use a sliding window and track the last position of each character.',
    timeLimit: 90,
  },
  {
    id: 'py-group-anagrams',
    category: 'Python',
    difficulty: 'Medium',
    text: 'Group words that are anagrams of each other. The order of the groups does not matter.',
    exampleInput: '["eat", "tea", "tan", "ate", "nat", "bat"]',
    exampleOutput: '[["eat", "tea", "ate"], ["tan", "nat"], ["bat"]]',
    starterCode: 'def group_anagrams(words):\n    pass',
    solution: `def group_anagrams(words):
    groups = {}
    for word in words:
        key = "".join(sorted(word))
        groups.setdefault(key, []).append(word)
    return list(groups.values())`,
    explanation: 'Anagrams share the same sorted character sequence, which can be used as a dictionary key.',
    timeLimit: 90,
  },
  {
    id: 'py-product-except-self',
    category: 'Python',
    difficulty: 'Medium',
    text: 'Return an array where each element is the product of all other elements. Do not use division. Solve in O(n) time.',
    exampleInput: '[1, 2, 3, 4]',
    exampleOutput: '[24, 12, 8, 6]',
    starterCode: 'def product_except_self(nums):\n    pass',
    solution: `def product_except_self(nums):
    result, left, right = [1] * len(nums), 1, 1
    for i in range(len(nums)):
        result[i] *= left; left *= nums[i]
        j = len(nums) - 1 - i
        result[j] *= right; right *= nums[j]
    return result`,
    explanation: 'Combine prefix and suffix products without using division.',
    timeLimit: 120,
  },
  {
    id: 'py-merge-intervals',
    category: 'Python',
    difficulty: 'Medium',
    text: 'Merge all overlapping intervals and return the resulting non-overlapping intervals.',
    exampleInput: '[[1,3], [2,6], [8,10], [9,12]]',
    exampleOutput: '[[1,6], [8,12]]',
    starterCode: 'def merge_intervals(intervals):\n    pass',
    solution: `def merge_intervals(intervals):
    result = []
    for start, end in sorted(intervals):
        if result and start <= result[-1][1]:
            result[-1][1] = max(result[-1][1], end)
        else: result.append([start, end])
    return result`,
    explanation: 'Sort intervals by starting position and merge whenever the current interval overlaps the previous one.',
    timeLimit: 90,
  },
];

// ==========================================
// ADVANCED TECHNICAL MCQs
// ==========================================

export const TRIVIA_BANK: readonly TriviaItem[] = [

  // PYTHON — the question, a blank line, then the code (shown as a code block with its line breaks)

  {
    id: 'py-finally-return',
    category: 'Python',
    text: `What does this print?

def check():
    try:
        return 'try'
    finally:
        return 'finally'
print(check())`,
    options: [
      'try',
      'finally',
      'try, then finally',
      'SyntaxError',
    ],
    correct: 1,
    explanation: 'A finally block always runs, even after a return. A return inside finally replaces the value the try block was returning.',
  },
  {
    id: 'py-generator-used-up',
    category: 'Python',
    text: `What does this print?

squares = (n * n for n in range(4))
total = sum(squares)
count = len(list(squares))
print(total, count)`,
    options: [
      '14 4',
      '0 0',
      '14 0',
      'TypeError',
    ],
    correct: 2,
    explanation: 'The parentheses make a generator, which can only be read once. sum() uses it up (0 + 1 + 4 + 9 = 14), so list(squares) is empty and its length is 0.',
  },

  // SQL — the question, a blank line, then the query

  {
    id: 'sql-left-join-where',
    category: 'SQL',
    text: `The customers table has three people: Rahul, Priya and Arjun. The orders table has three orders: Rahul spent 150, Rahul spent 50 and Priya spent 80. Arjun has no orders. How many rows does this query return?

SELECT c.name, o.amount
FROM customers c
LEFT JOIN orders o
  ON o.customer_id = c.id
WHERE o.amount > 100;`,
    options: [
      '3',
      '4',
      '2',
      '1',
    ],
    correct: 3,
    explanation: 'The WHERE clause runs after the join and drops every row whose amount is NULL or not over 100, so the LEFT JOIN behaves like an INNER JOIN. Only Rahul’s 150 order is left. Put the condition in the ON clause to keep every customer.',
  },
  {
    id: 'sql-rank-ties',
    category: 'SQL',
    text: `The players table has four scores: Rahul 90, Priya 90, Arjun 80 and Meera 70. This query ranks them from the highest score down. What player_rank does Arjun get?

SELECT name, score,
  RANK() OVER (ORDER BY score DESC) AS player_rank
FROM players
ORDER BY player_rank;`,
    options: [
      '3',
      '2',
      '1',
      '4',
    ],
    correct: 0,
    explanation: 'Rahul and Priya tie on 90 and both get rank 1. RANK() then skips a number, so Arjun gets 3 (and Meera 4). DENSE_RANK() would give Arjun 2.',
  },

  // AI

  {
    id: 'ai-embedding-mismatch',
    category: 'AI',
    text: 'A team upgrades to a newer embedding model for user queries but keeps the document vectors already stored in the vector database. Search results suddenly look random. What is the cause?',
    options: [
      'The vector database needs more replicas',
      'The top-k value is too small',
      'Queries and documents now come from different embedding models, so their vectors cannot be compared; the documents must be re-embedded',
      'The LLM context window is too short',
    ],
    correct: 2,
    explanation: 'Each embedding model has its own vector space. Similarity between a vector from one model and a vector from another is meaningless, so the stored documents must be re-embedded with the new model.',
  },

];
