import type { ReactNode } from 'react';
import { ACTIVITIES, type ActivityStatus, type Screen } from '../../shared/activities';
import type { RoomInfo } from '../../shared/protocol';
import { rankTeams, TEAMS, teamName, type TeamId } from '../../shared/teams';
import { CountUp } from '../components/arcade/CountUp';
import { IconCheck } from '../components/Icons';
import { DASHBOARD_LOGO_SIZE, SiteHeader } from '../components/SiteHeader';
import { useGame } from '../store';

export const STATUS_LABEL: Record<ActivityStatus, string> = { pending: 'Not started', live: 'In progress', done: 'Complete' };

/** Everyone eligible to take part in the Funny Pose Challenge / Tech Trivia: a connected participant on a team (the host only organises). */
export const participantsOf = (room: RoomInfo) => room.players.filter((p) => !p.host && p.connected && p.team !== null);

/**
 * The shell shared by the dashboard, the Funny Pose Challenge and Tech Trivia: the header and the three activities as a stepper.
 * Only the host moves the room between them; everyone's screen follows.
 */
export function PortalFrame({ screen, children }: { screen: Screen; children: ReactNode }) {
  const leave = useGame((s) => s.leave);
  return (
    <div className={`lp pt pt-on-${screen} ac-${screen}`}>
      <div className="lp-body">
        <SiteHeader
          brand="platform"
          logoSize={screen === 'hub' ? DASHBOARD_LOGO_SIZE : undefined}
          tagline="Weekly Fun Activity"
          right={
            <button className="lb-leave" onClick={leave}>
              <span>Leave</span>
            </button>
          }
        />
        <main className="lp-main pt-main">
          <ActivityNav screen={screen} />
          {children}
        </main>
      </div>
    </div>
  );
}

function ActivityNav({ screen }: { screen: Screen }) {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me)!;
  const openActivity = useGame((s) => s.openActivity);
  const isHost = room.hostId === me;
  const status = (id: string) => room.activities.find((a) => a.id === id)?.status ?? 'pending';

  const step = (target: Screen, label: string, num: string, st?: ActivityStatus) => {
    const on = screen === target;
    const inner = (
      <>
        <b className="pt-num" aria-hidden>
          {st === 'done' ? <IconCheck width={12} height={12} /> : num}
        </b>
        <span className="pt-step-name">{label}</span>
        {st && st !== 'pending' && <i className={`pt-dot ${st}`} title={STATUS_LABEL[st]} />}
      </>
    );
    const cls = `pt-step ac-${target}${on ? ' on' : ''}${st ? ` ${st}` : ''}`;
    return isHost ? (
      <button key={target} type="button" className={cls} aria-current={on ? 'page' : undefined} disabled={on} onClick={() => openActivity(target)} title={`Take the whole room to ${label}`}>
        {inner}
      </button>
    ) : (
      <span key={target} className={cls} aria-current={on ? 'page' : undefined}>
        {inner}
      </span>
    );
  };

  return (
    <nav className="pt-nav" aria-label="Weekly Fun Activity">
      {step('hub', 'Dashboard', '⌂')}
      {ACTIVITIES.map((a, i) => step(a.id, a.name, String(i + 1), status(a.id)))}
    </nav>
  );
}

/**
 * The portal screens' layout: the stage on the left (it fills the window's height), a side rail on the right for controls, scores
 * and the teams. One column on narrow screens.
 */
export function PortalLayout({ main, side, className = '' }: { main: ReactNode; side: ReactNode; className?: string }) {
  return (
    <div className={`pt-layout ${className}`}>
      <div className="pt-col">{main}</div>
      <aside className="pt-side">{side}</aside>
    </div>
  );
}

/** A screen's title block: which activity it is, its name and one line about what happens now. */
export function PortalTitle({ kicker, title, lead }: { kicker: string; title: string; lead: string }) {
  return (
    <header className="pt-title rise">
      <p className="eyebrow pt-kicker">{kicker}</p>
      <h1 className="pt-h1">{title}</h1>
      <p className="pt-lead">{lead}</p>
    </header>
  );
}

