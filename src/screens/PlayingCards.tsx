import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CARDS_POINTS, CARDS_ROUNDS } from '../../shared/activities';
import { finalPosition } from '../../shared/cards';
import type { CardsInfo } from '../../shared/protocol';
import { rankTeams, TEAMS, teamName, type TeamId } from '../../shared/teams';
import { uiSound } from '../audio/ui-sounds';
import { TeamPodium } from '../components/arcade/TeamPodium';
import { CardBack, CardFace, JokerFace, PLAIN_FACES } from '../components/cards/CardArt';
import { IconTrophy } from '../components/Icons';
import { HostBar, PortalFrame, PortalLayout, PortalTitle, ScoreStrip, participantsOf } from '../portal/parts';
import { cardPickKey, socket, useGame } from '../store';

/** Playing Cards: watch the joker, follow the shuffle, tap the card. The first correct pick wins its team the round. */
export function PlayingCardsScreen() {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me)!;
  const c = room.cards;
  const isHost = room.hostId === me;
  const scores = room.activities.find((a) => a.id === 'cards')!.points;
  const title = (
    <PortalTitle
      kicker="Activity 3 of 4"
      title="Playing Cards"
      lead={
        c && c.stage !== 'over'
          ? `Round ${c.round} of ${c.rounds} · ${c.cards} cards. ${isHost ? 'You show the joker and reveal the answer — you do not pick.' : LEAD[c.stage]}`
          : isHost
            ? 'You show the joker, the cards shuffle on every screen, everyone picks, then you reveal it.'
            : 'Find the joker after the shuffle. The first correct pick wins 10 points for your team.'
      }
    />
  );
  return (
    <PortalFrame screen="cards">
      {!c ? <Intro scores={scores} title={title} /> : c.stage === 'over' ? <Over c={c} title={title} /> : <Round key={`${c.session}:${c.round}`} c={c} title={title} />}
    </PortalFrame>
  );
}

const LEAD: Record<CardsInfo['stage'], string> = {
  ready: 'Get ready — the host is about to show you the joker.',
  preview: 'Remember where the joker is!',
  shuffle: 'Follow the joker…',
  pick: 'Tap the card the joker is under. Your pick is final.',
  reveal: 'Here it is!',
  over: '',
};

function Intro({ scores, title }: { scores: Record<TeamId, number>; title: ReactNode }) {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me)!;
  const cardsOp = useGame((s) => s.cardsOp);
  const openActivity = useGame((s) => s.openActivity);
  const isHost = room.hostId === me;
  const here = participantsOf(room).length;
  return (
    <PortalLayout
      main={
        <>
          {title}
          <ol className="pt-steps card rise" style={{ '--d': '.06s' } as CSSProperties}>
            <li>
              <b>1</b>
              <span>
                {CARDS_ROUNDS} rounds. The cards turn face up for a moment — spot the <em>joker</em>.
              </span>
            </li>
            <li>
              <b>2</b>
              <span>They turn face down and shuffle — faster and with more cards every round. Keep your eyes on the joker.</span>
            </li>
            <li>
              <b>3</b>
              <span>Tap the card you think the joker is under. One pick per round, and it is final.</span>
            </li>
            <li>
              <b>4</b>
              <span>
                The host reveals it. The <em>first</em> correct pick wins <em>{CARDS_POINTS} points</em> for that player’s team.
              </span>
            </li>
          </ol>
        </>
      }
      side={
        <>
          <HostBar isHost={isHost} waiting="Waiting for the host to start Playing Cards…">
            <button className="btn btn-primary btn-lg" onClick={() => cardsOp('start')} aria-label={`Start Playing Cards with ${here} participant${here === 1 ? '' : 's'}`}>
              <span>Start Playing Cards{here > 0 ? ` · ${here} here` : ''}</span>
            </button>
            <button className="btn btn-secondary btn-lg" onClick={() => openActivity('hub')}>
              <span>Dashboard</span>
            </button>
          </HostBar>
          {isHost && here === 0 && <p className="note">Nobody on a team is here yet — share the room code from the dashboard.</p>}
          <ScoreStrip scores={scores} caption="Playing Cards team scores" />
        </>
      }
    />
  );
}

