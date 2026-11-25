import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createCountdownAudio, cueDueAt, FRESH_MS, GO_TAIL_MS, LATE_GRACE_MS, STAGES, type CountdownAudioEnv, type Stage } from '../src/audio/countdown-audio';
import { createMusic, DUCK_FACTOR, MUSIC_VOLUME, type AudioLike } from '../src/audio/controller';
import { countdownStage } from '../src/game/countdown';
import { STAGE_MS } from '../shared/protocol';

/** Move the mocked clock forward in small steps, like real time: a timer set while one fires still runs in this window. */
const advance = (ms: number) => {
  for (let done = 0; done < ms; done += 10) mock.timers.tick(Math.min(10, ms - done));
};


// The race-start sound effects: when each cue is scheduled against the server clock, that it is exactly the moment the
// visible number changes, that nothing ever plays twice (re-renders, StrictMode, reconnects, back-to-back races) or late,
// that muted / locked audio degrades quietly, that the music ducks and always comes back — and facts about the two WAVs.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

interface Played {
  stage: Stage;
  /** Server-clock time at which it was handed to the audio engine, and when it will sound. */
  scheduledAt: number;
  soundsAt: number;
  stopped: boolean;
}

function setup() {
  let t = 1_000_000;
  let locked = false;
  let wanted = true;
  const played: Played[] = [];
  const listeners = new Set<() => void>();
  const duckCalls: number[] = [];
  let unducks = 0;
  const env: CountdownAudioEnv = {
    now: () => t,
    play(stage, inMs) {
      if (locked) return null;
      const p: Played = { stage, scheduledAt: t, soundsAt: t + inMs, stopped: false };
      played.push(p);
      return { stop: () => void (p.stopped = true) };
    },
    wanted: () => wanted,
    duck: (ms) => void duckCalls.push(ms),
    unduck: () => void unducks++,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  const audio = createCountdownAudio(env);
  return {
    audio,
    played,
    duckCalls,
    listeners,
    unducks: () => unducks,
    advance: (ms: number) => void (t += ms),
    now: () => t,
    setLocked(v: boolean) {
      locked = v;
    },
    setWanted(v: boolean) {
      wanted = v;
    },
    changed: () => [...listeners].forEach((fn) => fn()),
    /** What is audible per stage: scheduled and not silenced. */
    live: () => STAGES.map((s) => played.filter((p) => p.stage === s && !p.stopped).length),
  };
}

const LEAD = 3600; // the server's default delay between "start" and the green light
const key = (goAt: number, id = 1) => `${id}@${goAt}`;

describe('cue timing', () => {
  test('a fresh race: 3 sounds as soon as it is announced, then 2, 1 and GO exactly when those lights show', () => {
    const s = setup();
    const goAt = s.now() + LEAD - 50; // announced ~50 ms after the server sent it
    s.audio.begin(key(goAt), goAt);
    const by = (stage: Stage) => s.played.find((p) => p.stage === stage)!;
    assert.deepEqual(STAGES.map((st) => s.played.filter((p) => p.stage === st).length), [1, 1, 1, 1], 'each cue exactly once');
    assert.equal(by(3).soundsAt, s.now(), '3: right now');
    assert.equal(by(2).soundsAt, goAt - 2 * STAGE_MS);
    assert.equal(by(1).soundsAt, goAt - STAGE_MS);
    assert.equal(by(0).soundsAt, goAt, 'GO: the green light itself');
    // …and each of those instants is precisely when `useCountdown` flips to that number (the same function drives both)
    for (const stage of [2, 1, 0] as const) {
      const at = by(stage).soundsAt;
      assert.equal(countdownStage(goAt, at), stage, `at the cue the light shows ${stage}`);
      assert.notEqual(countdownStage(goAt, at - 1), stage, `one millisecond earlier it does not`);
    }
    assert.equal(countdownStage(goAt, by(3).soundsAt), 3);
  });

  test('the audio never delays or drives the game: cues are only scheduled ahead on the audio clock, nothing waits on them', () => {
    const s = setup();
    const goAt = s.now() + LEAD;
    s.audio.begin(key(goAt), goAt);
    assert.ok(s.played.every((p) => p.scheduledAt === s.now()), 'all four handed over at once, up front (no timers to throttle)');
    assert.equal(s.played.length, 4);
  });

  test('the spacing between cues is the lights\' spacing, and GO is the last one', () => {
    assert.equal(cueDueAt(2, 10_000, 0), 10_000 - 2 * STAGE_MS);
    assert.equal(cueDueAt(1, 10_000, 0), 10_000 - STAGE_MS);
    assert.equal(cueDueAt(0, 10_000, 0), 10_000);
    assert.equal(cueDueAt(3, 10_000, 6_000), 6_000, 'fresh: now');
    assert.equal(cueDueAt(3, 10_000, 9_000), -Infinity, 'a race already under way has no 3');
    assert.ok(FRESH_MS < 3 * STAGE_MS && FRESH_MS > 2 * STAGE_MS, 'fresh = within a stage or so of being announced');
  });
});

describe('exactly once, never late', () => {
  test('begin() any number of times for one race (re-renders, StrictMode effects, a second effect run) schedules each cue once', () => {
    const s = setup();
    const goAt = s.now() + LEAD;
    for (let i = 0; i < 5; i++) s.audio.begin(key(goAt), goAt);
    assert.deepEqual(s.live(), [1, 1, 1, 1]);
    assert.equal(s.played.length, 4);
    assert.equal(s.listeners.size, 1, 'one listener, however often it began');
  });

  test('React StrictMode: begin → cleanup → begin leaves exactly one audible cue per stage, and the 3 is not repeated', () => {
    const s = setup();
    const goAt = s.now() + LEAD;
    const cleanup = s.audio.begin(key(goAt), goAt);
    cleanup(); // StrictMode runs the effect's clean-up before running the effect again
    s.audio.begin(key(goAt), goAt);
    assert.deepEqual(s.live(), [1, 1, 1, 1]);
    assert.equal(s.played.filter((p) => p.stage === 3).length, 1, 'the 3 that already sounded is not played again');
    assert.equal(s.played.filter((p) => p.stage === 0).length, 2, 'GO was re-scheduled (and the first copy silenced)');
    assert.equal(s.played.filter((p) => p.stage === 0 && p.stopped).length, 1);
  });

  test('a reconnect / refresh part-way through: only the cues still to come play, a cue whose moment has passed is never played late', () => {
    const goAt = 5_000_000;
    // 1.5 s before GO: 3 and 2 are history (the "2" light came on 700 ms ago); 1 and GO are ahead
    let s = setup();
    s.advance(goAt - LEAD - s.now() + (LEAD - 1500));
    s.audio.begin(key(goAt), goAt);
    assert.deepEqual(s.played.map((p) => [p.stage, p.soundsAt - s.now()]), [[1, 400], [0, 1500]]);
    // 2.15 s before GO: the "2" light came on 50 ms ago — within the grace, so it still sounds (at once)
    s = setup();
    s.advance(goAt - 2150 - s.now());
    s.audio.begin(key(goAt), goAt);
    assert.deepEqual(s.played.map((p) => [p.stage, p.soundsAt - s.now()]), [[2, 0], [1, 1050], [0, 2150]]);
    assert.ok(2200 - 2150 <= LATE_GRACE_MS);
    // 0.5 s after GO, or any later time: the countdown is over
    s = setup();
    s.advance(goAt + 500 - s.now());
    s.audio.begin(key(goAt), goAt);
    assert.equal(s.played.length, 0);
    assert.deepEqual(s.duckCalls, [], 'and the music is left alone');
  });

  test('a stale-but-recent reconnect never gets a late "3": only a freshly announced race has one', () => {
    const goAt = 5_000_000;
    const s = setup();
    s.advance(goAt - 2900 - s.now()); // "3" has been on screen for ~700 ms already
    s.audio.begin(key(goAt), goAt);
    assert.equal(s.played.some((p) => p.stage === 3), false);
  });

  test('back-to-back races each play every cue once; the next race never inherits (or is blocked by) the last one', () => {
    const s = setup();
    for (let race = 1; race <= 3; race++) {
      const goAt = s.now() + LEAD;
      s.audio.begin(key(goAt, race), goAt);
      assert.deepEqual(s.live(), [race, race, race, race], `race ${race}: one more of each, and nothing doubled`);
      s.advance(LEAD + 2500); // GO and the race itself go by
    }
    assert.equal(s.played.length, 12);
    // the same race id in another room is a different race (the key includes the green-light time)
    const goAt = s.now() + LEAD;
    s.audio.begin(key(goAt, 1), goAt);
    assert.equal(s.played.length, 16);
  });

  test('a new race starting before the last one\'s cues have sounded silences those and schedules its own', () => {
    const s = setup();
    const goA = s.now() + LEAD;
    s.audio.begin(key(goA, 1), goA);
    s.advance(1000); // mid-countdown: the host re-starts (or another room's race begins on this screen)
    const goB = s.now() + LEAD;
    s.audio.begin(key(goB, 2), goB);
    const stillToCome = s.played.filter((p) => p.soundsAt > s.now() && !p.stopped);
    assert.deepEqual(stillToCome.map((p) => p.soundsAt).sort(), [goB - 2 * STAGE_MS, goB - STAGE_MS, goB].sort(), 'only race B\'s cues remain ahead');
  });
});

describe('muted, locked, and leaving the screen', () => {
  test('audio still locked by the browser: nothing is scheduled, the music is not touched; when it unlocks the cues still ahead sound', () => {
    const s = setup();
    s.setLocked(true);
    const goAt = s.now() + LEAD;
    s.audio.begin(key(goAt), goAt);
    assert.equal(s.played.length, 0);
    assert.deepEqual(s.duckCalls, [], 'no sound → no ducking');
    s.advance(1700); // the player clicks 1.7 s in: the 2 came on 300 ms ago (too late to play), 1 and GO are still ahead
    s.setLocked(false);
    s.changed();
    assert.deepEqual(s.played.map((p) => p.stage), [1, 0]);
    s.changed();
    s.changed();
    assert.equal(s.played.length, 2, 'unlock notifications repeat harmlessly');
  });

  test('speaker off: silent, no ducking; switching it on mid-countdown plays what is still to come; switching it off stops it again', () => {
    const s = setup();
    s.setWanted(false);
    const goAt = s.now() + LEAD;
    s.audio.begin(key(goAt), goAt);
    assert.equal(s.played.length, 0);
    assert.deepEqual(s.duckCalls, []);
    s.advance(1000);
    s.setWanted(true);
    s.changed();
    assert.deepEqual(s.played.map((p) => p.stage), [2, 1, 0], '(the 3 is gone: it is no longer fresh)');
    assert.equal(s.duckCalls.length, 1);
    const before = s.unducks();
    s.advance(300);
    s.setWanted(false);
    s.changed();
    assert.deepEqual(s.live(), [0, 0, 0, 0], 'muted mid-countdown: everything still ahead is silenced');
    assert.equal(s.unducks(), before + 1, 'and the music is released');
  });

  test('leaving the race screen (clean-up) silences what has not sounded, releases the music and stops listening', () => {
    const s = setup();
    const goAt = s.now() + LEAD;
    const cleanup = s.audio.begin(key(goAt), goAt);
    s.advance(1500); // "3" has sounded; 2 (1400) too
    cleanup();
    assert.deepEqual(s.live(), [1, 1, 0, 0], 'only 1 and GO were still ahead');
    assert.equal(s.unducks(), 1);
    assert.equal(s.listeners.size, 0, 'no listener left behind');
    s.changed();
    assert.equal(s.played.length, 4, 'nothing is scheduled after leaving');
    cleanup(); // calling it twice is harmless
    assert.equal(s.listeners.size, 0);
  });

  test('the music is ducked for the whole sequence plus the GO tail — and only once per scheduling', () => {
    const s = setup();
    const goAt = s.now() + LEAD - 40;
    s.audio.begin(key(goAt), goAt);
    assert.deepEqual(s.duckCalls, [LEAD - 40 + GO_TAIL_MS]);
    s.audio.begin(key(goAt), goAt);
    assert.equal(s.duckCalls.length, 1, 'nothing new scheduled → no new duck');
  });
});

describe('with the real music controller', () => {
  class FakeAudio implements AudioLike {
    volume = 0;
    loop = false;
    preload = '';
    src = '';
    paused = true;
    async play() {
      this.paused = false;
    }
    pause() {
      this.paused = true;
    }
    addEventListener() {}
  }
  afterEach(() => mock.timers.reset());

  test('the music drops when the 3 sounds, stays low through GO, and is back to full about a second after — by itself', async () => {
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    const store = new Map<string, string>();
    const audio = new FakeAudio();
    const music = createMusic({
      createAudio: () => audio,
      storage: { get: (k) => store.get(k) ?? null, set: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) },
      onGesture: () => () => {},
    });
    music.setActive(true);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    advance(2000);
    assert.equal(audio.volume, MUSIC_VOLUME);

    let t = 0;
    const cues: CountdownAudioEnv['play'] = () => ({ stop() {} });
    const cd = createCountdownAudio({ now: () => t, play: cues, wanted: () => music.isEnabled(), duck: (ms) => music.duck(ms), unduck: () => music.unduck(), onChange: () => () => {} });
    cd.begin('1@3600', 3600); // the race is announced 3.6 s before GO
    advance(500);
    assert.ok(Math.abs(audio.volume - MUSIC_VOLUME * DUCK_FACTOR) < 1e-9, 'lowered under the beeps');
    advance(3100); // → GO
    assert.ok(Math.abs(audio.volume - MUSIC_VOLUME * DUCK_FACTOR) < 1e-9, 'still lowered at GO');
    advance(GO_TAIL_MS - 100); // the GO sound is still ringing
    assert.ok(Math.abs(audio.volume - MUSIC_VOLUME * DUCK_FACTOR) < 1e-9, 'still lowered while GO rings');
    advance(100); // the tail is over: the release starts…
    advance(1300); // …and the music eases back up over ~1.2 s
    assert.equal(audio.volume, MUSIC_VOLUME, 'restored without anyone asking');
    assert.equal(audio.paused, false, 'the track never stopped');
  });
});

