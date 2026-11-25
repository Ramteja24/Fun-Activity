import QRCode from 'qrcode';
import { useEffect, useState, type CSSProperties } from 'react';
import { difficultyDef } from '../../shared/difficulty';
import { DifficultyBadge, DifficultySelectScreen } from '../components/DifficultyPicker';
import { IconCheck, IconCopy, IconLink, IconUsers, IconWarn } from '../components/Icons';
import { LobbyDifficulty } from '../components/lobby/LobbyDifficulty';
import { TeamBoard } from '../components/lobby/TeamBoard';
import { SiteHeader } from '../components/SiteHeader';
import { useGame } from '../store';

const isLocalHost = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname);

/** How many drivers on a team make the grid "ready" on the status board. A look only: the host can start with one. */
const GRID_READY = 3;
/** Above this many drivers the lobby is "crowded": a look only (the QR folds away), nothing about who can join or start. */
const CROWD_FROM = 12;

/** The base URL teammates should use. On localhost that is the machine's LAN address (from /api/info). */
export function useShareBase(): { base: string; local: boolean; resolving: boolean } {
  const [lan, setLan] = useState<string | null>(null);
  const [resolving, setResolving] = useState(isLocalHost);
  useEffect(() => {
    if (!isLocalHost) return;
    let cancelled = false;
    fetch('/api/info')
      .then((r) => r.json() as Promise<{ lan: string[] }>)
      .then((d) => {
        if (!cancelled) setLan(d.lan[0] ?? null);
      })
      .catch(() => {})
      .finally(() => !cancelled && setResolving(false));
    return () => {
      cancelled = true;
    };
  }, []);
  if (!isLocalHost) return { base: location.origin, local: false, resolving: false };
  // In dev (Vite on :5173) the LAN URL from the game server points at :3000, which only serves the API —
  // swap in the page's own port so the link opens the same UI.
  const base = lan ? lan.replace(/:\d+$/, `:${location.port || '80'}`) : location.origin;
  return { base, local: true, resolving };
}

