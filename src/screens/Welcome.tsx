import type { CSSProperties } from 'react';
import { ACTIVITIES, type ActivityId } from '../../shared/activities';
import { GAME_KICKER } from '../brand';
import { KeyArt } from '../components/arcade/KeyArt';
import { StepGame, StepKey, StepLobby, StepTrophy } from '../components/arcade/StepIcons';
import { PlatformTitle } from '../components/arcade/Wordmark';
import { DASHBOARD_LOGO_SIZE, SiteHeader } from '../components/SiteHeader';
import { openDemo } from '../demo/session';
import { useGame } from '../store';

/** A short fact on each card, so they read differently at a glance. */
const FACT: Record<ActivityId, string> = { typedrive: 'Live race', pose: '6 rounds', cards: '10 rounds', trivia: '5 questions' };

const rise = (delay: number) => ({ '--d': `${delay}s` }) as CSSProperties;

/** How it works — for the admin (who runs the games) and for everyone else (who joins them). */
const ADMIN_STEPS = [
  { icon: <StepGame />, text: <>Open a game below.</> },
  { icon: <StepKey />, text: <>Enter your name and <em>host a room</em>, then share the 4-letter code or the invite link.</> },
  { icon: <StepLobby />, text: <>Everyone waits in the lobby until you start the game.</> },
  { icon: <StepTrophy />, text: <>Team points from all three games add up on one overall leaderboard.</> },
];
const PLAYER_STEPS = [
  { icon: <StepKey />, text: <>Get the 4-letter room code or the invite link from your host.</> },
  { icon: <StepGame />, text: <>Choose <em>Join a room</em> on the game, enter your name and the code, and pick your team.</> },
  { icon: <StepLobby />, text: <>Wait in the lobby — your screen follows the host into each game.</> },
  { icon: <StepTrophy />, text: <>Team points from all three games add up on one overall leaderboard.</> },
];

/**
 * What the app opens on: the Weekly Fun Activity dashboard, before there is any room. It offers the three games in play order;
 * opening one goes to the name / host / join page, and the room that gets created or joined there opens in that game's lobby.
 */
export function WelcomeScreen() {
  const setEntry = useGame((s) => s.setEntry);
  // Only the admin hosts; everyone else sees the same dashboard, read-only, with a way to join their host's room.
  const isAdmin = useGame((s) => !!s.admin);
  const steps = isAdmin ? ADMIN_STEPS : PLAYER_STEPS;

  return (
    <div className="lp pt pt-on-hub">
      <div className="lp-body">
        <SiteHeader
          brand="platform"
          logoSize={DASHBOARD_LOGO_SIZE}
          tagline="Weekly Fun Activity"
          right={
            isAdmin && (
              <button className="lb-leave dd-open" onClick={openDemo} title="See TypeDrive's lobby, race and results with 40 made-up players">
                <span>40-player demo</span>
              </button>
            )
          }
        />
        <main className="lp-main pt-main">
          <section className="ph-hero ph-hero-c rise" style={rise(0)}>
            <p className="eyebrow">Three live team games</p>
            <PlatformTitle />
            <p className="ph-lead">
              {isAdmin
                ? 'Three games, one leaderboard. Pick a game to host a room — you run each game and everyone’s screen follows.'
                : 'Three games, one leaderboard. Your host runs each game — join their room with the code they share and your screen follows.'}
            </p>
          </section>

          <section className="ph-how-card card rise" style={rise(0.06)} aria-labelledby="wl-how-title">
            <h2 id="wl-how-title" className="eyebrow ph-how-title">
              How it works
            </h2>
            <ol className="ph-how">
              {steps.map((s, i) => (
                <li key={i}>
                  <i className="ph-how-ico" aria-hidden>
                    {s.icon}
                  </i>
                  <div>
                    <b>Step {i + 1}</b>
                    <span>{s.text}</span>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="wl-games-title" className="ph-games-sec rise" style={rise(0.12)}>
            <div className="ph-head">
              <h2 id="wl-games-title" className="section-title">
                {isAdmin ? 'Choose a game' : 'The games'} <span>played in this order</span>
              </h2>
              <p className="ph-hint">{isAdmin ? 'Players join with the room code you share.' : 'Got a room code from your host? Join on any game — your screen follows the room.'}</p>
            </div>
            <ol className="ph-games">
              {ACTIVITIES.map((a, i) => (
                <li key={a.id} className={`ph-game ac-${a.id}`} onClick={() => setEntry(a.id)}>
                  <div className="ph-game-in">
                    <div className="ph-art">
                      <KeyArt id={a.id} />
                      <b className="ph-art-num" aria-hidden>
                        {i + 1}
                      </b>
                      <span className="ph-pill">{FACT[a.id]}</span>
                    </div>
                    <div className="ph-body">
                      <p className="ph-kick">{GAME_KICKER[a.id]}</p>
                      <h3 className="ph-game-name">{a.name}</h3>
                      <p className="ph-game-tag">{a.tagline}</p>
                      <button
                        type="button"
                        className="btn btn-accent btn-block ph-open"
                        aria-label={isAdmin ? `Open ${a.name}` : `Join a room for ${a.name}`}
                        onClick={(e) => {
                          e.stopPropagation(); // the whole tile is a button too; this keeps one click from counting twice
                          setEntry(a.id);
                        }}
                      >
                        <span>{isAdmin ? `Open ${a.name}` : 'Join a room'}</span>
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </main>
      </div>
    </div>
  );
}
