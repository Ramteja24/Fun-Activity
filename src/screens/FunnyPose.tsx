import { useEffect, useRef, type ReactNode } from 'react';
import { POSE_PERFORM_MS, POSE_POINTS, POSE_ROUNDS } from '../../shared/activities';
import type { PoseInfo } from '../../shared/protocol';
import { poseById, POSE_BANK, type PoseChallenge } from '../../shared/poses';
import { rankTeams, TEAMS, teamName } from '../../shared/teams';
import { uiSound } from '../audio/ui-sounds';
import { Burst } from '../components/arcade/Burst';
import { Embers } from '../components/arcade/Embers';
import { TeamPodium } from '../components/arcade/TeamPodium';
import { TimerRing } from '../components/arcade/TimerRing';
import { IconCheck, IconTrophy, IconX } from '../components/Icons';
import { useReducedMotion, useSecondsLeft, useSpinProgress, useTimeFraction } from '../portal/hooks';
import { HostBar, PortalFrame, PortalLayout, PortalTitle, ScoreStrip, TeamRoster, participantsOf } from '../portal/parts';
import { PoseDrawing } from '../portal/PoseDrawing';
import { Reel, reelPosition } from '../portal/Reel';
import { useGame } from '../store';

/**
 * Funny Pose Challenge. The host runs every round — choose the team, then (after the spinner has picked one of its players at
 * random) start the round, reveal the pose, mark whether it was completed, go on — and everyone's screen follows. The chosen player
 * copies the pose on the live call while everyone watches. The host never chooses the player and never takes part.
 */
export function FunnyPoseScreen() {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me)!;
  const p = room.pose;
  const isHost = room.hostId === me;
  const scores = room.activities.find((a) => a.id === 'pose')!.points;
  // While the spinner runs nothing may give away who it will land on (the server already knows): the lit player waits for it to stop.
  const settled = !!p && (p.stage === 'selected' || p.stage === 'ready' || p.stage === 'posing' || p.stage === 'judged');

  const title = (
    <PortalTitle
      kicker="Activity 2 of 4"
      title="Funny Pose Challenge"
      lead={
        p && p.stage !== 'over'
          ? `Round ${p.round} of ${p.rounds}. ${isHost ? 'You choose the team, the spinner picks the player, and you run the round — you do not play.' : 'Watch the call: the host picks a team, the spinner picks who performs, then the pose is revealed.'}`
          : p
            ? `All ${p.rounds} rounds are done.`
            : isHost
              ? 'You run the game: choose a team, let the spinner pick the player, reveal the pose and mark the result. You do not play.'
              : 'The host picks a team and a spinner picks the player. When it is your turn, copy the pose on the call — everyone is watching!'
      }
    />
  );
  const teams = (
    <section className="pt-side-teams card" aria-labelledby="fp-teams-title">
      <h2 id="fp-teams-title" className="section-title">
        The teams <span>{p && p.stage !== 'over' && p.team ? (settled ? 'the chosen team and the picked player are lit' : 'the chosen team is lit') : 'everyone who is here'}</span>
      </h2>
      <TeamRoster room={room} me={me} turns={p?.turns} activeTeam={p && p.stage !== 'over' ? p.team : null} activePlayer={settled ? p.player?.id : null} />
    </section>
  );

  return (
    <PortalFrame screen="pose">
      {!p ? <Intro scores={scores} title={title} teams={teams} /> : p.stage === 'over' ? <Over p={p} title={title} teams={teams} /> : <Round p={p} title={title} teams={teams} />}
    </PortalFrame>
  );
}

type Slots = { title: ReactNode; teams: ReactNode };

