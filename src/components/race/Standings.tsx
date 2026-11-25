import { memo, useEffect, useReducer, useRef, useState } from 'react';
import type { PlayerInfo } from '../../../shared/protocol';
import { formatTime } from '../../../shared/game';
import { engine, useGame } from '../../store';
import { IconExit } from '../Icons';
import { Vehicle } from '../Vehicle';

/** With this many racers or more the list is redrawn a few times a second instead of on every update: forty rows, ten times a second, is more than a list that long needs. */
const BIG_FIELD = 15;
const BIG_REFRESH_MS = 400;

/** Everyone in the race, live, plus the Exit Race menu option and confirmation. */
export const Standings = memo(function Standings({ players, meId, onClose }: { players: PlayerInfo[]; meId: string; onClose?(): void }) {
  const leave = useGame((s) => s.leave);
  const [confirmingExit, setConfirmingExit] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // The list follows the engine itself (its parent no longer has to redraw it): on every update for a normal field, on a short timer for a big one.
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const big = engine.racers.size >= BIG_FIELD;
  useEffect(() => {
    if (big) {
      const id = window.setInterval(redraw, BIG_REFRESH_MS);
      return () => window.clearInterval(id);
    }
    return engine.subscribe(redraw);
  }, [big]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (menuRef.current?.contains(target) || target.closest('[data-standings-toggle]')) return;
      onClose?.();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmingExit) setConfirmingExit(false);
        else onClose?.();
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [confirmingExit, onClose]);

  const byId = new Map(players.map((p) => [p.id, p]));
  const rows = engine.standings();
  const len = Math.max(1, engine.len);
  return (
    <div className={`standings${rows.length > 14 ? ' big' : ''}`} ref={menuRef} role="dialog" aria-label="Live standings">
      <div className="standings-head">
        <b>Live standings</b>
        <span>{rows.length} racers</span>
      </div>
      <div className="standings-list">
        {rows.map((r, i) => {
          const p = byId.get(r.id);
          const done = r.fin > 0 && r.fin < Number.MAX_SAFE_INTEGER;
          const offline = !!p && !p.connected;
          return (
            <div key={r.id} className={`row${r.id === meId ? ' me' : ''}${i < 3 ? ` top${i + 1}` : ''}${p?.team ? ` tm-${p.team}` : ''}${offline ? ' offline' : ''}`}>
              <span className="pos-plate">{i + 1}</span>
              <div className="row-main">
                <div className="row-name">
                  <Vehicle index={p?.vehicle ?? 0} className="veh-xs" />
                  <span className="nm">
                    {p?.name ?? '—'}
                    {r.id === meId ? ' (you)' : ''}
                  </span>
                </div>
                <div className="bar">
                  <i style={{ width: `${Math.min(100, (r.pos / len) * 100)}%` }} />
                </div>
              </div>
              <span className={`row-val${done ? ' done' : ''}`}>{done ? formatTime(r.fin) : offline ? 'offline' : `${r.wpm} wpm`}</span>
            </div>
          );
        })}
      </div>

      <div className="standings-footer">
        {!confirmingExit ? (
          <button
            type="button"
            className="btn btn-danger btn-sm btn-block race-exit-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setConfirmingExit(true)}
          >
            <IconExit width={14} height={14} />
            <span>Exit race</span>
          </button>
        ) : (
          <div className="race-exit-confirm" role="alertdialog" aria-label="Confirm exit race">
            <p className="race-exit-prompt">Exit this race and return to the landing page?</p>
            <div className="race-exit-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm race-exit-cancel"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setConfirmingExit(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-solid-danger btn-sm race-exit-confirm-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onClose?.();
                  leave();
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