function Round({ c, title }: { c: CardsInfo; title: ReactNode }) {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me)!;
  const myPick = useGame((s) => s.myAnswers[cardPickKey(c.session, c.round)]);
  const cardPick = useGame((s) => s.cardPick);
  const cardsOp = useGame((s) => s.cardsOp);
  const openActivity = useGame((s) => s.openActivity);
  const isHost = room.hostId === me;
  const myTeam = room.players.find((p) => p.id === me)?.team ?? null;
  const revealed = c.stage === 'reveal' ? c.reveal : undefined;
  const last = c.round >= c.rounds;
  const canPick = c.stage === 'pick' && !isHost && myTeam !== null && myPick === undefined;
  const mine = revealed && myPick !== undefined ? myPick === revealed.joker : null;

  // the sounds of the table: a whoosh as the shuffle starts, a click for a pick, and at the reveal a bright run for a find
  useEffect(() => {
    if (c.stage === 'shuffle') uiSound.whoosh();
  }, [c.stage]);
  const revealKey = revealed ? `${c.session}:${c.round}` : null;
  useEffect(() => {
    if (!revealKey) return;
    if (isHost || mine === null) uiSound.whoosh();
    else if (mine) uiSound.correct();
    else uiSound.wrong();
  }, [revealKey, isHost, mine]);

  return (
    <PortalLayout
      main={
        <>
          {title}
          <section className={`pc-stage card pc-${c.stage}`} aria-live="polite">
            <div className="er-top">
              <span className="pill er-chip">
                Round <b>{c.round}</b> / {c.rounds}
              </span>
              <span className="pill pill-accent er-chip">{c.cards} cards</span>
              <span className="pc-status">{STATUS[c.stage]}</span>
            </div>
            <CardTable c={c} pickable={canPick} myPick={myPick} onPick={(card) => (uiSound.select(), cardPick(card))} />
            {c.stage === 'pick' && (
              <p className="pc-progress">
                <b>{c.picked}</b> of {c.eligible} picked
                {isHost ? ' · reveal it whenever you like' : myPick !== undefined ? ' · locked in — waiting for the host' : myTeam === null ? ' · pick a team on the dashboard to play' : ''}
              </p>
            )}
            {revealed && (
              <div className="pc-reveal" role="status">
                {!isHost && (
                  <p className={`tt-verdict ${mine === null ? '' : mine ? 'ok' : 'no'}`}>
                    {mine === null ? 'You did not pick this round' : mine ? (revealed.first?.id === me ? `You found it! +${CARDS_POINTS} for ${teamName(myTeam)}` : 'Right — but someone was quicker') : 'Not this time'}
                  </p>
                )}
                <p className={`tt-first${revealed.first ? ` tm-${revealed.first.team}` : ''}`}>
                  {revealed.first ? (
                    <>
                      First to find it: <b>{revealed.first.name}</b> · {teamName(revealed.first.team)} <em>+{CARDS_POINTS}</em>
                    </>
                  ) : (
                    'Nobody found the joker'
                  )}
                </p>
              </div>
            )}
          </section>
        </>
      }
      side={
        <>
          <HostBar isHost={isHost} waiting={c.stage === 'pick' ? 'Pick a card — the host reveals the answer.' : 'Waiting for the host to continue…'}>
            {c.stage === 'ready' && (
              <button className="btn btn-primary btn-lg" onClick={() => cardsOp('show')}>
                <span>Show the joker</span>
              </button>
            )}
            {(c.stage === 'preview' || c.stage === 'shuffle') && (
              <button className="btn btn-primary btn-lg" disabled>
                <span>{c.stage === 'preview' ? 'Showing the joker…' : 'Shuffling…'}</span>
              </button>
            )}
            {c.stage === 'pick' && (
              <button className="btn btn-primary btn-lg" onClick={() => cardsOp('reveal')}>
                <span>Reveal answer · {c.picked} picked</span>
              </button>
            )}
            {c.stage === 'reveal' && (
              <button className="btn btn-primary btn-lg" onClick={() => cardsOp('next')}>
                <span>{last ? 'Final leaderboard' : `Next round · ${c.round + 1} of ${c.rounds}`}</span>
              </button>
            )}
            <button className="btn btn-secondary btn-lg" onClick={() => openActivity('hub')} title="Back to the dashboard — the game is kept">
              <span>Dashboard</span>
            </button>
            <button
              className="btn btn-ghost btn-lg"
              onClick={() => {
                if (window.confirm('Throw this game away? Its points are removed and you can start a fresh one.')) cardsOp('reset');
              }}
            >
              <span>Reset game</span>
            </button>
          </HostBar>
          <ScoreStrip scores={c.scores} gained={revealed ? revealed.gained : undefined} caption="Playing Cards team scores" />
        </>
      }
    />
  );
}

