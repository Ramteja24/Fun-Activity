import type { TeamId } from '../../../shared/teams';

/**
 * A small badge for each team, drawn in the team's own colour (`--tm`, set by the .tm-<id> class): a shield with chevrons for The
 * Titans, a sound-wave ring for The Vibe Tribe, a keycap with a prompt for Ctrl + Alt + Defeat. Decorative: the team's name is
 * always written beside it.
 */
export function TeamEmblem({ id }: { id: TeamId }) {
  return (
    <svg className="tm-emblem" viewBox="0 0 34 34" aria-hidden>
      <g fill="rgba(var(--tm-rgb), 0.16)" stroke="var(--tm)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        {id === 'titans' && (
          <>
            <path d="M17 3 L30 8 V18 C30 25 24 30 17 33 C10 30 4 25 4 18 V8 Z" />
            <path d="M11 20 L17 14 L23 20 M11 26 L17 20 L23 26" fill="none" />
          </>
        )}
        {id === 'vibe' && (
          <>
            <circle cx="17" cy="17" r="13.5" />
            <path d="M6.5 17 H10 L12.5 9.5 L17 24.5 L20 12.5 L22 17 H27.5" fill="none" />
          </>
        )}
        {id === 'ctrl' && (
          <>
            <rect x="3.5" y="5" width="27" height="24" rx="6" />
            <path d="M10 13 L15 17 L10 21 M18 22 H25" fill="none" />
          </>
        )}
      </g>
    </svg>
  );
}

/** A dashed outline of a car, for a waiting position in a pit bay. */
export function GhostCar() {
  return (
    <svg className="tm-ghost" viewBox="0 0 50 24" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17 C3 13 6 12 9 11 L15 6 C17 4.5 19 4 22 4 H30 C33 4 35 5.2 37 7.5 L40 11 C44 11.6 47 13 47 17 V19 H3 Z" />
        <circle cx="14" cy="19" r="3.6" />
        <circle cx="37" cy="19" r="3.6" />
      </g>
    </svg>
  );
}