function Intro({ scores, title, teams }: { scores: Record<'titans' | 'vibe' | 'ctrl', number> } & Slots) {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me)!;
  const poseOp = useGame((s) => s.poseOp);
  const openActivity = useGame((s) => s.openActivity);
  const isHost = room.hostId === me;
  const here = participantsOf(room).length;
  return (
    <PortalLayout
      main={
        <>
          {title}
          <ol className="pt-steps card rise" style={{ '--d': '.06s' } as React.CSSProperties}>
        <li>
          <b>1</b>
          <span>
            The host chooses a <em>team</em>. A spinner then picks one of its players <em>at random</em> — the host never chooses the player, and nobody goes twice until everyone on the team has had a turn.
          </span>
        </li>
        <li>
          <b>2</b>
          <span>The host starts the round: the picked player’s name and team show on every screen, while the pose stays hidden.</span>
        </li>
        <li>
          <b>3</b>
          <span>
            The host <em>reveals the pose</em>. The player copies it on the Microsoft Teams call while everyone watches — the challenge is to imitate it, not to guess it.
          </span>
        </li>
        <li>
          <b>4</b>
          <span>
            The host marks it. <em>Completed</em> earns the player’s team {POSE_POINTS} points; not completed earns none. {POSE_ROUNDS} rounds per session, from a bank of {POSE_BANK.length} poses.
          </span>
        </li>
      </ol>
        </>
      }
      side={
        <>
      <HostBar isHost={isHost} waiting="Waiting for the host to start the Funny Pose Challenge…">
        <button className="btn btn-primary btn-lg" disabled={here === 0} onClick={() => poseOp({ op: 'start' })} aria-label={`Start the Funny Pose Challenge with ${here} participant${here === 1 ? '' : 's'}`}>
          <span>Start the challenge{here > 0 ? ` · ${here} here` : ''}</span>
        </button>
        <button className="btn btn-secondary btn-lg" onClick={() => openActivity('hub')}>
          <span>Dashboard</span>
        </button>
      </HostBar>
      {isHost && here === 0 && <p className="note">Nobody on a team is here yet — share the room code from the dashboard.</p>}
      <ScoreStrip scores={scores} caption="Funny Pose Challenge team scores" />
          {teams}
        </>
      }
    />
  );
}