// ------------------------------------------------------------------------------------------------ the shipped cues
function wavFacts(file: string) {
  const b = readFileSync(join(root, 'public', 'sfx', file));
  assert.equal(b.subarray(0, 4).toString(), 'RIFF');
  assert.equal(b.subarray(8, 16).toString(), 'WAVEfmt ');
  assert.equal(b.readUInt16LE(20), 1, 'PCM');
  assert.equal(b.readUInt16LE(22), 1, 'mono');
  assert.equal(b.readUInt32LE(24), 44100);
  assert.equal(b.readUInt16LE(34), 16);
  assert.equal(b.subarray(36, 40).toString(), 'data');
  const n = b.readUInt32LE(40) / 2;
  assert.equal(b.length, 44 + n * 2, 'header length matches the data');
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = b.readInt16LE(44 + i * 2) / 32768;
  const rms = (from: number, to: number) => {
    let sum = 0;
    for (let i = Math.round(from * 44100); i < Math.min(n, Math.round(to * 44100)); i++) sum += x[i]! * x[i]!;
    return 20 * Math.log10(Math.sqrt(sum / ((to - from) * 44100)));
  };
  const peak = 20 * Math.log10(Math.max(...x.map(Math.abs)));
  return { seconds: n / 44100, peak, rms, first: x[0]!, last: x[n - 1]!, bytes: b.length };
}

