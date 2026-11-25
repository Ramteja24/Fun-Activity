// Playing Cards: the one rule both the server (scoring) and the screens (the shuffle animation) follow.

/** Where a card that starts at `start` is after the swaps (each swap exchanges the cards at two positions). */
export function finalPosition(start: number, swaps: readonly (readonly [number, number])[]): number {
  let at = start;
  for (const [a, b] of swaps) {
    if (at === a) at = b;
    else if (at === b) at = a;
  }
  return at;
}
