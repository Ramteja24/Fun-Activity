import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { ACTIVITIES, overallLeaders, type ActivityId } from '../../shared/activities';
import { rankTeams, TEAMS, teamName } from '../../shared/teams';
import { GAME_KICKER } from '../brand';
import { IconCheck, IconCopy, IconLink, IconTrophy, IconWarn } from '../components/Icons';
import { KeyArt } from '../components/arcade/KeyArt';
import { PlatformTitle } from '../components/arcade/Wordmark';
import { ordinal } from '../portal/hooks';
import { PortalFrame, PortalLayout, STATUS_LABEL, TeamRoster, winnerLine } from '../portal/parts';
import { useGame } from '../store';
import { useShareBase } from './Lobby';

/**
 * The Weekly Fun Activity dashboard: the room's home. It lists the three activities in play order with their status and their
 * own team scores, the overall team leaderboard, the teams and who is on them, and the room code. The host takes the room into
 * an activity (everyone's screen follows) and back here between activities.
 */
export function HubScreen() {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me)!;
  const openActivity = useGame((s) => s.openActivity);
  const setTeam = useGame((s) => s.setTeam);
  const isHost = room.hostId === me;
  const hostInfo = room.players.find((p) => p.host);
  const online = room.players.filter((p) => !p.host && p.connected).length;

  const allDone = room.activities.every((a) => a.status === 'done');
  const leaders = overallLeaders(room.overall);
  const upNext: ActivityId = room.activities.find((a) => a.status !== 'done')?.id ?? 'typedrive';

  return (
    <PortalFrame screen="hub">
      <PortalLayout
        className="ph-layout"
        main={
          <>
        <div className="ph-hero-copy rise">
          <PlatformTitle />
          <p className="ph-lead">
            {isHost
              ? 'Three games, one leaderboard. Share the room code, then take everyone through each game — you run it and watch; you do not play.'
              : 'Three games, one leaderboard. The host takes the room into each game — your screen follows automatically.'}
          </p>
          {isHost && (
            <p className="ph-next">
              <span className="pill pill-brand">{allDone ? 'All done' : 'Up next'}</span>
              {allDone
                ? 'Every activity is complete. Open any of them to play again — its scores are replaced; the others keep theirs.'
                : `${ACTIVITIES.find((a) => a.id === upNext)!.name} — or open the activities in any order and come back here between them.`}
            </p>
          )}
        </div>

      {allDone && (
        <section className={`ph-final card rise${leaders.length === 1 ? ` tm-${leaders[0]}` : ''}`} role="status">
          <span className="ph-final-ico">
            <IconTrophy width={28} height={28} />
          </span>
          <div>
            <p className="eyebrow">Weekly Fun Activity complete · overall {winnerLine(leaders).kick.toLowerCase()}</p>
            <h2 className={leaders.length === 1 ? 'win' : 'tie'}>{winnerLine(leaders).title}</h2>
            {leaders.length > 1 && <p>{leaders.map((id) => teamName(id)).join(' & ')} finish level on the overall leaderboard.</p>}
          </div>
        </section>
      )}

      <section className="ph-board card rise" aria-labelledby="ph-overall-title">
        <h2 id="ph-overall-title" className="section-title">
          Overall scoreboard <span>all games added up</span>
        </h2>
        <Overall />
      </section>

      <section aria-labelledby="ph-games-title" className="ph-games-sec rise" style={{ '--d': '.06s' } as React.CSSProperties}>
        <h2 id="ph-games-title" className="section-title ph-section-title">
          The activities <span>play them in order</span>
        </h2>
        <ol className="ph-games">
          {ACTIVITIES.map((a, i) => {
            const score = room.activities.find((x) => x.id === a.id)!;
            const next = !allDone && a.id === upNext;
            const ranks = new Map(rankTeams(score.points).map((r) => [r.id, r]));
            const scored = TEAMS.some((t) => score.points[t.id] > 0);
            return (
              <li key={a.id} className={`ph-game ac-${a.id} ${score.status}${next ? ' next' : ''}`}>
                <div className="ph-game-in">
                  <div className="ph-art">
                    <KeyArt id={a.id} />
                    <b className="ph-art-num" aria-hidden>
                      {score.status === 'done' ? <IconCheck width={16} height={16} /> : i + 1}
                    </b>
                    <span className={`ph-pill ${score.status}`}>{STATUS_LABEL[score.status]}</span>
                  </div>
                  <div className="ph-body">
                    <p className="ph-kick">{GAME_KICKER[a.id]}</p>
                    <h3 className="ph-game-name">{a.name}</h3>
                    <p className="ph-game-tag">{a.tagline}</p>
                    <ul className="ph-mini" aria-label={`${a.name} team scores`}>
                      {TEAMS.map((t) => (
                        <li key={t.id} className={`tm-${t.id}`}>
                          <span className="n">
                            <i className="tm-dot" aria-hidden />
                            {t.name}
                          </span>
                          <span className="p">
                            {scored ? `${ordinal(ranks.get(t.id)!.rank)}${ranks.get(t.id)!.tied ? '*' : ''} · ` : ''}
                            {score.points[t.id]}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {isHost ? (
                      <button
                        type="button"
                        className="ph-open btn btn-accent btn-block"
                        onClick={() => openActivity(a.id)}
                        aria-label={score.status === 'pending' ? `Open ${a.name}` : score.status === 'live' ? `Continue ${a.name}` : `Open ${a.name} again`}
                      >
                        {/* the card already names the game: the button says only what it does */}
                        <span>{score.status === 'pending' ? 'Open' : score.status === 'live' ? 'Continue' : 'Play again'}</span>
                      </button>
                    ) : (
                      <p className="ph-open-wait">{next ? 'Up next — waiting for the host' : score.status === 'done' ? 'Finished' : 'The host opens it'}</p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
          </>
        }
        side={
          <>
        <Invite code={room.code} online={online} capacity={room.capacity} host={hostInfo?.name} />
        <section className="ph-teams pt-side-teams card" aria-labelledby="ph-teams-title">
          <h2 id="ph-teams-title" className="section-title">
            The teams <span>{isHost ? 'who is here' : 'pick yours any time before a game starts'}</span>
          </h2>
          <TeamRoster room={room} me={me} onPick={setTeam} />
        </section>
          </>
        }
      />
    </PortalFrame>
  );
}

/** The one overall scoreboard: each team's running total of every game's points, with what each game added. */
function Overall() {
  const room = useGame((s) => s.room)!;
  const rows = [...room.overall].sort((a, b) => a.rank - b.rank || TEAMS.findIndex((t) => t.id === a.id) - TEAMS.findIndex((t) => t.id === b.id));
  const anyScored = rows.some((r) => r.points > 0);
  const played = ACTIVITIES.filter((a) => room.activities.find((x) => x.id === a.id)!.status !== 'pending');
  return (
    <div className="ph-overall">
      <ol className="ph-rows">
        {rows.map((r) => {
          const parts = played.map((a) => `${SHORT_NAME[a.id]} ${r.byActivity[a.id]}`).join(' · ');
          return (
            <li key={r.id} className={`ph-row tm-${r.id}${anyScored && r.rank === 1 ? ' first' : ''}`}>
              <span className="ph-rank">{anyScored ? (r.tied ? `T${r.rank}` : r.rank) : '–'}</span>
              <div className="ph-row-main">
                <h3 className="ph-row-name">
                  <i className="tm-dot" aria-hidden />
                  {r.name}
                </h3>
                {parts && (
                  <p className="ph-row-parts" title={parts}>
                    {parts}
                  </p>
                )}
              </div>
              <span className="ph-total">
                {r.points}
                <small>pts</small>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="ph-foot">
        One scoreboard for the whole session: every game's team points are added to these totals as you play. Cards and Trivia give <b>+10</b> a round; a race gives <b>10 · 8 · 6 · 4 · 2</b> to the first five finishers and <b>1</b> to everyone else who finishes.
        {rows.some((r) => r.tied && r.rank === 1) && anyScored ? ' Level on points: shown as a tie, never decided at random.' : ''}
      </p>
    </div>
  );
}

const SHORT_NAME: Record<ActivityId, string> = { typedrive: 'Race', pose: 'Pose', cards: 'Cards', trivia: 'Trivia' };

/** The room code, copy buttons and a QR code for phones. */
function Invite({ code, online, capacity, host }: { code: string; online: number; capacity: number; host?: string }) {
  const { base, local, resolving } = useShareBase();
  const link = `${base}/?room=${code}`;
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(link, { margin: 1, width: 240, color: { dark: '#151a2d', light: '#ffffff' } })
      .then((url) => !cancelled && setQr(url))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [link]);

  const copy = async (what: 'code' | 'link') => {
    const text = what === 'code' ? code : link;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        /* nothing else to try */
      }
      ta.remove();
    }
    setCopied(what);
    window.setTimeout(() => setCopied((c) => (c === what ? null : c)), 1600);
  };

  return (
    <div className="lp-panel ph-invite rise" style={{ '--d': '.04s' } as React.CSSProperties}>
      <section className="lp-card" aria-label="Invite your team">
        <div className="lp-card-in">
          <p className="lb-label">Room code</p>
          <div className="lb-code" role="img" aria-label={`Room code ${code.split('').join(' ')}`}>
            {[...code].map((c, i) => (
              <span key={i} className="lb-plate">
                <b>{c}</b>
              </span>
            ))}
          </div>
          <p className="ph-online">
            <i aria-hidden /> {online} {online === 1 ? 'player' : 'players'} online · room for {capacity}
            {host ? ` · hosted by ${host}` : ''}
          </p>
          <div className="lb-copy-row">
            <button className={`lb-btn${copied === 'code' ? ' done' : ''}`} onClick={() => copy('code')}>
              <span>
                {copied === 'code' ? <IconCheck /> : <IconCopy />} {copied === 'code' ? 'Copied' : 'Copy code'}
              </span>
            </button>
            <button className={`lb-btn${copied === 'link' ? ' done' : ''}`} onClick={() => copy('link')}>
              <span>
                {copied === 'link' ? <IconCheck /> : <IconLink />} {copied === 'link' ? 'Copied' : 'Copy invite'}
              </span>
            </button>
          </div>
          <details className="ph-qr">
            <summary>QR code &amp; link</summary>
            <div className="ph-qr-row">
              <div className="ph-qr-img">{qr ? <img src={qr} alt={`QR code to join room ${code}`} /> : <span className="spinner" />}</div>
              <p>Scan with a phone camera to join instantly</p>
            </div>
            <p className="lb-label">Invite link</p>
            <div className="ph-url">{link}</div>
            {local && (
              <p className="note">
                <IconWarn width={15} height={15} />
                <span>
                  {resolving
                    ? 'Looking up this computer’s network address…'
                    : base === location.origin
                      ? 'You opened the game via localhost, so this link only works on this computer. Use this machine’s network address (printed in the server window).'
                      : 'This link uses your computer’s network address: teammates on the same Wi-Fi / office network can open it.'}
                </span>
              </p>
            )}
          </details>
        </div>
      </section>
    </div>
  );
}
