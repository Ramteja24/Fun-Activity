import type { CSSProperties } from 'react';
import { BOARD_TEXT } from '../../brand';
import { Vehicle } from '../Vehicle';

// A miniature of the real race screen, staged like a broadcast shot of the track: floodlights, trackside sponsor
// boards (the same GANTEC / TYPE FAST / DRIVE FASTER set as the race screen), a kerb on each side of five lanes and a
// finish gantry. Cars further from the camera are smaller (lane depth).
// Everything moves inside this one card, with transforms only (so it stays light), and it is decorative → aria-hidden.

// Lane 0 is furthest from the camera, lane 4 the closest. You (green hatchback) lead in the foreground lane and the
// pack behind keeps swapping places. `x` is the start position (cqw), `dx` how far it drifts, `d` the drift time in
// seconds (long and eased, so the pack moves calmly). Cars sharing a lane are spaced so their drift ranges never
// overlap. `extra` cars are dropped on phones.
const CARS: { lane: number; v: number; x: number; dx: number; d: number; you?: boolean; extra?: boolean }[] = [
  { lane: 0, v: 4, x: 38, dx: -11, d: 16 },
  { lane: 1, v: 28, x: 9, dx: 12, d: 19, extra: true },
  { lane: 1, v: 1, x: 52, dx: 8, d: 13.5 },
  { lane: 2, v: 2, x: 22, dx: 14, d: 18 },
  { lane: 2, v: 36, x: 66, dx: -10, d: 17, extra: true },
  { lane: 3, v: 35, x: 10, dx: 10, d: 20, extra: true },
  { lane: 3, v: 3, x: 47, dx: -8, d: 14.5 },
  { lane: 4, v: 11, x: 20, dx: 14, d: 17.5, extra: true },
  { lane: 4, v: 0, x: 66, dx: 5, d: 15.5, you: true },
];
const WPM = [54, 61, 67, 72, 66, 58];
const TEXT = 'Carved by monumental glacial ice over thousands of years, emerald waters';

const vars = (v: Record<string, string | number>) => v as CSSProperties;

export function RaceScene() {
  return (
    <div className="sc" aria-hidden>
      <div className="sc-sky">
        <div className="sc-skyline" />
        <i className="sc-lamp" style={{ left: '14%' }} />
        <i className="sc-lamp" style={{ left: '47%' }} />
        <i className="sc-lamp" style={{ left: '74%' }} />
      </div>

      <div className="sc-wall">
        <div className="sc-boards">
          {Array.from({ length: 18 }, (_, i) => (
            <span key={i}>{BOARD_TEXT[i % BOARD_TEXT.length]}</span>
          ))}
        </div>
      </div>

      <div className="sc-kerb sc-kerb-t">
        <i />
      </div>

      <div className="sc-road">
        <div className="sc-ground">
          <i className="sc-pool" style={{ '--px': '14%' } as CSSProperties} />
          <i className="sc-pool" style={{ '--px': '47%' } as CSSProperties} />
          <i className="sc-pool hot" style={{ '--px': '87%' } as CSSProperties} />
          {[1, 2, 3, 4].map((k) => (
            <i key={k} className="sc-div" style={vars({ '--k': k })} />
          ))}
          <div className="sc-finish" />
        </div>
        {CARS.map((c) => (
          <div key={`${c.lane}-${c.v}`} className={`sc-car${c.extra ? ' extra' : ''}`} style={vars({ '--i': c.lane, '--x': `${c.x}cqw`, '--dx': c.dx, '--d': `${c.d}s` })}>
            <div className="sc-rig">
              <span className="sc-shadow" />
              <span className="sc-trail" />
              <span className="sc-beam" />
              <Vehicle index={c.v} className="sc-veh" />
              {c.you && <span className="sc-you">You</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="sc-kerb sc-kerb-b">
        <i />
      </div>

      <div className="sc-gate">
        <b>FINISH</b>
      </div>

      <div className="sc-hud">
        <div className="sc-pill">
          <span className="sc-wpm">
            <span className="sc-wpm-list">
              {WPM.map((n) => (
                <b key={n}>{n}</b>
              ))}
            </span>
          </span>
          <em>WPM</em>
        </div>
        <div className="sc-pill sc-pos">
          <em>POS</em>
          <b>1st</b>
        </div>
      </div>

      <div className="sc-type">
        <span className="sc-line">{TEXT}</span>
        <span className="sc-done">{TEXT}</span>
      </div>
    </div>
  );
}