function Round({ p, title, teams }: { p: PoseInfo } & Slots) {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me)!;
  const poseOp = useGame((s) => s.poseOp);
  const openActivity = useGame((s) => s.openActivity);
  const isHost = room.hostId === me;
  const { team, player } = p;
  const pose = poseById(p.poseId);
  const picking = p.stage === 'pick' || p.stage === 'spin' || p.stage === 'selected';
  const judged = p.stage === 'judged';
  // the verdict's sound: a bright run for a completed pose, a low buzz for one that was not
  const verdict = judged ? `${p.result === 'completed' ? 'yes' : 'no'}:${p.session}:${p.round}` : null;
  useEffect(() => {
    if (!verdict) return;
    if (verdict.startsWith('yes')) uiSound.correct();
    else uiSound.wrong();
  }, [verdict]);
  // the picked player is not named anywhere until the spinner has stopped
  const mine = !!player && player.id === me && p.stage !== 'pick' && p.stage !== 'spin';
  const last = p.round >= p.rounds;
  const eligible = participantsOf(room).length;

  const stage = (
      <section className={`er-stage card ${team ? `tm-${team}` : 'neutral'}${mine ? ' mine' : ''}`} aria-live="polite">
        <Embers />
        <div className="er-top">
          <span className="pill er-chip">
            Round <b>{p.round}</b> / {p.rounds}
          </span>
          {p.stage === 'posing' && <Clock p={p} />}
        </div>

        {picking ? (
          <Picking p={p} />
        ) : (
          <>
            {player && team && (
              <div className="er-up">
                <p className="er-up-kick">{mine ? 'Your turn!' : 'Now performing'}</p>
                <h2 className="er-up-name">{player.name}</h2>
                <p className="er-up-team">{teamName(team)}</p>
              </div>
            )}
            {p.stage === 'ready' && (
              <div className="fp-hidden">
                <b aria-hidden>?</b>
                <p>{mine ? 'Get ready — the pose is about to be revealed!' : 'The pose is hidden until the host reveals it.'}</p>
              </div>
            )}
            {pose && <PoseCard pose={pose} outcome={judged ? p.result : undefined} />}
            {p.stage === 'posing' && <p className="er-prompt">{mine ? 'Copy the pose on the call — everyone is watching!' : `Watch ${player?.name ?? 'the player'} copy the pose on the call…`}</p>}
          </>
        )}

        {judged && (
          <div className={`er-result ${p.result}`} role="status" key={`${p.session}:${p.round}`}>
            <Burst tone={p.result === 'completed' ? 'green' : 'red'} />
            {p.result === 'completed' ? <IconCheck width={26} height={26} /> : <IconX width={26} height={26} />}
            <div>
              <h3>{p.result === 'completed' ? 'Pose completed!' : 'Not completed'}</h3>
              <p>{team ? (p.result === 'completed' ? `+${p.gained ?? POSE_POINTS} points for ${teamName(team)}` : `No points for ${teamName(team)}`) : ''}</p>
            </div>
          </div>
        )}
      </section>
  );
  return (
    <PortalLayout
      main={
        <>
          {title}
          {stage}
        </>
      }
      side={
        <>
      <HostBar
        isHost={isHost}
        waiting={p.stage === 'pick' ? 'The host is choosing a team…' : p.stage === 'spin' ? 'The spinner is picking a player…' : p.stage === 'selected' ? 'The host is about to start the round…' : p.stage === 'ready' ? 'The host is about to reveal the pose…' : p.stage === 'posing' ? 'Copy the pose on the call — the host decides the result.' : 'Waiting for the host to start the next round…'}
      >
        {picking && (
          <button className="btn btn-primary btn-lg" disabled={p.stage !== 'selected'} onClick={() => poseOp({ op: 'begin' })}>
            <span>{p.stage === 'selected' && player ? `Start round ${p.round} · ${player.name}` : p.stage === 'spin' ? 'Picking a player…' : 'Choose a team'}</span>
          </button>
        )}
        {p.stage === 'selected' && p.pool.length > 1 && (
          <button className="btn btn-secondary btn-lg" onClick={() => poseOp({ op: 'respin' })} title="Picked person is away? Pick someone else">
            <span>Re-spin</span>
          </button>
        )}
        {p.stage === 'ready' && (
          <button className="btn btn-primary btn-lg" onClick={() => poseOp({ op: 'reveal' })}>
            <span>Reveal the pose</span>
          </button>
        )}
        {p.stage === 'posing' && team && (
          <>
            <button className="btn btn-lg btn-success pt-verdict ok" onClick={() => poseOp({ op: 'done' })}>
              <IconCheck width={18} height={18} /> Completed · +{POSE_POINTS} for {teamName(team)}
            </button>
            <button className="btn btn-lg btn-danger pt-verdict no" onClick={() => poseOp({ op: 'notdone' })}>
              <IconX width={18} height={18} /> Not completed · 0 points
            </button>
          </>
        )}
        {judged && (
          <button className="btn btn-primary btn-lg" onClick={() => poseOp({ op: 'next' })}>
            <span>{last ? 'Final results' : `Next round · ${p.round + 1} of ${p.rounds}`}</span>
          </button>
        )}
        <button className="btn btn-secondary btn-lg" onClick={() => openActivity('hub')} title="Back to the dashboard — the session is kept">
          <span>Dashboard</span>
        </button>
        <button
          className="btn btn-ghost btn-lg"
          onClick={() => {
            if (window.confirm('Throw this session away? Its points are removed and you can start a fresh one.')) poseOp({ op: 'reset' });
          }}
        >
          <span>Reset session</span>
        </button>
      </HostBar>
      {isHost && eligible === 0 && <p className="note">Nobody on a team is online right now.</p>}
      <ScoreStrip scores={p.scores} active={team} gained={judged && p.result === 'completed' && team ? { [team]: p.gained ?? 0 } : undefined} caption="Funny Pose Challenge team scores" />


      {teams}
      {p.history.length > 0 && <History p={p} />}
        </>
      }
    />
  );
}

/**
 * The start of a round. The host chooses only the TEAM; the server then picks one of its players at random and every screen runs
 * the same spinner (timed from the server's clock) before the picked player is highlighted. Nobody — the host included — can choose
 * the player.
 */
