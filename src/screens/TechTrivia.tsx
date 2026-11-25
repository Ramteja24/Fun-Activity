import { TRIVIA_BASE, TRIVIA_LIMIT_MS, TRIVIA_QUESTIONS, TRIVIA_SPEED } from '../../shared/activities';
import type { TriviaInfo } from '../../shared/protocol';
import { rankTeams, TEAMS, teamName } from '../../shared/teams';
import { useEffect, type ReactNode } from 'react';
import { uiSound } from '../audio/ui-sounds';
import { CountUp } from '../components/arcade/CountUp';
import { Embers } from '../components/arcade/Embers';
import { TeamPodium } from '../components/arcade/TeamPodium';
import { TimerRing } from '../components/arcade/TimerRing';
import { IconCheck, IconTrophy, IconX } from '../components/Icons';
import { useSecondsLeft, useTimeFraction } from '../portal/hooks';
import { HostBar, PortalFrame, PortalLayout, PortalTitle, ScoreStrip, participantsOf } from '../portal/parts';
import { answerKey, useGame } from '../store';

const LETTERS = ['A', 'B', 'C', 'D'];

/** Tech Trivia: five questions, everyone answers on their own screen, and the server scores each team once per question. */
export function TechTriviaScreen() {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me)!;
  const t = room.trivia;
  const isHost = room.hostId === me;
  const scores = room.activities.find((a) => a.id === 'trivia')!.points;

  const title = (
      <PortalTitle
      kicker="Activity 3 of 3"
      title="Tech Trivia"
      lead={
        t && t.stage !== 'over'
          ? `Question ${t.index + 1} of ${t.total}. ${isHost ? 'You run the quiz and watch — you do not answer.' : 'Pick your answer before the clock runs out. It is final once you tap it.'}`
          : isHost
            ? 'You start the quiz and move it along. Everyone else answers on their own screen.'
            : 'Five quick questions on Python, AI, SQL, Git, the cloud and general software. Answer on your own screen.'
      }
    />
  );
  return (
    <PortalFrame screen="trivia">
      {!t ? <Intro scores={scores} title={title} /> : t.stage === 'over' ? <Over t={t} title={title} /> : <Question key={`${t.session}:${t.index}`} t={t} title={title} />}
    </PortalFrame>
  );
}

function Intro({ scores, title }: { scores: Record<'titans' | 'vibe' | 'ctrl', number>; title: ReactNode }) {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me)!;
  const triviaOp = useGame((s) => s.triviaOp);
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
            {TRIVIA_QUESTIONS} questions, one at a time, each from a different topic. Four options; you have {TRIVIA_LIMIT_MS / 1000} seconds.
          </span>
        </li>
        <li>
          <b>2</b>
          <span>
            A correct answer scores {TRIVIA_BASE} points, plus up to {TRIVIA_SPEED} more for answering quickly. A wrong or missing answer scores nothing.
          </span>
        </li>
        <li>
          <b>3</b>
          <span>
            A team’s score for a question is the <em>average</em> of its players’ points, so a bigger team has no advantage.
          </span>
        </li>
        <li>
          <b>4</b>
          <span>The answer is revealed when everyone has answered, the time is up, or the host reveals it. Then the final team leaderboard.</span>
        </li>
      </ol>
        </>
      }
      side={
        <>
      <HostBar isHost={isHost} waiting="Waiting for the host to start Tech Trivia…">
        <button className="btn btn-primary btn-lg" disabled={here === 0} onClick={() => triviaOp('start')} aria-label={`Start Tech Trivia with ${here} participant${here === 1 ? '' : 's'}`}>
          <span>Start Tech Trivia{here > 0 ? ` · ${here} here` : ''}</span>
        </button>
        <button className="btn btn-secondary btn-lg" onClick={() => openActivity('hub')}>
          <span>Dashboard</span>
        </button>
      </HostBar>
      {isHost && here === 0 && <p className="note">Nobody on a team is here yet — share the room code from the dashboard.</p>}
      <ScoreStrip scores={scores} caption="Tech Trivia team scores" />
        </>
      }
    />
  );
}