/** The three teams with their points in one activity. The team that is up (if any) is highlighted; `gained` shows this round's points. */
export function ScoreStrip({ scores, active, gained, caption }: { scores: Record<TeamId, number>; active?: TeamId | null; gained?: Partial<Record<TeamId, number>>; caption?: string }) {
  const ranks = new Map(rankTeams(scores).map((r) => [r.id, r]));
  const any = TEAMS.some((t) => scores[t.id] > 0);
  return (
    <div className="pt-scores" role="list" aria-label={caption ?? 'Team scores'}>
      {TEAMS.map((t) => {
        const r = ranks.get(t.id)!;
        const add = gained?.[t.id] ?? 0;
        return (
          <div key={t.id} role="listitem" className={`pt-score tm-${t.id}${active === t.id ? ' now' : ''}`} aria-label={`${t.name}: ${scores[t.id]} points`}>
            <span className="pt-score-rank" title={any ? `Rank ${r.rank}${r.tied ? ' (tied)' : ''}` : 'Nothing scored yet'}>
              {any ? (r.tied ? `T${r.rank}` : r.rank) : '–'}
            </span>
            <span className="pt-score-name">
              <i className="tm-dot" aria-hidden />
              {t.name}
            </span>
            <span className="pt-score-pts">
              <CountUp value={scores[t.id]} sound />
              <small>pts</small>
            </span>
            {add > 0 && <span className="pt-score-add">+{add}</span>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The three teams and who is on each right now. `activeTeam` / `activePlayer` highlight whoever the spinner picked;
 * `onPick` (dashboard only) lets a participant switch teams.
 */
export function TeamRoster({
  room,
  me,
  turns,
  activeTeam,
  activePlayer,
  onPick,
}: {
  room: RoomInfo;
  me: string;
  turns?: Record<TeamId, number>;
  activeTeam?: TeamId | null;
  activePlayer?: string | null;
  onPick?: (team: TeamId) => void;
}) {
  const people = room.players.filter((p) => !p.host);
  const mine = room.players.find((p) => p.id === me);
  const loose = people.filter((p) => p.team === null);
  return (
    <div className="pt-roster">
      <div className="pt-cols">
        {TEAMS.map((def) => {
          const members = people.filter((p) => p.team === def.id);
          const online = members.filter((p) => p.connected).length;
          const isMine = mine?.team === def.id;
          return (
            <section key={def.id} className={`pt-team tm-${def.id}${isMine ? ' mine' : ''}${activeTeam === def.id ? ' pt-up' : ''}`} aria-label={`${def.name}: ${members.length} players`}>
              <header className="pt-team-head">
                <h3 className="pt-team-name">
                  <i className="tm-dot" aria-hidden />
                  {def.name}
                  {isMine && <span className="pill pill-team">Your team</span>}
                </h3>
                <p className="pt-team-meta">
                  {members.length} {members.length === 1 ? 'player' : 'players'} · {online} online
                  {turns ? ` · ${turns[def.id]} ${turns[def.id] === 1 ? 'turn' : 'turns'}` : ''}
                </p>
              </header>
              <ul className="pt-members">
                {members.length === 0 && <li className="pt-none">Nobody yet</li>}
                {members.map((p) => (
                  <li key={p.id} className={`${p.connected ? '' : 'off'}${p.id === activePlayer ? ' pick' : ''}${p.id === me ? ' me' : ''}`}>
                    <i aria-hidden />
                    <span className="truncate">{p.name}</span>
                    {p.id === me && <em>you</em>}
                    {!p.connected && <em>offline</em>}
                  </li>
                ))}
              </ul>
              {onPick && !room.players.find((p) => p.id === me)?.host && !isMine && (
                <button type="button" className="btn btn-secondary btn-sm pt-team-join" onClick={() => onPick(def.id)}>
                  {mine?.team ? 'Switch to this team' : 'Join this team'}
                </button>
              )}
            </section>
          );
        })}
      </div>
      {loose.length > 0 && (
        <p className="pt-loose">
          {loose.map((p) => p.name).join(', ')} {loose.length === 1 ? 'has' : 'have'} not picked a team yet and sit{loose.length === 1 ? 's' : ''} out until they do.
        </p>
      )}
    </div>
  );
}

/** What the winner is, said once: a clear winner, or a tie (nobody is picked at random). */
export function winnerLine(leaders: TeamId[]): { kick: string; title: string } {
  if (leaders.length === 0) return { kick: 'No points yet', title: '—' };
  if (leaders.length === 1) return { kick: 'Winners', title: teamName(leaders[0]) };
  return { kick: 'Nobody takes it outright', title: 'It’s a tie!' };
}

/** Host-only control area. Participants see `waiting` in its place. */
export function HostBar({ isHost, waiting, children }: { isHost: boolean; waiting: string; children: ReactNode }) {
  if (!isHost) {
    return (
      <div className="pt-wait" role="status">
        <span className="pt-wait-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <p>{waiting}</p>
      </div>
    );
  }
  return (
    <div className="pt-host" aria-label="Host controls">
      <p className="eyebrow">Host controls</p>
      <div className="pt-host-row">{children}</div>
    </div>
  );
}
