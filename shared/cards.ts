// Playing Cards: the one rule both the server (scoring) and the screens (the shuffle animation) follow.

/**
 * One step of the shuffle: [a, b] swaps the cards at positions a and b; [a, b, c, d] swaps a↔b and c↔d at the same moment
 * (two pairs move at once — harder to follow). The pairs in one step never share a position.
 */
export type ShuffleStep = readonly number[];

/** The pairs a step swaps: [[a, b]] or [[a, b], [c, d]]. */
export function pairsOf(step: ShuffleStep): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i + 1 < step.length; i += 2) pairs.push([step[i]!, step[i + 1]!]);
  return pairs;
}

/** Where a card that starts at `start` is after the steps (each pair in a step exchanges the cards at two positions). */
export function finalPosition(start: number, steps: readonly ShuffleStep[]): number {
  let at = start;
  for (const step of steps) {
    for (const [a, b] of pairsOf(step)) {
      if (at === a) {
        at = b;
        break; // the pairs of one step are disjoint: a card moves at most once per step
      }
      if (at === b) {
        at = a;
        break;
      }
    }
  }
  return at;
}