function Question({ t, title }: { t: TriviaInfo; title: ReactNode }) {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me)!;
  const picked = useGame((s) => s.myAnswers[answerKey(t.session, t.index)]);
  const answer = useGame((s) => s.answer);
  const triviaOp = useGame((s) => s.triviaOp);
  const openActivity = useGame((s) => s.openActivity);
  const isHost = room.hostId === me;
  const revealed = t.stage === 'reveal' ? t.reveal : undefined;
  const left = useSecondsLeft(t.endsAt);
  const frac = useTimeFraction(t.endsAt, t.limitMs);
  const open = t.stage === 'question';
  const canAnswer = open && !isHost && picked === undefined && left > 0;
  const last = t.index + 1 >= t.total;
  const myTeam = room.players.find((p) => p.id === me)?.team ?? null;
  const total = revealed ? Math.max(1, revealed.picks.reduce((a, b) => a + b, 0)) : 1;
  const mine = revealed && picked !== undefined ? picked === revealed.correct : null;

  // The sounds of the show: a whoosh as the question arrives, a tick for each of the last five seconds to someone still thinking,
  // and — at the reveal — a bright run for a right answer, a low buzz for a wrong or missing one (the host just hears the reveal).
  useEffect(() => {
    uiSound.whoosh();
  }, []);
  useEffect(() => {
    if (open && !isHost && picked === undefined && left > 0 && left <= 5) uiSound.tick(1);
  }, [left, open, isHost, picked]);
  const revealKey = revealed ? `${t.session}:${t.index}` : null;
  useEffect(() => {
    if (!revealKey) return;
    if (isHost) uiSound.whoosh();
    else if (mine) uiSound.correct();
    else uiSound.wrong();
  }, [revealKey, isHost, mine]);

  return (
    <PortalLayout
      main={
        <>
          {title}
      <section className={`tt-card card${open ? ' open' : ''}${mine === false ? ' missed' : ''}`} aria-live="polite">
        <Embers />
        <div className="tt-marquee" aria-hidden />
        <div className="er-top">
          <span className="pill er-chip">
            Question <b>{t.index + 1}</b> / {t.total}
          </span>
          <span className="pill pill-accent er-chip cat">{t.question.category}</span>
          {open && <TimerRing seconds={left} fraction={frac} size={64} />}
        </div>

        <h2 className="tt-q">{t.question.text}</h2>

        <ol className="tt-opts">
          {t.question.options.map((text, i) => {
            const right = revealed && i === revealed.correct;
            const wrong = revealed && picked === i && i !== revealed.correct;
            const count = revealed?.picks[i] ?? 0;
            return (
              <li key={i} className={`tt-o${i}`} style={{ '--i': i } as React.CSSProperties}>
                <button
                  type="button"
                  className={`tt-opt${picked === i ? ' picked' : ''}${right ? ' right' : ''}${wrong ? ' wrong' : ''}${revealed && !right && !wrong ? ' dim' : ''}`}
                  disabled={!canAnswer}
                  onClick={() => answer(t.index, i)}
                  aria-pressed={picked === i}
                >
                  <b className="tt-letter">{LETTERS[i]}</b>
                  <span className="tt-text">{text}</span>
                  {right && <IconCheck width={20} height={20} aria-label="Correct answer" />}
                  {wrong && <IconX width={20} height={20} aria-label="Your answer" />}
                  {revealed && (
                    <span className="tt-count" title={`${count} ${count === 1 ? 'player' : 'players'} chose this`}>
                      <i style={{ width: `${(count / total) * 100}%` }} />
                      <em>{count}</em>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>

        {open && (
          <div className="tt-progress" aria-label="Answers in">
            <p>
              <b>{t.answered}</b> of {t.eligible} answered
              {isHost ? ' · you reveal it, or it reveals itself when everyone has answered or time is up' : picked !== undefined ? ' · locked in — waiting for the others' : left === 0 ? ' · time is up' : ''}
            </p>
            <ul>
              {TEAMS.map((x) => {
                const a = t.answeredByTeam[x.id];
                return (
                  <li key={x.id} className={`tm-${x.id}`} title={`${x.name}: ${a.answered} of ${a.eligible} answered`}>
                    <span>{x.name}</span>
                    <i>
                      <u style={{ width: `${a.eligible ? (a.answered / a.eligible) * 100 : 0}%` }} />
                    </i>
                    <em>
                      {a.answered}/{a.eligible}
                    </em>
                  </li>
                );
              })}
            </ul>
            {!isHost && myTeam === null && <p className="note">You have not picked a team, so your answers do not count. Ask the host to return to the dashboard so you can pick one.</p>}
          </div>
        )}

        {revealed && (
          <div className="tt-reveal" role="status">
            <p className={`tt-verdict ${mine === null ? '' : mine ? 'ok' : 'no'}`}>
              {isHost ? 'Answer revealed' : mine === null ? 'Time ran out before you answered' : mine ? 'You got it!' : 'Not this time'}
            </p>
            {revealed.explanation && <p className="tt-why">{revealed.explanation}</p>}
            <ul className="tt-gains" aria-label="Points this question">
              {TEAMS.map((x) => (
                <li key={x.id} className={`tm-${x.id}`}>
                  <span>{x.name}</span>
                  <small>
                    {revealed.tally[x.id].correct} of {revealed.tally[x.id].eligible} correct
                  </small>
                  <b>
                    +<CountUp value={revealed.gained[x.id]} from={0} ms={900} />
                  </b>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
        </>
      }
      side={
        <>

      <HostBar isHost={isHost} waiting={open ? 'Answer before the clock runs out — the host moves things on.' : 'Waiting for the host to continue…'}>
        {open && (
          <button className="btn btn-primary btn-lg" onClick={() => triviaOp('reveal')}>
            <span>Reveal answer now</span>
          </button>
        )}
        {t.stage === 'reveal' && (
          <button className="btn btn-primary btn-lg" onClick={() => triviaOp('next')}>
            <span>{last ? 'Final leaderboard' : `Next question · ${t.index + 2} of ${t.total}`}</span>
          </button>
        )}
        <button className="btn btn-secondary btn-lg" onClick={() => openActivity('hub')} title="Back to the dashboard — the quiz is kept">
          <span>Dashboard</span>
        </button>
        <button
          className="btn btn-ghost btn-lg"
          onClick={() => {
            if (window.confirm('Throw this quiz away? Its points are removed and you can start a fresh one.')) triviaOp('reset');
          }}
        >
          <span>Reset quiz</span>
        </button>
      </HostBar>
      <ScoreStrip scores={t.scores} gained={revealed ? revealed.gained : undefined} caption="Tech Trivia team scores" />
        </>
      }
    />
  );
}

function Over({ t, title }: { t: TriviaInfo; title: ReactNode }) {
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me)!;
  const triviaOp = useGame((s) => s.triviaOp);
  const openActivity = useGame((s) => s.openActivity);
  const isHost = room.hostId === me;
  const ranks = rankTeams(t.scores);
  const total = TEAMS.reduce((n, x) => n + t.scores[x.id], 0);
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
            <p className="eyebrow">Tech Trivia · {t.total} questions</p>
            <h2 className="tie">No points this time</h2>
          </>
        ) : tie ? (
          <>
            <p className="eyebrow">Tech Trivia · nobody takes it outright</p>
            <h2 className="tie">It’s a tie!</h2>
            <p>{winners.map((id) => teamName(id)).join(' & ')} finish level on {t.scores[winners[0]!]} points.</p>
          </>
        ) : (
          <>
            <p className="eyebrow">Tech Trivia winners</p>
            <h2 className="win">{teamName(winners[0])}</h2>
            <p>{t.scores[winners[0]!]} points after {t.total} questions</p>
          </>
        )}
        </div>
      </section>

      <div className="pt-podium">
        <TeamPodium scores={t.scores} label="Tech Trivia podium" />
      </div>
        </>
      }
      side={
        <>

      <HostBar isHost={isHost} waiting="Waiting for the host to continue…">
        <button className="btn btn-primary btn-lg" onClick={() => openActivity('hub')}>
          <span>Dashboard &amp; overall leaderboard</span>
        </button>
        <button className="btn btn-secondary btn-lg" onClick={() => triviaOp('start')} title="A fresh quiz with new questions; this quiz’s points are replaced">
          <span>Play another quiz</span>
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
              <span className="tt-scored">{t.history.filter((h) => h.gained[r.id] > 0).length} of {t.total} scored</span>
              <span className="tt-total">
                {r.points} <small>pts</small>
              </span>
            </div>
          ))}
        </div>
      </section>

      {t.top && t.top.some((p) => p.points > 0) && (
        <section className="card" aria-label="Top players">
          <h2 className="section-title">
            Top players <span>individual points</span>
          </h2>
          <ol className="tt-top">
            {t.top
              .filter((p) => p.points > 0)
              .map((p, i) => (
                <li key={p.id} className={`tm-${p.team}${p.id === me ? ' me' : ''}`}>
                  <span className="n">{i + 1}</span>
                  <span className="truncate">
                    {p.name}
                    {p.id === me ? ' (you)' : ''}
                    <small>{teamName(p.team)}</small>
                  </span>
                  <span className="c">
                    {p.correct} of {t.total}
                  </span>
                  <b>{p.points}</b>
                </li>
              ))}
          </ol>
        </section>
      )}
        </>
      }
    />
  );
}
