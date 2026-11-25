// The dashboard's headline, plus re-exports still used by TypeDrive's own screens.

export { RacingWordmark } from '../landing/RacingWordmark';

/** "Weekly Fun Activity": the dashboard's plain level-one heading. */
export function PlatformTitle() {
  return <h1 className="ph-h1">Weekly Fun Activity</h1>;
}

/** Thin speed lines that sweep behind a line of a headline (TypeDrive's lobby and the games' landing pages). */
export function WordmarkStreaks() {
  return (
    <span className="wm-streaks" aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}