const STATUS: Record<CardsInfo['stage'], string> = {
  ready: 'Cards face down',
  preview: 'Spot the joker!',
  shuffle: 'Shuffling…',
  pick: 'Where is the joker?',
  reveal: 'Revealed',
  over: '',
};

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The table. Card k starts at position k; the joker is card `start`. During the shuffle every frame is computed from the server's
 * clock (the same swap on every screen at the same moment) and written straight to the cards' transforms — no React render per
 * frame, nothing but transform, so it stays smooth.
 */
function CardTable({ c, pickable, myPick, onPick }: { c: CardsInfo; pickable: boolean; myPick: number | undefined; onPick: (card: number) => void }) {
  const n = c.cards;
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const [w, setW] = useState(0);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const gap = Math.max(12, Math.min(28, w * 0.025));
  // keep the table (card + room for the swap arc) inside the window
  const byHeight = typeof window === 'undefined' ? 170 : (window.innerHeight - 470) / 1.96;
  const cw = Math.max(56, Math.min(170, byHeight, (w - gap * (n - 1)) / n));
  const ch = cw * 1.4;
  const lift = ch * 0.2; // how far a card rises over (or dips under) its neighbour while they swap
  const left = (w - (n * cw + (n - 1) * gap)) / 2;
  const xOf = (slot: number) => left + slot * (cw + gap);
  const swaps = c.swaps ?? [];
  const settled = c.stage === 'pick' || c.stage === 'reveal';
  const slotOf = (k: number) => (settled ? finalPosition(k, swaps) : k);
  const faceUp = c.stage === 'preview' || c.stage === 'reveal';
  const joker = c.start;

  // the shuffle, driven by the server's clock
  useEffect(() => {
    if (c.stage !== 'shuffle' || !w || c.startsAt === undefined) return;
    const startsAt = c.startsAt;
    const ms = c.swapMs;
    let raf = 0;
    const tick = () => {
      const elapsed = socket.serverNow() - startsAt;
      const whoAt = Array.from({ length: n }, (_, i) => i);
      const done = Math.max(0, Math.min(swaps.length, Math.floor(elapsed / ms)));
      for (let i = 0; i < done; i++) {
        const [a, b] = swaps[i]!;
        [whoAt[a], whoAt[b]] = [whoAt[b]!, whoAt[a]!];
      }
      const pos = new Array<number>(n);
      whoAt.forEach((k, s) => (pos[k] = s));
      const moving = elapsed >= 0 && done < swaps.length ? swaps[done]! : null;
      const t = moving ? ease((elapsed - done * ms) / ms) : 0;
      for (let k = 0; k < n; k++) {
        const el = cardRefs.current[k];
        if (!el) continue;
        let x = xOf(pos[k]!);
        let y = 0;
        let r = 0;
        if (moving && (pos[k] === moving[0] || pos[k] === moving[1])) {
          const from = pos[k]!;
          const to = from === moving[0] ? moving[1] : moving[0];
          const dir = from < to ? -1 : 1; // the card moving right goes over, the one moving left goes under
          x = xOf(from) + (xOf(to) - xOf(from)) * t;
          y = dir * lift * Math.sin(Math.PI * t);
          r = dir * 7 * Math.sin(Math.PI * t);
        }
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${r.toFixed(2)}deg)`;
        el.style.zIndex = y < 0 ? '3' : y > 0 ? '1' : '2';
      }
      if (elapsed < swaps.length * ms) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.stage, c.startsAt, c.swapMs, w, n]);

  return (
    <div className="pc-table" ref={wrapRef} style={{ height: ch + lift * 2 + 36, '--pc-top': `${lift + 18}px` } as CSSProperties}>
      {w > 0 &&
        Array.from({ length: n }, (_, k) => {
          const slot = slotOf(k);
          const isJoker = joker === k;
          const plain = PLAIN_FACES[(joker !== undefined && k > joker ? k - 1 : k) % PLAIN_FACES.length]!;
          const won = c.stage === 'reveal' && c.reveal?.joker === slot;
          const count = c.stage === 'reveal' ? (c.reveal?.picks[slot] ?? 0) : 0;
          const style = { width: cw, height: ch, transform: `translate3d(${xOf(slot).toFixed(1)}px, 0px, 0)` } as CSSProperties;
          const body = (
            <>
              <span className={`pc-flip${faceUp ? ' up' : ''}`}>
                <span className="pc-side pc-front">{isJoker ? <JokerFace width="100%" height="100%" /> : <CardFace rank={plain.rank} suit={plain.suit} width="100%" height="100%" />}</span>
                <span className="pc-side pc-back">
                  <CardBack width="100%" height="100%" />
                </span>
              </span>
              {myPick === slot && <span className="pc-mine">Your pick</span>}
              {c.stage === 'reveal' && <span className={`pc-count${won ? ' won' : ''}`}>{count === 1 ? '1 pick' : `${count} picks`}</span>}
            </>
          );
          return pickable ? (
            <button
              key={k}
              type="button"
              ref={(el) => {
                cardRefs.current[k] = el;
              }}
              className="pc-card pickable"
              style={style}
              onClick={() => onPick(slot)}
              aria-label={`Card ${slot + 1} of ${n}`}
            >
              {body}
            </button>
          ) : (
            <div
              key={k}
              ref={(el) => {
                cardRefs.current[k] = el;
              }}
              className={`pc-card${won ? ' won' : ''}${myPick === slot ? ' mine' : ''}${isJoker && c.stage === 'preview' ? ' spot' : ''}`}
              style={style}
              aria-label={c.stage === 'reveal' ? `Card ${slot + 1}${won ? ': the joker' : ''}` : undefined}
            >
              {body}
            </div>
          );
        })}
    </div>
  );
}

function Over({ c, title }: { c: CardsInfo; title: ReactNode }) {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me)!;
  const cardsOp = useGame((s) => s.cardsOp);
  const openActivity = useGame((s) => s.openActivity);
  const isHost = room.hostId === me;
  const ranks = rankTeams(c.scores);
  const total = TEAMS.reduce((n, x) => n + c.scores[x.id], 0);
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
                  <p className="eyebrow">Playing Cards · {c.rounds} rounds</p>
                  <h2 className="tie">Nobody found the joker</h2>
                </>
              ) : tie ? (
                <>
                  <p className="eyebrow">Playing Cards · nobody takes it outright</p>
                  <h2 className="tie">It’s a tie!</h2>
                  <p>
                    {winners.map((id) => teamName(id)).join(' & ')} finish level on {c.scores[winners[0]!]} points.
                  </p>
                </>
              ) : (
                <>
                  <p className="eyebrow">Playing Cards winners</p>
                  <h2 className="win">{teamName(winners[0])}</h2>
                  <p>
                    {c.scores[winners[0]!]} points after {c.rounds} rounds
                  </p>
                </>
              )}
            </div>
          </section>
          <div className="pt-podium">
            <TeamPodium scores={c.scores} label="Playing Cards podium" />
          </div>
        </>
      }
      side={
        <>
          <HostBar isHost={isHost} waiting="Waiting for the host to continue…">
            <button className="btn btn-primary btn-lg" onClick={() => openActivity('hub')}>
              <span>Dashboard &amp; overall leaderboard</span>
            </button>
            <button className="btn btn-secondary btn-lg" onClick={() => cardsOp('start')} title="A fresh game; this game’s points are replaced">
              <span>Play again</span>
            </button>
          </HostBar>
          <section className="card tt-board-card" aria-label="Final team leaderboard">
            <h2 className="section-title">
              Final leaderboard <span>team points</span>
            </h2>
            <div className="tt-board">
              {ranks.map((r) => (
                <div key={r.id} className={`tt-row tm-${r.id}`}>
                  <span className="tt-rank">{total === 0 ? '–' : r.tied ? `T${r.rank}` : r.rank}</span>
                  <span className="tt-name">
                    <i className="tm-dot" aria-hidden />
                    {teamName(r.id)}
                  </span>
                  <span className="tt-scored">
                    {c.history.filter((h) => h.gained[r.id] > 0).length} of {c.rounds} won
                  </span>
                  <span className="tt-total">
                    {r.points} <small>pts</small>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      }
    />
  );
}