export function Lobby() {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me)!;
  const start = useGame((s) => s.start);
  const leave = useGame((s) => s.leave);
  const kick = useGame((s) => s.kick);
  const setTeam = useGame((s) => s.setTeam);
  const setDifficulty = useGame((s) => s.setDifficulty);
  const openActivity = useGame((s) => s.openActivity);

  const { base, local, resolving } = useShareBase();
  const link = `${base}/?room=${room.code}`;
  const isHost = room.hostId === me;
  // The host hosts and watches: they take no seat, have no car and never race (the server and the race screens enforce it; the
  // lobby just does not show a card for it). Everyone else is a driver.
  const hostInfo = room.players.find((p) => p.host);
  const drivers = room.players.filter((p) => !p.host);
  // Only drivers who picked a team race; the rest watch until they do.
  const online = drivers.filter((p) => p.connected && p.team !== null).length;
  const onlineAll = drivers.filter((p) => p.connected).length;
  const waitingForTeam = onlineAll - online;
  const taken = drivers.length;
  // The status board: nobody yet, the grid forming, or enough drivers for a full race.
  const grid = online === 0 ? 'waiting' : online < GRID_READY ? 'forming' : 'ready';
  // A full room (more than twelve drivers): the invite's QR code folds away so the teams sit high on the page. A look only.
  const crowd = taken > CROWD_FROM;

  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  // The QR + link fold away behind a button where the screen is short (and in a crowded room), so everything fits without scrolling.
  const [moreOpen, setMoreOpen] = useState(false);
  const [pickingDifficulty, setPickingDifficulty] = useState(false);
  const currentDiff = difficultyDef(room.difficulty);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(link, { margin: 1, width: 240, color: { dark: '#07071f', light: '#ffffff' } })
      .then((url) => !cancelled && setQr(url))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [link]);

  const copy = async (what: 'code' | 'link') => {
    const text = what === 'code' ? room.code : link;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API needs https/localhost; fall back for plain-http LAN use.
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

  if (pickingDifficulty) {
    return (
      <DifficultySelectScreen
        selected={room.difficulty}
        roomCode={room.code}
        isHost={isHost}
        driversReady={online}
        onSelect={setDifficulty}
        onStart={() => start(room.difficulty)}
        onBack={() => setPickingDifficulty(false)}
        backLabel="Back to lobby"
        header={
          <SiteHeader
            right={
              <button className="lb-leave" onClick={() => setPickingDifficulty(false)}>
                <span>Back to lobby</span>
              </button>
            }
          />
        }
      />
    );
  }

  return (
    <div className={`lp lb lb-${grid}${crowd ? ' lb-crowd' : ''}${isHost ? '' : ' lb-player'}`}>
      <div className="lp-body">
        <SiteHeader
          right={
            <>
              {isHost && (
                <button className="lb-leave" onClick={() => openActivity('hub')} title="Back to the Weekly Fun Activity dashboard">
                  <span>Activity hub</span>
                </button>
              )}
              <button className="lb-leave" onClick={leave}>
                <span>Leave</span>
              </button>
            </>
          }
        />
        <main className="lp-main lb-main">
          <header className="lb-title">
            <div className="lb-title-main">
              <h1 className="lb-h1">Race lobby</h1>
              <p className="lb-lead">
                {isHost
                  ? 'Share the room code. You host and watch the race — start it once your drivers are on the grid.'
                  : 'You are on the grid. The host starts the race once everyone has arrived.'}
              </p>
            </div>
            <div className={`lb-board lb-board-${grid}`} role="status" aria-label="Grid status">
              <span className="lb-board-state">
                <i aria-hidden />
                {grid === 'waiting' ? 'Waiting for drivers' : grid === 'forming' ? 'Grid forming' : 'Grid ready'}
              </span>
              <span className="lb-board-cell">
                <small>Room</small>
                <b>{room.code}</b>
              </span>
              <span className="lb-board-cell">
                <small>On the grid</small>
                <b>{online}</b>
              </span>
              <span className="lb-board-cell">
                <small>Seats</small>
                <b>
                  {taken}
                  <i>/{room.capacity}</i>
                </b>
              </span>
            </div>
          </header>

          <div className="lb-grid">
            <div className="lb-side">
              {/* ------------------------------------------------------------------ invite */}
              <section className="lp-card lb-share" aria-label="Invite your team">
                <div className="lp-card-in">
                  <p className="lb-label">Room code</p>
                  <div className="lb-code" role="img" aria-label={`Room code ${room.code.split('').join(' ')}`}>
                    {[...room.code].map((c, i) => (
                      <span key={i} className="lb-plate" style={{ '--i': i } as CSSProperties}>
                        <b>{c}</b>
                      </span>
                    ))}
                  </div>

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

                  <button className="lb-toggle" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
                    {moreOpen ? 'Hide QR code & link' : 'Show QR code & link'}
                  </button>

                  <div className={`lb-more${moreOpen ? ' open' : ''}`}>
                    <div className="lb-qr-row">
                      <div className="lb-qr">{qr ? <img src={qr} alt={`QR code to join room ${room.code}`} /> : <span className="spinner" />}</div>
                      <div className="lb-qr-side">
                        <p className="lb-tag-label">Scan to join</p>
                        <p className="lb-scan">Point a phone camera at the code to join instantly.</p>
                      </div>
                    </div>
                    <div className="lb-link">
                      <p className="lb-tag-label">Invite link</p>
                      <div className="lb-url">{link}</div>
                    </div>

                    {local && (
                      <p className="note lb-note">
                        <IconWarn width={15} height={15} />
                        <span>
                          {resolving
                            ? 'Looking up this computer’s network address…'
                            : base === location.origin
                              ? 'You opened the game via localhost, so this link only works on this computer. Use this machine’s network address (printed in the server window) or deploy it — see README.'
                              : 'This link uses your computer’s network address: teammates on the same Wi-Fi / office network can open it. For remote teammates, deploy it — see README.'}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {/* ------------------------------------------------------------------ race setup: the level, and Start */}
              <section className="lb-control" aria-label="Race setup">
                <div className="lb-ctl-head">
                  <h2 className="lb-ctl-title">Race setup</h2>
                  <DifficultyBadge difficulty={room.difficulty} variant="lobby" />
                </div>
                <div className={`lb-diff df-${room.difficulty}`} aria-label="Selected race difficulty">
                  <LobbyDifficulty selected={room.difficulty} canChange={isHost} onSelect={setDifficulty} />
                  <p className="lb-diff-desc">{currentDiff.description}</p>
                  <button type="button" className="df-change-btn" onClick={() => setPickingDifficulty(true)}>
                    {isHost ? 'Select difficulty' : 'View levels'}
                  </button>
                </div>

                {/* start (docked bar on phones) */}
                <div className="lb-foot">
                  {isHost ? (
                    <>
                      <button className="lp-go" aria-label={`Start race${online > 0 ? ` with ${online} driver${online === 1 ? '' : 's'}` : ''}`} disabled={online === 0} onClick={() => setPickingDifficulty(true)}>
                        <span className="lp-go-in">Start race{online > 1 ? ` · ${online} drivers` : ''}</span>
                      </button>
                      <p className="lb-hint">
                        {online === 0
                          ? waitingForTeam > 0
                            ? 'Waiting for the drivers who are here to pick a team — only drivers on a team race.'
                            : 'Waiting for a driver to join — share the room code. The host watches and does not race (to try it alone, open the invite link in a second tab).'
                          : `Every driver on a team who is online right now races while you watch${waitingForTeam > 0 ? ` (${waitingForTeam} still to pick a team will watch)` : ''}. Latecomers watch and join the next round.`}
                      </p>
                    </>
                  ) : (
                    <div className="lb-wait" role="status">
                      <span className="spinner" aria-hidden />
                      <p>{hostInfo ? `Waiting for ${hostInfo.name} (the host) to start the race…` : 'Waiting for the host to start the race…'}</p>
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* ------------------------------------------------------------------ the teams, in their pit bays */}
            <section className="lp-card lb-drivers" aria-labelledby="lb-drivers-title">
              <div className="lb-dhead">
                <h2 id="lb-drivers-title" className="lb-dtitle">
                  <IconUsers width={18} height={18} />
                  Teams on the grid
                </h2>
                <div className="lb-counter" title={`${taken} of ${room.capacity} seats taken, ${onlineAll} online`}>
                  <span className="lb-cap" aria-hidden>
                    <i style={{ width: `${Math.min(100, (taken / room.capacity) * 100)}%` }} />
                  </span>
                  <span className="lb-seats">
                    <b>{taken}</b>/{room.capacity} seats
                  </span>
                  <span className="lb-online">
                    <i aria-hidden /> {onlineAll} online
                  </span>
                </div>
              </div>

              {drivers.length === 0 && <p className="lb-empty">No drivers yet — share the room code or the invite link; each player picks their team when they join.</p>}

              {/* the three pit bays sit side by side and fill the height; the page itself never scrolls */}
              <TeamBoard room={room} me={me} isHost={isHost} onKick={kick} onPick={setTeam} />
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