function Picking({ p }: { p: PoseInfo }) {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me)!;
  const poseOp = useGame((s) => s.poseOp);
  const isHost = room.hostId === me;
  const spinning = p.stage === 'spin';
  const selected = p.stage === 'selected';
  const people = room.players.filter((x) => !x.host);
  const here = (id: string) => people.filter((x) => x.team === id && x.connected).length;

  return (
    <div className="fp-pick">
      <div>
        <p className="fp-step">
          <b>Step 1</b> · {isHost ? (selected ? 'Choose a different team, or start the round' : 'Choose the team that plays this round') : 'The host chooses the team'}
        </p>
        <div className="fp-teams">
          {TEAMS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`fp-team tm-${t.id}${here(t.id) === 0 ? ' empty' : ''}`}
              aria-pressed={p.team === t.id}
              disabled={!isHost || here(t.id) === 0 || spinning || (selected && p.team === t.id)}
              onClick={() => poseOp({ op: 'team', team: t.id })}
            >
              <span className="fp-team-name">{t.name}</span>
              <span className="fp-team-meta">
                {here(t.id)} here · {p.turns[t.id]} played
              </span>
            </button>
          ))}
        </div>
      </div>

      {p.team && p.player && (
        <div className={`tm-${p.team}`}>
          <p className="fp-step">
            <b>Step 2</b> · {spinning ? `The spinner is picking someone from ${teamName(p.team)}…` : `The spinner picked from ${teamName(p.team)}`}
          </p>
          {spinning ? (
            <Spinner p={p} />
          ) : (
            <div className="fp-selected" role="status" key={`${p.session}:${p.round}:${p.player.id}`}>
              <Burst tone="gold" />
              <p className="fp-selected-kick">Selected!</p>
              <h3 className="fp-selected-name">{p.player.name}</h3>
              <p className="fp-selected-team">{teamName(p.team)}</p>
            </div>
          )}
        </div>
      )}

      <p className={`fp-chosen${p.team ? ` tm-${p.team}` : ''}`}>
        {spinning
          ? 'No one — not even the host — can choose who it lands on.'
          : selected && p.player
            ? isHost
              ? 'Press Start round when everyone is ready.'
              : `${p.player.name} copies the next pose on the call.`
            : isHost
              ? 'Choose a team — a spinner then picks one of its players at random.'
              : 'Waiting for the host…'}
      </p>
    </div>
  );
}

/** The player reel: it scrolls through the names of everyone eligible on the team and stops on the one the server picked. */
function Spinner({ p }: { p: PoseInfo }) {
  const t = useSpinProgress(p.spinStartedAt, p.spinMs);
  const reduced = useReducedMotion();
  const pool = p.pool.length > 0 ? p.pool : p.player ? [p.player] : [];
  const items = pool.map((x) => ({ key: x.id, label: x.name }));
  const target = Math.max(0, pool.findIndex((x) => x.id === p.player?.id));
  const run = Math.min(1, t / 0.88); // the reel stops a little before the end, so the name can be read before the result appears
  // A tick for every name that passes (climbing in pitch as the reel slows) and a ding when it stops — sound only, from the same
  // progress the picture uses.
  const step = Math.floor(reelPosition(run, items.length, target).pos);
  const lastStep = useRef(step);
  useEffect(() => {
    if (step !== lastStep.current && run < 1) uiSound.tick(run);
    lastStep.current = step;
  }, [step, run]);
  const landed = run >= 1;
  useEffect(() => {
    if (landed) uiSound.ding();
  }, [landed]);
  return (
    <div className={`er-spin${landed ? ' landed' : ''}`}>
      <p className="er-spin-kick">{run < 1 ? 'Spinning…' : 'And the pick is…'}</p>
      <div className="er-reels">
        <Reel items={items} target={target} progress={run} label="Player" reduced={reduced} />
      </div>
    </div>
  );
}

/**
 * The reference picture, the pose's name and what to do. It arrives with a curtain that opens, a whoosh and a ding; a pose the host
 * marked as not completed shakes and goes grey.
 */
function PoseCard({ pose, outcome }: { pose: PoseChallenge; outcome?: 'completed' | 'not_completed' }) {
  useEffect(() => {
    uiSound.whoosh();
    const t = window.setTimeout(() => uiSound.ding(), 320);
    return () => window.clearTimeout(t);
  }, [pose.id]);
  return (
    <div className={`fp-card${outcome === 'not_completed' ? ' failed' : outcome === 'completed' ? ' done' : ''}`} key={pose.id}>
      <div className="fp-picture">
        <PoseDrawing figure={pose.figure} label={`Reference pose: ${pose.title}`} className="fp-figure" />
        <span className="fp-badge" aria-hidden>
          {pose.badge}
        </span>
        <span className="fp-curtain" aria-hidden />
      </div>
      <div>
        <span className="fp-pose-cat">{pose.category}</span>
        <h3 className="fp-pose-title">{pose.title}</h3>
        <p className="fp-pose-cue">{pose.cue}</p>
      </div>
    </div>
  );
}