describe('the shipped countdown cues', () => {
  const beep = wavFacts('countdown-beep.wav');
  const go = wavFacts('countdown-go.wav');

  test('are real, short, uncompressed effects — not the background track and not silence', () => {
    assert.ok(beep.seconds > 0.2 && beep.seconds < 0.5, `${beep.seconds.toFixed(3)} s`);
    assert.ok(go.seconds > 0.8 && go.seconds < 1.6, `${go.seconds.toFixed(3)} s`);
    assert.ok(beep.bytes < 60_000 && go.bytes < 200_000, 'tiny next to the 6 MB soundtrack');
    for (const f of [beep, go]) {
      assert.ok(f.peak < -0.5 && f.peak > -6, `peak ${f.peak.toFixed(1)} dBFS: loud but never clipping`);
      assert.ok(f.rms(0, 0.1) > -16, `first 100 ms ${f.rms(0, 0.1).toFixed(1)} dBFS: audible punch on the very first samples`);
    }
  });

  test('start and end cleanly (no click) and the sound begins on the first sample, so a scheduled cue lands on time', () => {
    for (const f of [beep, go]) {
      assert.ok(Math.abs(f.first) < 0.02, 'starts from silence');
      assert.ok(Math.abs(f.last) < 0.01, 'ends at silence');
      assert.ok(f.rms(0.004, 0.02) > -20, 'already at full strength within 20 ms of the start (no silent lead-in)');
    }
  });

  test('GO is unmistakably the strongest, longest cue', () => {
    assert.ok(go.seconds > beep.seconds * 3);
    assert.ok(go.rms(0, 0.3) > beep.rms(0, 0.15) + 2, `GO ${go.rms(0, 0.3).toFixed(1)} vs beep ${beep.rms(0, 0.15).toFixed(1)} dBFS`);
  });
});

