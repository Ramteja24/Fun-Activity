import { useEffect } from 'react';
import { rankTeams, teamName, TEAMS, type TeamId } from '../../../shared/teams';
import { uiSound } from '../../audio/ui-sounds';
import { Confetti } from '../Confetti';
import { Podium, type PodiumEntry } from './Podium';

/**
 * The three teams on a podium, with confetti and a fanfare when it appears — the winner announcement of a game. It only draws
 * the ranking the server already computed (`rankTeams` is the same function it uses); a tie is shown as a tie (equal ranks).
 * Nothing is shown when nobody scored.
 */
export function TeamPodium({ scores, label, celebrate = true }: { scores: Record<TeamId, number>; label: string; celebrate?: boolean }) {
  const total = TEAMS.reduce((n, t) => n + scores[t.id], 0);
  const entries: PodiumEntry[] = rankTeams(scores).map((r) => ({ key: r.id, rank: r.rank, name: teamName(r.id), value: `${r.points} pts`, team: r.id }));
  useEffect(() => {
    if (celebrate && total > 0) uiSound.fanfare();
  }, [celebrate, total > 0]);
  if (total === 0) return null;
  return (
    <>
      <div className="arc-podium-wrap">
        <Podium entries={entries} label={label} />
      </div>
      {celebrate && (
        <div className="arc-celebrate" aria-hidden>
          <Confetti />
        </div>
      )}
    </>
  );
}
