/** A one-shot burst of rays and a ring for a moment that deserves it (the spinner landing, points scored). Mount it with a fresh `key` to play it again. */
export function Burst({ tone = 'gold' }: { tone?: 'gold' | 'green' | 'red' }) {
  return (
    <div className={`arc-burst ${tone}`} aria-hidden>
      <i className="arc-burst-ring" />
      <i className="arc-burst-rays" />
    </div>
  );
}
