import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { PlayerInfo } from '../../../shared/protocol';
import type { TeamId } from '../../../shared/teams';
import { uiSound } from '../../audio/ui-sounds';
import {
  cellOf,
  clearSubRows,
  fieldGeometry,
  FOCUS_LANES,
  focusPpc,
  FOCUS_SPAN_CHARS,
  gridStagger,
  labelWidth,
  litCars,
  ME_SCALE,
  startSubRow,
  tightLabels,
  visualRow,
  ZOOM_FIT,
  ZOOM_FOCUS,
  type FieldGeometry,
  type FieldView,
  type LabelCar,
  type LaneCar,
} from '../../game/field';
import { engine } from '../../store';
import { Vehicle } from '../Vehicle';
import { Crowd } from './Crowd';

/** What the paint loop remembers about one car between frames — enough to turn typing into effects without any React re-render. */
interface CarFx {
  disp: number;
  /** a kick that each typed character adds to and time drains: the flame flares with every correct key */
  k: number;
  kStr: string;
  nStr: string;
  /** what was last written to the car (its transform and speed), so a frame only writes what changed */
  fStr: string;
  tf: string;
  rolling: boolean;
  nitro: boolean;
  /** which side of my car this one is on (−1 behind, +1 ahead, 0 not yet known) — a flip is an overtake */
  side: number;
  passUntil: number;
  /** full field: how far past the finish line the car has rolled on (it eases toward its parking place) */
  park: number;
}

/** Where a car sits on the full-field road: its lane (0 = top, counting mine), its place in the lane, and whether it is mine. */
interface Cell {
  row: number;
  slot: number;
  mine: boolean;
}

interface Props {
  players: PlayerInfo[];
  meId: string;
  /** Rendered inside the scenery band (position-change banners). */
  banner: ReactNode;
  /** Rendered over the road (countdown). */
  overlay: ReactNode;
  lanes: (string | null)[];
  boomSeq: number;
}

const STREAKS = Array.from({ length: 10 }, (_, i) => ({
  top: 6 + ((i * 37) % 86),
  w: 46 + ((i * 53) % 96),
  dur: 0.45 + ((i * 13) % 50) / 100,
  delay: -(((i * 17) % 100) / 100),
}));

/** How many cars have their full effects at once (wheels turning, a live flame): the ones in the middle of the action, and mine. */
const LIT_CARS = 12;

/** The view a driver last chose lasts for the rest of the visit, so it is still there for the next race. */
let lastView: FieldView = 'overview';

const Boom = memo(function Boom() {
  return (
    <div className="boom" aria-hidden>
      <span className="ring" />
      <span className="txt">BOOM!</span>
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
    </div>
  );
});

interface CarViewProps {
  id: string;
  index: number;
  register(id: string, el: HTMLDivElement | null): void;
  vehicle: number;
  name: string;
  team: TeamId | null;
  offline: boolean;
  isMe: boolean;
  field: boolean;
  row: number;
  cellMine: boolean;
  sub: number;
  subs: number;
  rank: number | undefined;
  myName: string;
  myRank: number | undefined;
  boomSeq: number;
}

/**
 * One car. Memoised: the race screen re-renders on every keystroke and every server update, but a car only re-renders when something it
 * shows changes (its place, name, team or connection). Its position and effects are written by the paint loop, never through React.
 */
const CarView = memo(function CarView({ id, index, register, vehicle, name, team, offline, isMe, field, row, cellMine, sub, subs, rank, myName, myRank, boomSeq }: CarViewProps) {
  const style = (
    field
      ? { '--row': row, '--sub': cellMine ? 0 : sub, '--subs': cellMine ? 1 : subs, '--mult': cellMine ? ME_SCALE : 1 }
      : { ['--i' as string]: index }
  ) as CSSProperties;
  return (
    <div ref={(el) => register(id, el)} className={`car${offline ? ' offline' : ''}${team ? ` tm-${team}` : ''}${field && isMe ? ' me' : ''}`} style={style}>
      {isMe && <div className="aura" />}
      {field && isMe && <div className="me-frame" aria-hidden />}
      <div className="trail" />
      <div className="flame" />
      <div className="nitro-jet" />
      <div className="beam" />
      <Vehicle index={vehicle} className="vehicle" />
      {isMe ? (
        <div className="you-tag">
          {field ? (
            <>
              <b>YOU</b> · {myName}
              <i className="rk">{myRank ?? '·'}</i>
            </>
          ) : (
            'You'
          )}
        </div>
      ) : (
        <div className="name-tag">
          {field && <b className="rk">{rank ?? '·'}</b>}
          <span className="nm">{name}</span>
        </div>
      )}
      {isMe && boomSeq > 0 && <Boom key={boomSeq} />}
    </div>
  );
});

