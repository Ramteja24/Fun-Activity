/** A circular countdown for the game-show screens: the ring empties as the time runs out and turns red at the end. */
export function TimerRing({ seconds, fraction, size = 76, label }: { seconds: number; fraction: number; size?: number; label?: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const low = seconds <= 5 && seconds > 0;
  const out = seconds === 0;
  return (
    <div className={`arc-ring${low ? ' low' : ''}${out ? ' out' : ''}`} style={{ width: size, height: size }} role="timer" aria-label={label ?? `${seconds} seconds left`}>
      <svg viewBox="0 0 80 80" aria-hidden>
        <circle className="arc-ring-track" cx="40" cy="40" r={r} />
        <circle className="arc-ring-bar" cx="40" cy="40" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, fraction)))} />
      </svg>
      <b>{out ? '0' : seconds}</b>
    </div>
  );
}