// ------------------------------------------------------------------------------------------------ wiring
describe('how the app uses it', () => {
  test('the race screen starts the sounds from the same goAt as the lights, once per race, and cleans up on leaving', () => {
    const race = read('src/screens/Race.tsx');
    assert.match(race, /useCountdown\(engine\.goAt\)/);
    assert.match(race, /return countdownAudio\.begin\(`\$\{raceId\}@\$\{goAt\}`, goAt\)/, 'keyed by race id + green-light time; returns the clean-up');
    assert.match(race, /\[active, raceId, goAt\]/);
  });

  test('the visible countdown and its sound read one definition of "which number is showing"', () => {
    assert.match(read('src/game/hooks.ts'), /countdownStage\(goAt, socket\.serverNow\(\), stageMs\)/);
    assert.match(read('src/audio/countdown-audio.ts'), /STAGE_MS/);
    assert.equal(countdownStage(1000, 1000 - 3 * STAGE_MS), 3);
    assert.equal(countdownStage(1000, 1000 - 2 * STAGE_MS), 2);
    assert.equal(countdownStage(1000, 1000 - STAGE_MS), 1);
    assert.equal(countdownStage(1000, 1000), 0);
    assert.equal(countdownStage(1000, 1000 + 1000), null);
    assert.equal(countdownStage(0, 5), null);
  });

  test('sound never reaches into the game: the engine, store, socket and server know nothing about audio', () => {
    for (const f of ['src/game/engine.ts', 'src/store.ts', 'src/net/socket.ts', 'server/room.ts', 'server/app.ts', 'shared/game.ts', 'shared/protocol.ts']) {
      assert.doesNotMatch(read(f), /audio\/|countdownAudio|sfx|music/i, f);
    }
  });

  test('the effects use one Web Audio context, load the two WAVs once, and only ever play them through scheduled sources', () => {
    const sfx = read('src/audio/sfx.ts');
    assert.equal((sfx.match(/new AC\(/g) ?? []).length, 1, 'one AudioContext');
    assert.match(sfx, /\/sfx\/countdown-beep\.wav/);
    assert.match(sfx, /\/sfx\/countdown-go\.wav/);
    assert.match(sfx, /source\.start\(ctx\.currentTime \+/, 'scheduled on the audio clock');
    assert.doesNotMatch(sfx, /f1-theme|\/music\//, 'the soundtrack is never used as a sound effect');
  });

  test('entering a room prepares the effects; the music follows the race', () => {
    const app = read('src/App.tsx');
    assert.match(app, /music\.setActive\(raceOn\)/);
    assert.match(app, /prepareSfx\(\)/);
    assert.match(app, /\[where\]/);
  });
});
