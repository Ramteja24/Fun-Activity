import { useEffect, useState, type CSSProperties } from 'react';
import { ordinal } from '../../shared/game';
import type { DnfReason, ResultRow } from '../../shared/protocol';
import { teamName, type TeamId } from '../../shared/teams';
import { uiSound } from '../audio/ui-sounds';
import { Confetti } from '../components/Confetti';
import { DifficultyBadge, DifficultySelectScreen } from '../components/DifficultyPicker';
import { IconTrophy } from '../components/Icons';
import { AwardsPodium, WinnerBanner, type AwardEntry } from '../components/results/Awards';
import { teamRaceSummary } from '../components/results/summary';
import { TeamResults } from '../components/results/TeamResults';
import { SiteHeader } from '../components/SiteHeader';
import { useEngine } from '../game/hooks';
import { engine, useGame } from '../store';

interface Line {
  id: string;
  rank: number;
  name: string;
  wpm: number;
  /** null while the race is still running for this person */
  accuracy: number | null;
  timeMs: number | null;
  finished: boolean;
  progress: number;
  racing: boolean;
  dnfReason?: DnfReason;
  /** The racer's team and what this race earned it (final results only). */
  team: TeamId | null;
  teamPoints: number | null;
}

/** Why a racer has no finish time — shown next to every DNF so it is never a mystery. */
const REASON_SHORT: Record<DnfReason, string> = {
  deadline: 'time limit reached',
  inactive: 'stopped typing',
  offline: 'disconnected',
  left: 'left the race',
  ended: 'ended by host',
};
const REASON_LONG: Record<DnfReason, string> = {
  deadline: 'The time limit ran out',
  inactive: 'You stopped typing after another driver had finished',
  offline: 'You were disconnected for too long',
  left: 'You left the race',
  ended: 'The host ended the race',
};

function headline(row: ResultRow | null, raced: boolean, isHost: boolean, final: boolean) {
  if (!raced && isHost) {
    return final
      ? { title: 'Race complete', sub: 'You hosted this race and watched it from the host seat — the ranking is below.' }
      : { title: 'Watching', sub: 'You are hosting: the drivers are still racing.' };
  }
  if (!raced) return { title: 'Watching', sub: 'You joined while this race was running — you are in for the next one.' };
  if (!row) return { title: 'Racing…', sub: 'Finish the passage to see your result.' };
  if (!row.finished) {
    const why = row.dnfReason ? `${REASON_LONG[row.dnfReason]} — ` : '';
    return { title: 'Race over', sub: `${why}you typed ${Math.round(row.progress * 100)}% of the passage.` };
  }
  if (row.rank === 1) return { title: 'Victory!', sub: 'You finished in 1st place!' };
  if (row.rank <= 3) return { title: 'On the podium!', sub: `You finished in ${ordinal(row.rank)} place!` };
  return { title: 'Finished!', sub: `You finished in ${ordinal(row.rank)} place.` };
}