function Clock({ p }: { p: PoseInfo }) {
  const left = useSecondsLeft(p.endsAt);
  const frac = useTimeFraction(p.endsAt, p.performMs || POSE_PERFORM_MS);
  useEffect(() => {
    if (left > 0 && left <= 5) uiSound.tick(1); // the last five seconds tick
  }, [left]);
  return <TimerRing seconds={left} fraction={frac} size={64} />;
}

function History({ p, title = 'Rounds so far' }: { p: PoseInfo; title?: string }) {
  return (
    <section className="er-hist card" aria-label={title}>
      <h2 className="section-title">
        {title}{' '}
        <span>
          {p.history.length} of {p.rounds}
        </span>
      </h2>
      <ol>
        {p.history.map((h) => {
          const pose = poseById(h.poseId);
          return (
            <li key={h.round} className={`tm-${h.team}`}>
              <span className="er-hist-n">{h.round}</span>
              <span className="er-hist-badge" aria-hidden>
                {pose?.badge}
              </span>
              <span className="er-hist-main">
                <b>{pose?.title ?? h.poseId}</b>
                <small>
                  {h.player.name} · {teamName(h.team)}
                </small>
              </span>
              <span className={`er-hist-res ${h.completed ? 'ok' : 'no'}`}>{h.completed ? `+${h.points}` : '0'}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Over({ p, title, teams }: { p: PoseInfo } & Slots) {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me)!;
  const poseOp = useGame((s) => s.poseOp);
  const openActivity = useGame((s) => s.openActivity);
  const isHost = room.hostId === me;
  const ranks = rankTeams(p.scores);
  const total = TEAMS.reduce((n, t) => n + p.scores[t.id], 0);
  const winners = ranks.filter((r) => r.rank === 1).map((r) => r.id);
  const tie = winners.length > 1;
  return (
    <PortalLayout
      main={
        <>
          {title}
      <section className={`ph-final card${total > 0 && !tie ? ` tm-${winners[0]}` : ''}`} role="status">
        <span className="ph-final-ico">
          <IconTrophy width={28} height={28} />
        </span>
        <div>
        {total === 0 ? (
          <>
            <p className="eyebrow">Funny Pose Challenge · {p.rounds} rounds played</p>
            <h2 className="tie">No points this time</h2>
          </>
        ) : tie ? (
          <>
            <p className="eyebrow">Funny Pose Challenge · nobody takes it outright</p>
            <h2 className="tie">It’s a tie!</h2>
            <p>
              {winners.map((id) => teamName(id)).join(' & ')} finish level on {p.scores[winners[0]!]} points.
            </p>
          </>
        ) : (
          <>
            <p className="eyebrow">Funny Pose Challenge winners</p>
            <h2 className="win">{teamName(winners[0])}</h2>
            <p>
              {p.scores[winners[0]!]} points after {p.rounds} rounds
            </p>
          </>
        )}
        </div>
      </section>
      <div className="pt-podium">
        <TeamPodium scores={p.scores} label="Funny Pose Challenge podium" />
      </div>
      <History p={p} title="Every round" />
        </>
      }
      side={
        <>
      <HostBar isHost={isHost} waiting="Waiting for the host to choose what is next…">
        <button className="btn btn-primary btn-lg" onClick={() => openActivity('trivia')}>
          <span>Next: Tech Trivia</span>
        </button>
        <button className="btn btn-secondary btn-lg" onClick={() => openActivity('hub')}>
          <span>Dashboard &amp; overall scores</span>
        </button>
        <button className="btn btn-secondary btn-lg" onClick={() => poseOp({ op: 'start' })} title="A fresh session with new poses; this session’s points are replaced">
          <span>Play another session</span>
        </button>
      </HostBar>
      <ScoreStrip scores={p.scores} caption="Funny Pose Challenge final scores" />
      {teams}
        </>
      }
    />
  );
}
