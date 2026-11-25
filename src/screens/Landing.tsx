import { useState, type CSSProperties } from 'react';
import { ACTIVITIES } from '../../shared/activities';
import { normalizeRoomCode } from '../../shared/game';
import { NAME_MAX, ROOM_CODE_ALPHABET, ROOM_CODE_LEN } from '../../shared/protocol';
import { rosterTeamFor, TEAMS, type TeamId } from '../../shared/teams';
import { openDemo } from '../demo/session';
import { CardTable, GAME_FACTS, PoseStage, TriviaArena } from '../components/landing/GameStages';
import { RacingWordmark } from '../components/landing/RacingWordmark';
import { HowToPlay } from '../components/landing/HowToPlay';
import { RaceScene } from '../components/landing/RaceScene';
import { SiteHeader } from '../components/SiteHeader';
import { useGame } from '../store';
import '../ui/entry-art.css'; // the pictures on this page (wordmark, race strip, stage / arena), kept exactly as designed

function codeFromUrl(): string {
  try {
    return normalizeRoomCode(new URLSearchParams(location.search).get('room')) ?? '';
  } catch {
    return '';
  }
}

/** Entrance delay (seconds) for the staggered fade-up. */
const rise = (delay: number) => ({ '--d': `${delay}s` }) as CSSProperties;

