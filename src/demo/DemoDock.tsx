import { useEffect } from 'react';
import { IconEye, IconUsers, IconX } from '../components/Icons';
import { closeDemo, replayLobby, restartRace, setDemoView, showDemoTab, useDemo, type DemoTab } from './session';

const TABS: { id: DemoTab; label: string }[] = [
  { id: 'lobby', label: 'Lobby' },
  { id: 'race', label: 'Race' },
  { id: 'results', label: 'Results' },
];

/**
 * The control bar of the 40-player demo: a strip across the top of the window (the screens below it are the real ones, shown with
 * made-up data). It switches between the lobby, the race and the results, picks whose screen the race shows, and closes the demo.
 */
export function DemoDock() {
  const { open, tab, view, joined, total, finished } = useDemo();

  // the race screen sizes itself to the window below the bar (src/game/hooks.ts reads --demo-h)
  useEffect(() => {
    if (!open) return;
    document.documentElement.dataset.demo = 'on';
    return () => {
      delete document.documentElement.dataset.demo;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as Element | null)?.closest?.('[role="dialog"], [role="alertdialog"]')) closeDemo();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  return (
    <aside className="dd" aria-label="40-player demo controls">
      <div className="dd-badge" title="Everything on screen is made-up data: no room, no connection, no real player">
        <IconUsers width={15} height={15} />
        <b>Demo</b>
        <span>{total} players · mock data</span>
      </div>

      <div className="dd-tabs" role="group" aria-label="Demo screen">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`dd-tab${tab === t.id ? ' on' : ''}${t.id === 'results' && finished && tab === 'race' ? ' hot' : ''}`} aria-pressed={tab === t.id} onClick={() => showDemoTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="dd-extra">
        {tab === 'lobby' ? (
          <button type="button" className="dd-btn" onClick={replayLobby}>
            Replay joining <i>{joined}/{total}</i>
          </button>
        ) : (
          <div className="dd-view" role="group" aria-label="Whose screen">
            <span>View as</span>
            <button type="button" className={`dd-chip${view === 'host' ? ' on' : ''}`} aria-pressed={view === 'host'} onClick={() => setDemoView('host')}>
              <IconEye width={13} height={13} />
              Host
            </button>
            <button type="button" className={`dd-chip${view === 'driver' ? ' on' : ''}`} aria-pressed={view === 'driver'} onClick={() => setDemoView('driver')}>
              Driver
            </button>
          </div>
        )}
        {tab === 'race' && (
          <button type="button" className="dd-btn" onClick={restartRace}>
            Restart race
          </button>
        )}
      </div>

      <button type="button" className="dd-close" onClick={closeDemo} title="Close the demo (Esc)">
        <IconX width={14} height={14} />
        <span>Close demo</span>
      </button>
    </aside>
  );
}