/**
 * Scenery + road + cars. Cars are positioned straight from the engine in a requestAnimationFrame loop
 * (no React re-render per frame). The camera follows the local player; rivals are drawn relative to you,
 * so slower racers slide off the left edge and faster ones off the right — as in the reel. A spectator (the host) has
 * no car: the camera follows the leader and the five lanes show the five leading drivers.
 *
 * A big grid (13 racers or more, see game/field.ts) is drawn differently: EVERY racer has a car, in ten lanes with up to a few cars
 * each, and the whole field is framed. A lane is cut into two or three sub-rows and cars step between them so that neighbours never
 * overlap. Each car carries its place, its name and its team colour. A driver's own car is not in those lanes: it has a lane of its
 * own in the middle of the road, is 1.4× the size, glows cyan and gold and carries a floating "YOU" label. A driver can switch between
 * "Overview" (all the cars) and "Driver focus" (the camera follows their car, closer in). The same engine numbers drive every car —
 * nothing is made up.
 */
export function Track({ players, meId, banner, overlay, lanes, boomSeq }: Props) {
  const roadRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const crowdRef = useRef<HTMLDivElement>(null);
  const boardsRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const finishRef = useRef<HTMLDivElement>(null);
  const streaksRef = useRef<HTMLDivElement>(null);
  const stripes = useRef<HTMLElement[]>([]);
  const carRefs = useRef(new Map<string, HTMLDivElement>());
  const fx = useRef(new Map<string, CarFx>());
  const registerCar = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) carRefs.current.set(id, el);
    else carRefs.current.delete(id);
  }, []);
  const lastRoad = useRef({ dash: '', pool: '', streak: '' });
  // crowdW = width of one crowd tile, boardsP = length of one repeating set of sponsor boards (both in px): the scenery
  // is slid by the player's progress modulo these, so it loops without a seam.
  const metrics = useRef({ w: 800, h: 500, fl: 0, laneH: 56, crowdW: 0, boardsP: 0 });
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  // the full field: the geometry of the road for this many cars, and which car is in which lane (both fixed while the race runs)
  const hasMe = !engine.spectating && lanes.includes(meId);
  const geo: FieldGeometry | null = engine.field ? fieldGeometry(lanes.length, hasMe) : null;
  const geoRef = useRef<FieldGeometry | null>(geo);
  geoRef.current = geo;
  const cells = useMemo(() => {
    const m = new Map<string, Cell>();
    if (!geo) return m;
    let j = 0;
    for (const id of lanes) {
      if (!id) continue;
      if (geo.mine && id === meId) {
        m.set(id, { row: geo.myRow, slot: 0, mine: true });
        continue;
      }
      const c = cellOf(j++, geo.rows);
      m.set(id, { row: visualRow(c.row, geo), slot: c.slot, mine: false });
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanes, meId, geo?.rows, geo?.mine, geo?.myRow]);
  const cellsRef = useRef(cells);
  cellsRef.current = cells;

  const xOf = useRef(new Map<string, number>());
  const subOf = useRef(new Map<string, number>());
  const parkIdx = useRef(new Map<string, number>());
  const classOf = useRef({ tight: new Set<string>(), lit: new Set<string>(), first: null as string | null });
  const lastOrder = useRef(0);
  const viewY = useRef(0);
  // "Driver focus": the scale that keeps my nearest rivals on screen (worked out ten times a second, eased every frame)
  const focusScale = useRef({ target: 0, now: 0 });

  // the camera: the host and "Overview" frame the whole field; "Driver focus" follows my car, closer in
  const [view, setView] = useState<FieldView>(lastView);
  const focus = !!geo?.mine && view === 'focus';
  const viewRef = useRef<FieldView>('overview');
  viewRef.current = focus ? 'focus' : 'overview';
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    engine.zoom = zoom;
  }, [zoom]);
  useEffect(() => {
    engine.overview = !focus;
    focusScale.current = { target: 0, now: 0 };
    lastView = focus ? 'focus' : 'overview';
    setZoom(1);
    // switching never touches the race: only the camera and the size of the lanes change (a short fade hides the jump)
    const layer = layerRef.current;
    if (layer) {
      layer.classList.remove('swap');
      void layer.offsetWidth;
      layer.classList.add('swap');
    }
  }, [focus]);
  const ranks = geo ? new Map(engine.standings().map((r, i) => [r.id, i + 1])) : null;
  const myRank = ranks?.get(meId);

  useEffect(() => {
    const road = roadRef.current;
    if (!road) return;
    const measure = () => {
      const w = road.clientWidth;
      const h = road.clientHeight;
      const g = geoRef.current;
      // normal view: five lanes. Full field: "Overview" fits every lane on the road; "Driver focus" shows about FOCUS_LANES of them.
      const lanesShown = g ? (viewRef.current === 'focus' ? FOCUS_LANES : g.total) : 5;
      const fl = g ? Math.max(10, h / lanesShown) : 0;
      if (g) road.style.setProperty('--fl', `${fl.toFixed(2)}px`);
      const laneH = g ? Math.max(8, fl * g.scale) : Math.max(24, h / 5);
      const tile = crowdRef.current?.firstElementChild;
      const boards = boardsRef.current?.children;
      metrics.current = {
        w,
        h,
        fl,
        laneH,
        crowdW: tile ? tile.getBoundingClientRect().width : 0,
        boardsP: boards && boards.length > 3 ? boards[3]!.getBoundingClientRect().left - boards[0]!.getBoundingClientRect().left : 0,
      };
      // Keep the whole starting grid (5 staggered cars) on screen even on narrow phones.
      engine.baseAnchor = Math.min(0.5, Math.max(0.28, ((g ? 3.4 : 3.8) * laneH * (g?.mine ? ME_SCALE : 1) + 8) / Math.max(1, w)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(road);
    return () => ro.disconnect();
  }, [geo?.total, geo?.scale, geo?.mine, focus]);

  // full field: the lane lines and kerbs that slide with the road (written directly, see paint)
  useEffect(() => {
    stripes.current = [...(roadRef.current?.querySelectorAll<HTMLElement>('.lane-line, .kerb') ?? [])];
    lastRoad.current = { dash: '', pool: '', streak: '' };
  }, [geo?.total]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      engine.frame(dt);
      paint(now, dt);
      raf = requestAnimationFrame(loop);
    };
    const setClass = (id: string, name: string, on: boolean) => carRefs.current.get(id)?.classList.toggle(name, on);
    /**
     * The full field, ten times a second:
     *  · a car that comes within a car's length of another in its own sub-row steps into a clear one (so the cars of a lane never sit on top
     *    of each other);
     *  · a label that would lie on the car behind shrinks to the place alone, so no name is ever printed over another car;
     *  · the cars that have finished roll on past the line one after another;
     *  · the cars in the middle of the action (and mine) get their full effects; the leader is marked.
     */
    const reorder = (g: FieldGeometry, now: number, carW: number, fontPx: number) => {
      if (now - lastOrder.current < 100) return;
      lastOrder.current = now;
      const rowCars = new Map<number, LaneCar[]>();
      const cs = cellsRef.current;
      for (const id of engine.lanes) {
        if (!id) continue;
        const cell = cs.get(id);
        if (!cell || cell.mine) continue;
        const list = rowCars.get(cell.row) ?? [];
        list.push({ id, x: xOf.current.get(id) ?? 0, sub: subOf.current.get(id) ?? startSubRow(cell.slot, g.subs) });
        rowCars.set(cell.row, list);
      }
      const tight = new Set<string>();
      for (const cars of rowCars.values()) {
        for (const c of cars) subOf.current.set(c.id, c.sub);
        for (const [id, sub] of clearSubRows(cars, g.subs, carW * 0.95)) {
          subOf.current.set(id, sub);
          carRefs.current.get(id)?.style.setProperty('--sub', String(sub));
        }
        // labels: in each sub-row, a label that a closer car behind would be printed on shrinks to the place
        for (let sub = 0; sub < g.subs; sub++) {
          const inSub: LabelCar[] = cars
            .filter((c) => (subOf.current.get(c.id) ?? c.sub) === sub)
            .map((c) => ({ id: c.id, x: c.x, label: labelWidth(engine.names.get(c.id) ?? '', fontPx) }));
          for (const id of tightLabels(inSub, carW)) tight.add(id);
        }
        // the finishers of a lane, in the order they crossed the line
        cars
          .filter((c) => (engine.racers.get(c.id)?.fin ?? 0) > 0)
          .sort((p, q) => engine.racers.get(p.id)!.fin - engine.racers.get(q.id)!.fin)
          .forEach((c, k) => parkIdx.current.set(c.id, k));
      }
      const mem = classOf.current;
      for (const id of new Set([...mem.tight, ...tight])) {
        if (tight.has(id) !== mem.tight.has(id)) setClass(id, 'tight', tight.has(id));
      }
      mem.tight = tight;
      // effects budget: the nearest cars to the camera's focus (the leader when the whole field is framed, me in "Driver focus")
      const at = engine.cameraPos();
      const lit = litCars(
        engine.lanes.filter((id): id is string => !!id).map((id) => ({ id, at: engine.racers.get(id)?.disp ?? 0 })),
        at,
        LIT_CARS,
        g.mine ? engine.meId : null,
      );
      for (const id of new Set([...mem.lit, ...lit])) {
        if (lit.has(id) !== mem.lit.has(id)) setClass(id, 'lit', lit.has(id));
      }
      mem.lit = lit;
      const mine = engine.racers.get(engine.meId);
      if (mine && viewRef.current === 'focus') {
        const deltas: number[] = [];
        for (const r of engine.racers.values()) if (r.id !== mine.id) deltas.push(r.disp - mine.disp);
        focusScale.current.target = focusPpc(deltas, metrics.current.w, engine.anchor, carW * ME_SCALE);
        if (!focusScale.current.now) focusScale.current.now = focusScale.current.target;
      }
      const first = engine.standings()[0]?.id ?? null;
      if (first !== mem.first) {
        if (mem.first) setClass(mem.first, 'first', false);
        if (first) setClass(first, 'first', true);
        mem.first = first;
      }
    };
    const paint = (now: number, dt: number) => {
      const road = roadRef.current;
      if (!road) return;
      const g = geoRef.current;
      const { w, h, fl, laneH, crowdW, boardsP } = metrics.current;
      const carW = laneH * 1.8;
      const focusing = !!g && viewRef.current === 'focus';
      let ppc = g ? Math.max(9, laneH * 0.42) : laneH * 0.42; // pixels per character of progress
      // Whenever the camera frames the whole field (the host; a driver's "Overview") the road zooms out just enough to fit the last car
      // behind the leader (never below 15 % of the normal scale — 6 % with a full field — so a long tail simply runs off the left edge).
      // (the margin of two lane heights is the starting grid's stagger)
      if (engine.fitting) ppc = Math.max(ppc * (g ? 0.06 : 0.15), Math.min(ppc, (w * engine.anchor - carW - laneH * 2 - 4) / Math.max(1, engine.fieldSpan())));
      // "Driver focus": a fixed stretch of the passage across the road, centred on my car
      if (focusing) {
        const fs = focusScale.current;
        if (fs.target > 0) fs.now += (fs.target - fs.now) * (1 - Math.exp(-dt * 3));
        ppc = fs.now > 0 ? fs.now : w / FOCUS_SPAN_CHARS;
      }
      // the zoom buttons (full field only)
      if (g) ppc *= engine.zoom;
      // The camera follows my own car — or, when it frames the whole field, the leader.
      const camX = engine.cameraPos() * ppc - w * engine.anchor;
      if (g) reorder(g, now, carW, Math.max(10, laneH * 0.3));
      // "Driver focus" also scrolls the road up and down so that my lane is in the middle; "Overview" shows every lane
      if (g && layerRef.current) {
        const target = focusing && g.mine ? Math.max(h - g.total * fl, Math.min(0, h / 2 - (g.myRow + 0.5) * fl)) : 0;
        viewY.current += (target - viewY.current) * (1 - Math.exp(-dt * 6));
        layerRef.current.style.transform = `translate3d(0,${viewY.current.toFixed(1)}px,0)`;
      }
      const cs = cellsRef.current;

      engine.lanes.forEach((id, i) => {
        if (!id) return;
        const el = carRefs.current.get(id);
        if (!el) return;
        const r = engine.racers.get(id);
        const disp = r ? r.disp : 0;
        const cell = cs.get(id);
        const size = cell?.mine ? ME_SCALE : 1;
        // Staggered starting grid that closes up over the first few characters.
        let stagger: number;
        if (g) {
          stagger = cell && !cell.mine ? gridStagger(cell.slot, cell.row) * carW * (1 - Math.min(1, disp / 6)) : 0;
        } else {
          stagger = i * 0.5 * laneH * (1 - Math.min(1, disp / 6));
        }
        // full field: a car that has crossed the line rolls on past it to its parking place, so finishers do not pile up on one spot
        let park = 0;
        if (g) {
          const s = fx.current.get(id);
          const goal = (r?.fin ?? 0) > 0 ? (0.25 + (parkIdx.current.get(id) ?? 0) * 1.1) * carW : 0;
          if (s) {
            s.park += (goal - s.park) * Math.min(1, dt * 2.2);
            park = s.park;
          }
        }
        const x = disp * ppc - stagger - camX - carW * size + park;
        if (g) xOf.current.set(id, x);
        const tf = `translate3d(${x.toFixed(1)}px,0,0)`;
        const wpm = id === engine.meId ? engine.wpmSmooth : (r?.wpm ?? 0);
        // only what changed is written: every write to a car re-styles all of its parts
        // in a full field, a car without full effects only shows its speed coarsely (a short trail, its name tag's offset): coarse steps
        // there mean its whole drawing is re-styled a few times a race instead of several times a second
        const steps = g && id !== engine.meId && !classOf.current.lit.has(id) ? 4 : 20;
        const fStr = (Math.round(Math.min(1.15, wpm / 80) * steps) / steps).toFixed(2);
        let s = fx.current.get(id);
        if (!s) {
          s = { disp, k: 0, kStr: '', nStr: '', fStr: '', tf: '', rolling: false, nitro: false, side: 0, passUntil: 0, park: 0 };
          fx.current.set(id, s);
        }
        if (tf !== s.tf) {
          s.tf = tf;
          el.style.transform = tf;
        }
        if (fStr !== s.fStr) {
          s.fStr = fStr;
          el.style.setProperty('--f', fStr);
        }
        paintFx(id, el, disp, wpm, now, dt);
      });

      if (gridRef.current) gridRef.current.style.transform = `translate3d(${(-camX).toFixed(1)}px,0,0)`;
      if (finishRef.current) finishRef.current.style.transform = `translate3d(${(engine.len * ppc - camX).toFixed(1)}px,0,0)`;
      const dash = `${(-(engine.scroll % 64)).toFixed(1)}px`;
      const pool = `${(-(engine.scroll % 384)).toFixed(1)}px`; // the floodlight pools on the asphalt repeat every 384 px
      const streak = String(Math.max(0, Math.min(1, (engine.wpmSmooth - 55) / 35)).toFixed(2));
      // A custom property written on the road would be re-computed for every part of every car, every frame: the values go straight to
      // the few elements that show them (the asphalt, the lane lines and kerbs, the streaks), and only when they change.
      const lr = lastRoad.current;
      if (pool !== lr.pool) {
        lr.pool = pool;
        road.style.backgroundPosition = `${pool} 0, ${pool} 0, 0 0, 0 0, 0 0, 0 0`;
      }
      if (dash !== lr.dash) {
        lr.dash = dash;
        for (const el of stripes.current) el.style.backgroundPosition = `${dash} 0`;
      }
      if (streak !== lr.streak) {
        lr.streak = streak;
        if (streaksRef.current) streaksRef.current.style.opacity = streak;
      }
      // Parallax: the stands are far away (slow), the sponsor boards stand at the track edge (nearly road speed).
      if (crowdRef.current && crowdW > 0) crowdRef.current.style.transform = `translate3d(${((-(engine.scroll * 0.35)) % crowdW).toFixed(1)}px,0,0)`;
      if (boardsRef.current && boardsP > 0) boardsRef.current.style.transform = `translate3d(${((-(engine.scroll * 0.8)) % boardsP).toFixed(1)}px,0,0)`;
    };
    // Effects of typing, per car: the wheels roll while it moves, the flame flares with each correct character (--k), a fast car
    // lights its nitro (--n and the .nitro class), and a car that swaps places with mine gets a short .pass flash. Only classes
    // and CSS variables change (and only when their value does), so this is cheap and never touches React.
    const paintFx = (id: string, el: HTMLDivElement, disp: number, wpm: number, now: number, dt: number) => {
      const s = fx.current.get(id)!;
      const step = disp - s.disp;
      s.disp = disp;
      const field = !!geoRef.current;
      // (the full field flares only the flames of my car and of the cars with full effects: forty custom properties changing every frame is what a crowded road cannot afford)
      const flares = !field || id === engine.meId || classOf.current.lit.has(id);
      s.k = flares ? Math.min(1, s.k * Math.exp(-dt * 7) + Math.max(0, Math.min(3, step)) * 0.9) : 0;
      const n = Math.max(0, Math.min(1, (wpm - 38) / 55));
      // rounded: a value that changes a little every frame would re-time the flame and wheel animations every frame
      const kStr = (Math.round(s.k * 10) / 10).toFixed(1);
      const nStr = (Math.round(n * 20) / 20).toFixed(2);
      if (kStr !== s.kStr) {
        s.kStr = kStr;
        el.style.setProperty('--k', kStr);
      }
      if (nStr !== s.nStr) {
        s.nStr = nStr;
        el.style.setProperty('--n', nStr);
      }
      const rolling = wpm > 3 || step > 0;
      if (rolling !== s.rolling) {
        s.rolling = rolling;
        el.classList.toggle('rolling', rolling);
      }
      const nitro = s.nitro ? n > 0.42 : n > 0.62;
      if (nitro !== s.nitro) {
        s.nitro = nitro;
        el.classList.toggle('nitro', nitro);
      }

      // overtaking: compare this car with mine (a spectator has no car of their own, so there is nothing to compare)
      const meId = engine.meId;
      const mine = id !== meId ? engine.racers.get(meId) : undefined;
      if (mine) {
        const gap = disp - mine.disp;
        const side = gap > 0.8 ? 1 : gap < -0.8 ? -1 : s.side;
        if (s.side !== 0 && side !== s.side && !engine.spectating) {
          // side 1: this car just went past me; side −1: I just went past it
          const who = side === 1 ? el : carRefs.current.get(meId);
          if (who) {
            // restart the flash on the next frame (reading offsetWidth here would force a layout of the whole page mid-frame)
            who.classList.remove('pass');
            requestAnimationFrame(() => who.classList.add('pass'));
            const mineFx = fx.current.get(side === 1 ? id : meId);
            if (mineFx) mineFx.passUntil = now + 900;
          }
          if (side === -1) uiSound.whoosh();
        }
        s.side = side;
      }
    };
    const clearPass = window.setInterval(() => {
      const now = performance.now();
      fx.current.forEach((s, id) => {
        if (s.passUntil && now > s.passUntil) {
          s.passUntil = 0;
          carRefs.current.get(id)?.classList.remove('pass');
        }
      });
    }, 250);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(clearPass);
    };
  }, []);

  const fit = !focus;
  const steps = fit ? ZOOM_FIT : ZOOM_FOCUS;
  const stepAt = Math.max(0, steps.findIndex((z) => z === zoom));
  const zoomLabel = zoom === 1 ? (fit ? 'Fit all' : '100%') : fit ? `×${zoom}` : `${Math.round(zoom * 100)}%`;
  const noFocus = (e: { preventDefault(): void }) => e.preventDefault(); // a button must not take the keyboard from the typing field
  const prog = Math.round(Math.min(1, engine.hud.progress) * 100);
  const myName = byId.get(meId)?.name ?? '';

  return (
    <>
      <div className="scenery">
        <Crowd crowdRef={crowdRef} boardsRef={boardsRef} />
        <div className="edge" />
        {banner}
      </div>
      <div
        className={`road${geo ? ' field' : ''}${focus ? ' focus' : ''}`}
        ref={roadRef}
        style={geo ? ({ '--rows': geo.rows, '--total': geo.total, '--subs': geo.subs, '--s': geo.scale, '--mult': ME_SCALE } as CSSProperties) : undefined}
      >
        <i className="kerb kerb-t" />
        <i className="kerb kerb-b" />
        {/* the lanes, cars and finish line are one layer: in "Driver focus" it is taller than the road and scrolls to keep my lane in the middle */}
        <div className={geo ? 'lanes-layer' : 'lanes-plain'} ref={layerRef}>
          {geo && geo.mine && <div className="my-lane" style={{ top: `calc(var(--fl) * ${geo.myRow})` }} aria-hidden />}
          {Array.from({ length: (geo?.total ?? 5) - 1 }, (_, k) => (
            <div key={k} className="lane-line" style={{ top: geo ? `calc(var(--fl) * ${k + 1})` : `${((k + 1) * 100) / 5}%` }} />
          ))}
          <div className="clip">
            <div className="grid-group" ref={gridRef}>
              <div className="checker" />
              {!geo &&
                [0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="slot" style={{ ['--i' as string]: i }}>
                    {i + 1}
                  </div>
                ))}
            </div>
            <div className="streaks" ref={streaksRef}>
              {STREAKS.map((s, i) => (
                <i key={i} style={{ top: `${s.top}%`, width: s.w, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }} />
              ))}
            </div>
          </div>
          <div className="finish-group" ref={finishRef}>
            <div className="finish-sign">FINISH</div>
            <div className="checker" />
          </div>
          <div className="clip" style={{ pointerEvents: 'none' }}>
            {lanes.map((id, i) => {
              if (!id) return null;
              const p = byId.get(id);
              const isMe = id === meId;
              const cell = geo ? cells.get(id) : undefined;
              return (
                <CarView
                  key={id}
                  id={id}
                  index={i}
                  register={registerCar}
                  vehicle={p?.vehicle ?? 0}
                  name={p?.name ?? '—'}
                  team={geo ? (p?.team ?? null) : null}
                  offline={!!p && !p.connected}
                  isMe={isMe}
                  field={!!geo}
                  row={cell?.row ?? 0}
                  cellMine={!!cell?.mine}
                  sub={cell && !cell.mine && geo ? (subOf.current.get(id) ?? startSubRow(cell.slot, geo.subs)) : 0}
                  subs={geo?.subs ?? 1}
                  rank={geo ? ranks?.get(id) : undefined}
                  myName={isMe ? myName : ''}
                  myRank={isMe ? myRank : undefined}
                  boomSeq={isMe ? boomSeq : 0}
                />
              );
            })}
          </div>
        </div>
        {geo && (
          <div className="road-ctl">
            {geo.mine && (
              <div className="view-ctl" role="group" aria-label="Camera view">
                <button type="button" className={fit ? 'on' : ''} aria-pressed={fit} onClick={() => setView('overview')} onMouseDown={noFocus} onTouchStart={noFocus}>
                  Overview
                </button>
                <button type="button" className={focus ? 'on' : ''} aria-pressed={focus} onClick={() => setView('focus')} onMouseDown={noFocus} onTouchStart={noFocus}>
                  Driver focus
                </button>
              </div>
            )}
            <div className="zoom-ctl" role="group" aria-label="Camera zoom">
              <button type="button" aria-label="Zoom out" disabled={stepAt <= 0} onClick={() => setZoom(steps[Math.max(0, stepAt - 1)]!)} onMouseDown={noFocus} onTouchStart={noFocus}>
                −
              </button>
              <button type="button" className="zoom-val" aria-label={fit ? 'Fit every car on screen' : 'Reset the zoom'} onClick={() => setZoom(1)} onMouseDown={noFocus} onTouchStart={noFocus}>
                {zoomLabel}
              </button>
              <button type="button" aria-label="Zoom in" disabled={stepAt >= steps.length - 1} onClick={() => setZoom(steps[Math.min(steps.length - 1, stepAt + 1)]!)} onMouseDown={noFocus} onTouchStart={noFocus}>
                +
              </button>
            </div>
          </div>
        )}
        {geo && geo.mine && (
          <div className="my-prog" role="progressbar" aria-label="My progress" aria-valuenow={prog} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${prog}%` }} />
            <span>
              <b>P{myRank ?? '·'}</b>
              <small>/{engine.hud.total}</small>
              <em>{prog}%</em>
            </span>
          </div>
        )}
        {overlay}
      </div>
    </>
  );
}