export function Landing() {
  const status = useGame((s) => s.status);
  const busy = useGame((s) => s.busy);
  const create = useGame((s) => s.create);
  const join = useGame((s) => s.join);
  const entry = useGame((s) => s.entry);
  const setEntry = useGame((s) => s.setEntry);
  // Only the admin hosts: everyone else gets the join form alone.
  const isAdmin = useGame((s) => !!s.admin);
  // This page is TypeDrive's own landing page. Opened for the Funny Pose Challenge, Playing Cards or Tech Trivia (from the Weekly Fun Activity dashboard) it
  // is the same name / host / join form — only the words and the picture around it change.
  const game = entry === 'pose' || entry === 'cards' || entry === 'trivia' ? ACTIVITIES.find((a) => a.id === entry) : undefined;

  const invite = codeFromUrl();
  // A shared invite link opens on "Join"; the bare URL is almost always the host setting up.
  const [chosenTab, setTab] = useState<'join' | 'host'>(invite ? 'join' : 'host');
  const tab = isAdmin ? chosenTab : 'join';
  // Always starts empty (Host and Join alike): names are never pre-filled or remembered.
  const [name, setName] = useState('');
  const [code, setCode] = useState(invite);
  // Drivers choose their team themselves — there is no default and nobody is assigned one.
  const [team, setTeam] = useState<TeamId | null>(null);

  const ready = status === 'open' && !busy;
  const nameOk = name.trim().length > 0;
  const codeOk = code.length === ROOM_CODE_LEN;
  // If the name is on one of the team lists, point at that team (a hint only — the player still picks).
  const suggested = tab === 'join' ? rosterTeamFor(name) : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || !nameOk) return;
    if (tab === 'host') create(name);
    else if (codeOk && team) join(code, name, team);
  };

  return (
    <div className={game ? `lp lp-g lp-g-${game.id} ac-${game.id}` : 'lp ac-typedrive'}>
      <div className="lp-body">
        <SiteHeader
          brand={game ? 'platform' : 'typedrive'}
          tagline={game ? 'Weekly Fun Activity' : undefined}
          right={
            <>
              {/* TypeDrive only: a look at the lobby, the race and the results with forty made-up players (src/demo) */}
              {!game && isAdmin && (
                <button className="lb-leave dd-open" onClick={openDemo} title="See the lobby, the race and the results with 40 made-up players">
                  <span>40-player demo</span>
                </button>
              )}
              <button className="lb-leave" onClick={() => setEntry(null)} title="Back to the Weekly Fun Activity dashboard">
                <span>Dashboard</span>
              </button>
            </>
          }
        />
        <main className={`lp-main en-main${game ? ' en-game' : ''}`}>
          <div className="en-hero">
            <section className="en-copy rise" style={rise(0.02)}>
              <span className="pill pill-accent en-kicker">{game ? 'Weekly Fun Activity' : 'Live multiplayer typing race'}</span>
              {game ? (
                <h1 className="en-h1">{game.name}</h1>
              ) : (
                <h1 className="lp-h1 lp-car-wm" aria-label="Type fast. Drive faster.">
                  <span className="lp-sr-only">Type fast. Drive faster.</span>
                  <RacingWordmark />
                </h1>
              )}
              <p className="en-lead">
                {game
                  ? `${game.tagline} ${isAdmin ? 'Host a room to run it, or join the host’s room with its code.' : 'Join your host’s room with the code they shared.'}`
                  : 'Everyone races the same passage. Type the next correct character to push your car forward — first across the finish line wins.'}
              </p>
              {game && (
                <ul className="en-facts" aria-label="At a glance">
                  {GAME_FACTS[game.id as keyof typeof GAME_FACTS].map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
            </section>

            {/* the picture: TypeDrive's race strip, or the game's own stage / arena */}
            {game ? (
              <div className="gl-wrap en-art rise" style={rise(0.12)}>
                {game.id === 'pose' ? <PoseStage /> : game.id === 'cards' ? <CardTable /> : <TriviaArena />}
              </div>
            ) : (
              <div className="lp-scene en-art rise" style={rise(0.12)}>
                <RaceScene />
              </div>
            )}

            <div className="lp-panel en-panel rise" style={rise(0.06)}>
              <section className="lp-card" aria-labelledby="lp-card-title">
                <div className="lp-card-in">
                  <div className="lp-card-head">
                    <h2 id="lp-card-title" className="lp-card-title">
                      {game ? 'Ready to play?' : 'Ready to race?'}
                    </h2>
                  </div>

                  {isAdmin && (
                    <div className="lp-tabs" role="group" aria-label="Host or join">
                      {(['join', 'host'] as const).map((t) => (
                        <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className={`lp-tab${tab === t ? ' on' : ''}`}>
                          {t === 'join' ? 'Join a room' : 'Host a room'}
                        </button>
                      ))}
                    </div>
                  )}

                  <form onSubmit={submit} className="lp-form">
                    <div className="en-fields">
                      <label className="lp-fieldset en-name">
                        <span className="lp-label">Your name</span>
                        <input
                          className="field"
                          name="player-display-name"
                          value={name}
                          maxLength={NAME_MAX}
                          placeholder="Enter your name"
                          autoComplete="off"
                          autoCapitalize="words"
                          autoCorrect="off"
                          spellCheck={false}
                          data-1p-ignore
                          data-lpignore="true"
                          onChange={(e) => setName(e.target.value)}
                          autoFocus
                        />
                      </label>

                      {tab === 'join' && (
                        <label className="lp-fieldset en-code">
                          <span className="lp-label">Room code</span>
                          <input
                            className="field code-box"
                            value={code}
                            placeholder="K7BQ"
                            inputMode="text"
                            autoCapitalize="characters"
                            autoCorrect="off"
                            spellCheck={false}
                            autoComplete="off"
                            maxLength={ROOM_CODE_LEN}
                            onChange={(e) =>
                              setCode(
                                [...e.target.value.toUpperCase()]
                                  .filter((c) => ROOM_CODE_ALPHABET.includes(c))
                                  .join('')
                                  .slice(0, ROOM_CODE_LEN),
                              )
                            }
                          />
                        </label>
                      )}
                    </div>

                    {tab === 'join' && (
                      <fieldset className="lp-fieldset tp-set">
                        <legend className="lp-label">Your team</legend>
                        <div className="tp" role="radiogroup" aria-label="Choose your team">
                          {TEAMS.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              role="radio"
                              aria-checked={team === t.id}
                              className={`tp-opt tm-${t.id}${team === t.id ? ' on' : ''}`}
                              onClick={() => setTeam(t.id)}
                            >
                              <span className="tp-dot" aria-hidden />
                              <span className="tp-text">
                                <span className="tp-name">{t.name}</span>
                                <span className="tp-sub">{t.members.length} on the list</span>
                              </span>
                              {suggested === t.id && <span className="tp-sugg">That’s you?</span>}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                    )}

                    <button className="lp-go" aria-label={tab === 'host' ? 'Create room' : game ? 'Join room' : 'Join race'} disabled={!ready || !nameOk || (tab === 'join' && (!codeOk || !team))}>
                      <span className="lp-go-in">
                        {busy ? <span className="spinner" /> : null}
                        {tab === 'host' ? 'Create room' : game ? 'Join room' : 'Join race'}
                      </span>
                    </button>
                    {status !== 'open' && (
                      <p className="lp-status" role="status">
                        <span className="spinner" /> Connecting to the game server…
                      </p>
                    )}
                  </form>

                  <p className="lp-help">
                    {tab === 'host'
                      ? game
                        ? 'You get a room code and a link to share. You run the game and watch — players join to take part.'
                        : 'You get a room code and a link to share. You host and watch the race — players join to drive.'
                      : 'Ask the host for the 4-character code, or open the invite link they shared, then pick your team.'}
                  </p>
                </div>
              </section>
            </div>
          </div>

          {!game && <HowToPlay />}
        </main>
      </div>
    </div>
  );
}