export function ResultsScreen() {
  useEngine();
  const room = useGame((s) => s.room)!;
  const me = useGame((s) => s.me)!;
  const myFinish = useGame((s) => s.myFinish);
  const start = useGame((s) => s.start);
  const setDifficulty = useGame((s) => s.setDifficulty);
  const endRace = useGame((s) => s.endRace);
  const backToLobby = useGame((s) => s.backToLobby);
  const endMatch = useGame((s) => s.endMatch);
  const leave = useGame((s) => s.leave);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [pickingDifficulty, setPickingDifficulty] = useState(false);

  const final = room.phase === 'results' ? (room.results ?? null) : null;
  const meInfo = room.players.find((p) => p.id === me);
  const raced = !!meInfo?.racing;
  const isHost = room.hostId === me;
  const names = new Map(room.players.map((p) => [p.id, p.name]));
  // The finished race's authoritative row for me (from the final results once the race is over).
  const myRow: ResultRow | null = final?.find((r) => r.id === me) ?? myFinish;

  let lines: Line[];
  if (final) {
    lines = final.map((r) => ({
      id: r.id,
      rank: r.rank,
      name: r.name,
      wpm: r.wpm,
      accuracy: r.accuracy,
      timeMs: r.timeMs,
      finished: r.finished,
      progress: r.progress,
      racing: false,
      team: r.team,
      teamPoints: r.teamPoints,
      ...(r.dnfReason ? { dnfReason: r.dnfReason } : {}),
    }));
  } else {
    // Race still running for others: show them live (finished ones with times, the rest with progress).
    const len = Math.max(1, engine.len);
    lines = engine.standings().map((r, i) => {
      const done = r.fin > 0 && r.fin < Number.MAX_SAFE_INTEGER;
      const mine = r.id === me;
      const row = mine ? myFinish : null;
      return {
        id: r.id,
        rank: i + 1,
        name: names.get(r.id) ?? '—',
        wpm: row ? row.wpm : r.wpm,
        accuracy: row ? row.accuracy : null,
        timeMs: done ? r.fin : null,
        finished: done || !!row,
        progress: r.pos / len,
        racing: !(done || row),
        team: room.players.find((p) => p.id === r.id)?.team ?? null,
        teamPoints: null,
      };
    });
  }

  const { title, sub } = headline(myRow, raced, isHost, !!final);
  const live = !final;
  // The host does not race, so they are not in the championship unless they earned trophies as a driver before hosting.
  const championship = room.players
    .filter((p) => !(p.host && p.trophies === 0))
    .sort((a, b) => b.trophies - a.trophies || a.name.localeCompare(b.name));
  const stillRacing = lines.filter((l) => l.racing).length;
  const driversOnline = room.players.filter((p) => !p.host && p.connected && p.team !== null).length;
  // Team standings after this race: ranked, with what the race just added to each team's running total.
  const gained = room.match.last?.gained;
  const showTeams = !!final && room.match.races > 0;
  const racedDifficulty = room.race?.difficulty ?? room.difficulty;

  // The ceremony: the first three finishers of the finished race on the awards podium, the winner(s) announced. Pure presentation of
  // the server's final results — nothing here is scored or ranked again. Everyone sees it (and the confetti); the fanfare is for
  // those who stood on the podium and for the host, who watched them.
  const podium: AwardEntry[] = final
    ? lines
        .filter((l) => l.finished && l.rank <= 3)
        .sort((a, b) => a.rank - b.rank)
        .map((l) => ({ key: l.id, rank: l.rank, name: l.name, team: l.team, wpm: l.wpm, accuracy: l.accuracy, timeMs: l.timeMs, teamPoints: l.teamPoints, me: l.id === me }))
    : [];
  const winners = podium.filter((e) => e.rank === 1);
  const ceremony = podium.length > 0;
  const celebrate = ceremony && (podium.some((p) => p.me) || isHost);
  const raceKey = room.race?.id;
  useEffect(() => {
    if (celebrate) uiSound.fanfare();
  }, [celebrate, raceKey]);
  // What the race did for each team, from the server's rows and its `gained` figures.
  const teamLines = final ? teamRaceSummary(final, room.teams, gained) : [];
  const myTeam = meInfo?.team ?? null;

  if (final && pickingDifficulty) {
    return (
      <DifficultySelectScreen
        selected={room.difficulty}
        roomCode={room.code}
        isHost={isHost}
        driversReady={driversOnline}
        onSelect={setDifficulty}
        onStart={() => start(room.difficulty)}
        onBack={() => setPickingDifficulty(false)}
        backLabel="Back to results"
        header={
          <SiteHeader
            wide
            right={
              <button className="lb-leave" onClick={() => setPickingDifficulty(false)}>
                <span>Back to results</span>
              </button>
            }
          />
        }
      />
    );
  }

  const youPlace = myRow?.finished ? `${ordinal(myRow.rank)} place` : null;

  return (
    <div className={`lp res${ceremony ? ' res-final' : ''}`}>
      <div className="lp-body">
        <SiteHeader
          right={
            <button className="lb-leave" onClick={leave}>
              <span>Leave</span>
            </button>
          }
        />
        <main className="lp-main res-main">
          <header className="res-head">
            <div className="res-head-text">
              <p className="eyebrow">TypeDrive · race results</p>
              <h1 className="results-title">{title}</h1>
              <p className="res-sub">{sub}</p>
            </div>
            <DifficultyBadge difficulty={racedDifficulty} variant="results" />
          </header>
          {ceremony && (
            <div className="arc-celebrate" key={`c${raceKey}`} aria-hidden>
              <Confetti durationMs={5200} />
            </div>
          )}

          <div className={`res-grid${ceremony ? ' has-stage' : ''}`}>
            {ceremony && (
              <section className="rc-stage" aria-label="Award ceremony" key={raceKey}>
                {/* the stadium: three spotlights, a crowd along the front and the flash of cameras (all pictures) */}
                <div className="rc-lights" aria-hidden>
                  <i />
                  <i />
                  <i />
                  <span className="rc-flashes">
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                      <i key={i} style={{ '--i': i } as CSSProperties} />
                    ))}
                  </span>
                  <b className="rc-crowd" />
                </div>
                <WinnerBanner winners={winners} />
                <AwardsPodium entries={podium} />
              </section>
            )}
            <section className="card res-rank" aria-labelledby="res-rank-title">
              <div className="res-h">
                <h2 id="res-rank-title" className="section-title">
                  Official race ranking <span>{lines.length} {lines.length === 1 ? 'driver' : 'drivers'}</span>
                </h2>
                {live && stillRacing > 0 && (
                  <span className="pill pill-brand">
                    <span className="spinner" /> {stillRacing} still racing
                  </span>
                )}
              </div>
              <div className="rk-headrow" aria-hidden>
                <span>#</span>
                <span>Driver</span>
                <span data-short="WPM">Speed</span>
                <span data-short="Acc.">Accuracy</span>
                <span data-short="Time">Time</span>
                <span data-short="Pts">Team pts</span>
              </div>
              <div className="rk-scroll">
              <ol className="rk">
                {lines.map((l, i) => {
                  const medal = !l.racing && l.finished && l.rank <= 3 ? `m${l.rank}` : 'plain';
                  return (
                    <li
                      key={l.id}
                      className={`rank-row rk-row${l.id === me ? ' me' : ''}${l.team ? ` tm-${l.team}` : ''}${medal !== 'plain' ? ` top${l.rank}` : ''}${!l.racing && !l.finished ? ' dnf' : ''}${l.racing ? ' racing' : ''}`}
                      style={{ '--n': Math.min(i, 14) } as CSSProperties}
                    >
                      <span className={`medal rk-badge ${medal}`}>{l.racing ? '–' : l.rank}</span>
                      <div className="rk-who">
                        <div className="rk-name">
                          <span className="rk-nm">{l.name}</span>
                          {l.id === me && <span className="rk-you">You</span>}
                        </div>
                        {l.team && (
                          <span className={`rk-team tm-${l.team}`} title={teamName(l.team)}>
                            <i className="tm-dot" aria-hidden />
                            {teamName(l.team)}
                          </span>
                        )}
                      </div>
                      {l.racing ? (
                        <div className="rk-live">
                          <div className="rk-bar" aria-hidden>
                            <i style={{ width: `${Math.min(100, l.progress * 100)}%` }} />
                          </div>
                          <span>Racing… {Math.round(l.progress * 100)}%</span>
                        </div>
                      ) : l.finished ? (
                        <div className="rk-stats">
                          <div className="rk-stat wpm">
                            <small>Speed</small>
                            <b>
                              {Math.round(l.wpm)} <em>WPM</em>
                            </b>
                          </div>
                          <div className="rk-stat">
                            <small>Accuracy</small>
                            <b>{l.accuracy !== null ? `${Math.round(l.accuracy)}%` : '–'}</b>
                          </div>
                          <div className="rk-stat">
                            <small>Time</small>
                            <b>{l.timeMs !== null ? `${(l.timeMs / 1000).toFixed(1)}s` : '–'}</b>
                          </div>
                          <div className="rk-stat pts">
                            <small>Team</small>
                            {l.team && l.teamPoints !== null ? <b className="ts-pts">
                                  +{l.teamPoints}
                                  <span className="rk-u"> team pts</span>
                                </b> : <b>–</b>}
                          </div>
                        </div>
                      ) : (
                        <div className="rk-stats dnf">
                          <div className="rk-stat wide">
                            <small>
                              {Math.round(l.progress * 100)}% typed{l.dnfReason ? ` · ${REASON_SHORT[l.dnfReason]}` : ''}
                            </small>
                            <b>DNF</b>
                          </div>
                          <div className="rk-stat pts">
                            <small>Team</small>
                            {l.team && l.teamPoints !== null ? <b className="ts-pts zero">
                                  +0<span className="rk-u"> team pts</span>
                                </b> : <b>–</b>}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              </div>
            </section>

            <aside className="res-side">
              {myRow && (
                <section className="card res-me" aria-label="Your race">
                  <div className="res-h">
                    <h2 className="section-title">Your race</h2>
                    <span className={`pill ${youPlace ? 'pill-brand' : ''}`}>{youPlace ?? 'DNF'}</span>
                  </div>
                  <dl className="res-stats">
                    <div>
                      <dt>Final speed</dt>
                      <dd>
                        {Math.round(myRow.wpm)} <small>WPM</small>
                      </dd>
                    </div>
                    <div>
                      <dt>Accuracy</dt>
                      <dd>{Math.round(myRow.accuracy)}%</dd>
                    </div>
                    <div>
                      <dt>Time</dt>
                      <dd>{myRow.timeMs !== null ? `${(myRow.timeMs / 1000).toFixed(1)}s` : 'DNF'}</dd>
                    </div>
                    <div>
                      <dt>Global score</dt>
                      <dd>+{myRow.score}</dd>
                    </div>
                  </dl>
                  <div className="res-trophies">
                    <span className="won">
                      <IconTrophy width={15} height={15} />+{myRow.trophies} {myRow.trophies === 1 ? 'trophy' : 'trophies'}
                    </span>
                    <span>
                      Room total <b>{meInfo?.trophies ?? 0}</b>
                      {live && myRow.finished ? ' (updates when the race ends)' : ''}
                    </span>
                  </div>
                </section>
              )}

              {showTeams && (
                <section className="card res-teams" aria-label="Team results">
                  <div className="res-h">
                    <h2 className="section-title">
                      Team standings <span>after {room.match.races} {room.match.races === 1 ? 'race' : 'races'}</span>
                    </h2>
                  </div>
                  <TeamResults lines={teamLines} myTeam={myTeam} />
                </section>
              )}

              {room.players.some((p) => p.trophies > 0) && (
                <section className="card res-champ" aria-label="Room championship">
                  <div className="res-h">
                    <h2 className="section-title">Room championship</h2>
                  </div>
                  <ol className="res-champ-list">
                    {championship.map((p, i) => (
                      <li key={p.id} className={p.id === me ? 'me' : undefined}>
                        <span className="n">{i + 1}</span>
                        <span className="who">{p.name}</span>
                        <span className="t">
                          <IconTrophy width={14} height={14} />
                          {p.trophies}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </aside>
          </div>

          <div className="card res-actions">
            {!final ? (
              <div className="res-wait">
                <p>Waiting for the remaining drivers to finish — nobody is cut off just because someone else won.</p>
                {isHost && (
                  <button className="btn btn-danger" onClick={endRace}>
                    End race now · unfinished drivers become DNF
                  </button>
                )}
              </div>
            ) : isHost ? (
              <>
                <div className="res-actions-main">
                  <button className="btn btn-lg btn-primary" onClick={() => setPickingDifficulty(true)} disabled={driversOnline === 0} title={driversOnline === 0 ? 'No drivers are online' : undefined}>
                    Race again
                  </button>
                  <button className="btn btn-lg btn-secondary" onClick={backToLobby}>
                    Back to lobby
                  </button>
                  {room.match.races > 0 && !confirmingEnd && (
                    <button className="btn btn-lg btn-ghost res-end" onClick={() => setConfirmingEnd(true)}>
                      End match · declare the winning team
                    </button>
                  )}
                </div>
                {driversOnline === 0 && <p className="res-note">No drivers are online — a race needs at least one. The host watches and does not race.</p>}
                {room.match.races > 0 && confirmingEnd && (
                  <div className="res-confirm" role="alertdialog" aria-label="Confirm end match">
                    <p>End the match now and declare the winning team? The scores are final.</p>
                    <div>
                      <button className="btn btn-secondary" onClick={() => setConfirmingEnd(false)}>
                        Keep playing
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          setConfirmingEnd(false);
                          endMatch();
                        }}
                      >
                        End match
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="res-wait">
                <span className="spinner" />
                <p>Waiting for the host to start the next race…</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
