import type { CSSProperties } from 'react';
import type { PlayerInfo, RoomInfo } from '../../../shared/protocol';
import { nameKey, TEAMS, type TeamId } from '../../../shared/teams';
import { IconX } from '../Icons';
import { Vehicle } from '../Vehicle';
import { GhostCar, TeamEmblem } from './TeamEmblem';

/** Every pit bay shows at least this many parking positions; the free ones read as waiting positions. */
const BAY_SLOTS = 3;
/** When any bay has more drivers than this, all three pack them tighter (a whole team of 14 must fit without clipped names or a list that scrolls inside the bay). */
export const DENSE_FROM = 6;

/** A team's rank for display: "T1" when it is tied with another team, "–" before the first race has been scored. */
export const rankLabel = (rank: number, tied: boolean, scored: boolean) => (!scored ? '–' : tied ? `T${rank}` : String(rank));

interface Props {
  room: RoomInfo;
  me: string;
  isHost: boolean;
  onKick(id: string): void;
  onPick(team: TeamId): void;
}

/**
 * The lobby's three teams, side by side: each with its rank and running points, how many players it has (and how many are
 * online), the players who picked it, and — dimmed — the people on its reference list who have not joined yet. Updates live
 * as people join, leave or switch. Drivers choose their own team; nobody is assigned one.
 */
export function TeamBoard({ room, me, isHost, onKick, onPick }: Props) {
  const drivers = room.players.filter((p) => !p.host);
  const mine = room.players.find((p) => p.id === me);
  const scored = room.match.races > 0;
  const standing = new Map(room.teams.map((t) => [t.id, t]));
  // the host counts as "here" too: their name on a team's list is not someone who has yet to join (the host watches and never drives)
  const joined = new Set([...drivers, ...room.players.filter((p) => p.host)].map((p) => nameKey(p.name)));
  const unassigned = drivers.filter((p) => p.team === null);
  const canPick = !isHost && !room.match.ended && (room.phase === 'lobby' || room.phase === 'results');
  const hasTrophies = drivers.some((p) => p.trophies > 0);
  // once any bay is full the three bays pack their drivers the same way, so they stay side by side as equals
  const dense = TEAMS.some((def) => drivers.filter((p) => p.team === def.id).length > DENSE_FROM);

  const row = (p: PlayerInfo, i: number) => (
    <li key={p.id} className={`lb-row${p.id === me ? ' me' : ''}${p.connected ? '' : ' offline'}`} style={{ '--n': Math.min(i, 14) } as CSSProperties}>
      <Vehicle index={p.vehicle} className="lb-veh" />
      <div className="lb-who">
        <div className="lb-name">
          <span className="lb-nm">{p.name}</span>
          {p.id === me && <span className="lb-tag you">You</span>}
        </div>
        <div className="lb-status">
          <i aria-hidden />
          {p.connected ? (hasTrophies ? `${p.trophies} trophies` : 'Ready') : 'Offline · can rejoin'}
        </div>
      </div>
      {isHost && p.id !== me && (
        <button className="lb-kick" aria-label={`Remove ${p.name}`} title="Remove from room" onClick={() => onKick(p.id)}>
          <IconX width={13} height={13} />
        </button>
      )}
    </li>
  );

  return (
    <div className="tm-board" tabIndex={0} aria-label={`${drivers.length} drivers in three teams`}>
      {unassigned.length > 0 && (
        <section className="tm-unassigned" aria-label="Drivers without a team">
          <h3>Choose a team</h3>
          <p>{unassigned.some((p) => p.id === me) ? 'You have not picked a team yet — you will watch until you do.' : 'These drivers have not picked a team yet, so they will watch until they do.'}</p>
          <ul className="tm-list">{unassigned.map(row)}</ul>
        </section>
      )}

      <div className="tm-cols">
        {TEAMS.map((def, bay) => {
          const members = drivers.filter((p) => p.team === def.id);
          const s = standing.get(def.id)!;
          const online = members.filter((p) => p.connected).length;
          const waiting = def.members.filter((m) => !joined.has(nameKey(m)));
          const isMine = mine?.team === def.id;
          return (
            <section key={def.id} className={`tm-card tm-${def.id}${isMine ? ' mine' : ''}${members.length > 0 ? ' occupied' : ''}${dense ? ' dense' : ''}`} aria-label={`${def.name}: ${members.length} players, ${s.points} points`}>
              <header className="tm-head">
                <span className="tm-bay">Pit bay {bay + 1}</span>
                <span className="tm-rank" title={scored ? `Team rank ${s.rank}${s.tied ? ' (tied)' : ''}` : 'No race scored yet'}>
                  {rankLabel(s.rank, s.tied, scored)}
                </span>
                <TeamEmblem id={def.id} />
                <div className="tm-who">
                  <h3 className="tm-name">{def.name}</h3>
                  <p className="tm-meta">
                    {members.length} {members.length === 1 ? 'player' : 'players'} · {online} online
                  </p>
                </div>
                <div className="tm-pts">
                  <b>{s.points}</b>
                  <span>pts</span>
                </div>
              </header>

              {canPick && !isMine && (
                <button type="button" className="tm-join" onClick={() => onPick(def.id)}>
                  {mine?.team ? 'Switch to this team' : 'Join this team'}
                </button>
              )}

              <ul className="tm-list">
                {members.length === 0 && <li className="tm-none">Nobody yet</li>}
                {members.map(row)}
                {/* the rest of the bay: waiting positions, so an empty bay still looks like a garage with room for its cars */}
                {Array.from({ length: Math.max(0, BAY_SLOTS - Math.max(members.length, 1)) }, (_, i) => (
                  <li key={`slot-${i}`} className="tm-slot" aria-hidden>
                    <GhostCar />
                    <span>
                      <b>P{Math.max(members.length, 1) + i + 1}</b> Waiting position
                    </span>
                  </li>
                ))}
              </ul>

              {waiting.length > 0 && (
                <details className="tm-wait">
                  <summary>
                    {waiting.length} on the list {waiting.length === 1 ? 'has' : 'have'} not joined yet
                  </summary>
                  <p>{waiting.join(', ')}</p>
                </details>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
