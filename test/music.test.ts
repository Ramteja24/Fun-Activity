import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createMusic, DUCK_FACTOR, MUSIC_PREF_KEY, MUSIC_SRC, MUSIC_VOLUME, MUSIC_VOLUME_KEY, type AudioLike, type MusicEnv } from '../src/audio/controller';

/** Move the mocked clock forward in small steps, like real time: a timer set while one fires still runs in this window. */
const advance = (ms: number) => {
  for (let done = 0; done < ms; done += 10) mock.timers.tick(Math.min(10, ms - done));
};


// The background-music controller with a fake <audio> element, fake storage and fake user gestures, under virtual time;
// then facts about the shipped MP3 and how the app is wired to it.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

class FakeAudio implements AudioLike {
  volume = 1;
  loop = false;
  preload = '';
  src = '';
  paused = true;
  playCalls = 0;
  pauseCalls = 0;
  /** What the next play() does: start, be refused until a gesture (NotAllowedError), or fail for another reason. */
  playMode: 'ok' | 'blocked' | 'error' = 'ok';
  /** Hold play() pending until `release()` — for "muted while the request was in flight". */
  hold: Promise<void> | null = null;
  release: () => void = () => {};
  private readonly handlers = new Map<string, (() => void)[]>();
  volumes: number[] = [];

  async play(): Promise<void> {
    this.playCalls += 1;
    if (this.hold) await this.hold;
    if (this.playMode === 'blocked') throw Object.assign(new Error('play() blocked'), { name: 'NotAllowedError' });
    if (this.playMode === 'error') throw Object.assign(new Error('decode failed'), { name: 'NotSupportedError' });
    this.paused = false;
    this.emit('playing');
  }
  pause(): void {
    this.pauseCalls += 1;
    if (this.paused) return;
    this.paused = true;
    this.emit('pause');
  }
  addEventListener(type: string, fn: () => void): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  emit(type: string): void {
    for (const fn of this.handlers.get(type) ?? []) fn();
  }
}

function setup(stored: string | null = null, playMode: FakeAudio['playMode'] = 'ok') {
  const audios: FakeAudio[] = [];
  const store = new Map<string, string>();
  if (stored !== null) store.set(MUSIC_PREF_KEY, stored);
  const gestureHandlers = new Set<(fromToggle: boolean) => void>();
  const warnings: string[] = [];
  const env: MusicEnv = {
    createAudio() {
      const a = new FakeAudio();
      a.playMode = playMode;
      audios.push(a);
      return a;
    },
    storage: {
      get: (k) => store.get(k) ?? null,
      set: (k, v) => void store.set(k, v),
      remove: (k) => void store.delete(k),
    },
    onGesture(fn) {
      gestureHandlers.add(fn);
      return () => gestureHandlers.delete(fn);
    },
    warn: (m) => void warnings.push(m),
  };
  const music = createMusic(env);
  const fire = (fromToggle = false) => [...gestureHandlers].forEach((h) => h(fromToggle));
  return { music, env, audios, store, gestureHandlers, warnings, fire };
}
const settle = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve(); // let play() promises resolve
};

describe('background music controller', () => {
  let current: ReturnType<typeof setup> | null = null;
  afterEach(() => {
    current?.music.dispose();
    current = null;
    mock.timers.reset();
  });
  const make = (stored: string | null = null, record = false, playMode: FakeAudio['playMode'] = 'ok') => {
    mock.timers.reset(); // a test may build more than one player
    mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
    current?.music.dispose();
    current = setup(stored, playMode);
    if (record) {
      // record every volume the audio element is set to
      const orig = current.env.createAudio;
      current.env.createAudio = () => {
        const a = orig() as FakeAudio;
        let v = a.volume;
        Object.defineProperty(a, 'volume', { get: () => v, set: (n: number) => { v = n; a.volumes.push(n); }, configurable: true });
        return a;
      };
    }
    return current;
  };

  test('the default volume is a quiet bed under the race: audible, but low', () => {
    assert.ok(MUSIC_VOLUME >= 0.08 && MUSIC_VOLUME <= 0.15, String(MUSIC_VOLUME));
  });

  test('starts when a race begins: one looping element with the full-length track, volume fades in from 0 (no jump) to the background level', async () => {
    const s = make(null, true);
    s.music.setActive(true);
    await settle();
    assert.equal(s.audios.length, 1, 'exactly one audio element');
    const a = s.audios[0]!;
    assert.equal(a.src, MUSIC_SRC);
    assert.equal(a.loop, true);
    assert.equal(a.paused, false);
    assert.deepEqual(s.music.getState(), { status: 'playing', on: true });
    assert.equal(a.volumes[0], 0, 'created silent');
    advance(2000);
    assert.equal(a.volume, MUSIC_VOLUME, 'ends at the background level');
    const ramp = a.volumes.slice(1);
    for (let i = 1; i < ramp.length; i++) {
      assert.ok(ramp[i]! >= ramp[i - 1]!, 'monotonic fade-in');
      assert.ok(ramp[i]! - ramp[i - 1]! < 0.012, `no volume jump (${ramp[i]! - ramp[i - 1]!})`);
    }
  });

  test('only ever one audio element, however often it is toggled, re-enabled or re-initialised', async () => {
    const s = make();
    s.music.setActive(true);
    s.music.setActive(true);
    await settle();
    for (let i = 0; i < 4; i++) {
      s.music.toggle();
      advance(1000);
      await settle();
      s.music.toggle();
      advance(2000);
      await settle();
    }
    s.music.enable();
    s.music.mute();
    assert.equal(s.audios.length, 1);
  });

  test('autoplay blocked → waits (icon off, control available); the first gesture starts it; the speaker click itself is left to the speaker', async () => {
    const s = make(null, false, 'blocked'); // the browser refuses until a gesture
    s.music.setActive(true);
    await settle();
    assert.deepEqual(s.music.getState(), { status: 'blocked', on: false });
    assert.equal(s.gestureHandlers.size, 1, 'listening for a gesture');
    s.fire(true); // a click on the speaker button: not handled by the gesture listener
    await settle();
    assert.equal(s.audios[0]!.paused, true);
    s.audios[0]!.playMode = 'ok';
    s.fire(false); // any other gesture
    await settle();
    assert.deepEqual(s.music.getState(), { status: 'playing', on: true });
    assert.equal(s.gestureHandlers.size, 0, 'stops listening once it is playing');
  });

  test('clicking the speaker while playback is blocked ENABLES the music (it never mutes something that is not playing)', async () => {
    const s = make(null, false, 'blocked');
    s.music.setActive(true);
    await settle();
    assert.equal(s.music.getState().status, 'blocked');
    s.audios[0]!.playMode = 'ok'; // a click is a gesture: the browser now allows it
    s.music.toggle();
    await settle();
    assert.equal(s.music.getState().on, true);
    assert.equal(s.store.has(MUSIC_PREF_KEY), false, 'no mute preference was stored');
  });

  test('mute: the icon flips at once, the volume fades out (no jump) and only then does it pause; the choice is stored', async () => {
    const s = make(null, true);
    s.music.setActive(true);
    await settle();
    advance(2000);
    const a = s.audios[0]!;
    s.music.toggle();
    assert.deepEqual(s.music.getState(), { status: 'off', on: false }, 'immediate');
    assert.equal(s.store.get(MUSIC_PREF_KEY), 'off');
    assert.equal(a.paused, false, 'still fading');
    advance(600);
    assert.equal(a.volume, 0);
    assert.equal(a.paused, true);
    const fade = a.volumes.slice(a.volumes.lastIndexOf(MUSIC_VOLUME));
    for (let i = 1; i < fade.length; i++) {
      assert.ok(fade[i]! <= fade[i - 1]!, 'monotonic fade-out');
      assert.ok(fade[i - 1]! - fade[i]! < 0.03, 'no sudden drop');
    }
    assert.equal(s.gestureHandlers.size, 0, 'a muted player is no longer listening for gestures');
  });

  test('a muted player is NEVER played again unprompted — not on load, not on a gesture, not after a refresh', async () => {
    const s = make('off');
    s.music.setActive(true);
    await settle();
    assert.equal(s.audios.length, 0, 'no audio element is even created (no download)');
    assert.deepEqual(s.music.getState(), { status: 'off', on: false });
    assert.equal(s.gestureHandlers.size, 0);
    s.fire(false);
    await settle();
    assert.equal(s.audios.length, 0);
    s.music.dispose();
    // …and the same through a mute → "refresh" cycle (a second controller reading the same storage)
    const t = setup();
    t.music.setActive(true);
    await settle();
    t.music.mute();
    advance(600);
    const reloaded = createMusic(t.env);
    reloaded.setActive(true);
    await settle();
    assert.equal(reloaded.getState().on, false);
    assert.equal(t.audios.length, 1, 'the reloaded controller created nothing');
    reloaded.dispose();
    t.music.dispose();
  });

  test('un-muting removes the stored choice, starts from silence and fades in', async () => {
    const s = make('off', true);
    s.music.setActive(true);
    s.music.toggle();
    await settle();
    assert.equal(s.store.has(MUSIC_PREF_KEY), false);
    const a = s.audios[0]!;
    assert.equal(a.volumes[0], 0, 'starts silent');
    assert.deepEqual(s.music.getState(), { status: 'playing', on: true });
    advance(2000);
    assert.equal(a.volume, MUSIC_VOLUME);
  });

  test('muting while play() is still pending: it never becomes audible', async () => {
    const s = make();
    s.music.setActive(true);
    const a = s.audios[0]!;
    // (init already awaited a normal play(); do it again through enable with a held request)
    s.music.mute();
    advance(600);
    a.hold = new Promise<void>((res) => (a.release = res));
    s.music.enable();
    assert.equal(s.music.getState().status, 'starting');
    s.music.mute();
    a.release();
    await settle();
    assert.equal(s.music.getState().on, false);
    assert.equal(a.paused, true, 'paused again when the held request resolved');
  });

  test('if the file cannot play the game carries on: no throw, one warning, no retry storm on every gesture', async () => {
    const s = make();
    s.music.setActive(true);
    s.audios[0]!.paused = true;
    s.audios[0]!.playMode = 'error';
    s.music.mute();
    advance(600);
    s.music.enable();
    await settle();
    assert.equal(s.music.getState().status, 'error');
    assert.equal(s.warnings.length, 1);
    const calls = s.audios[0]!.playCalls;
    s.fire(false);
    s.fire(false);
    await settle();
    assert.equal(s.audios[0]!.playCalls, calls, 'gestures do not retry a broken file');
    assert.equal(s.music.getState().on, false);
    // the player can still try again deliberately
    s.audios[0]!.playMode = 'ok';
    s.music.toggle();
    await settle();
    assert.equal(s.music.getState().on, true);
  });

  test('a pause by the browser/OS (headphones, a call) while the player wanted music: icon shows it is off, the next gesture resumes, nothing is stored', async () => {
    const s = make();
    s.music.setActive(true);
    await settle();
    s.audios[0]!.pause(); // not via mute()
    assert.deepEqual(s.music.getState(), { status: 'blocked', on: false });
    assert.equal(s.store.has(MUSIC_PREF_KEY), false);
    s.fire(false);
    await settle();
    assert.equal(s.music.getState().on, true);
  });

  test('unavailable storage (private mode) does not break anything: defaults to on, mute still works for the session', async () => {
    mock.timers.enable({ apis: ['setInterval'] });
    const base = setup();
    const env: MusicEnv = { ...base.env, storage: { get: () => { throw new Error('denied'); }, set: () => { throw new Error('denied'); }, remove: () => { throw new Error('denied'); } } };
    const music = createMusic(env);
    music.setActive(true);
    await settle();
    assert.equal(music.getState().on, true);
    music.mute();
    assert.equal(music.getState().on, false);
    music.enable();
    await settle();
    assert.equal(music.getState().on, true);
    music.dispose();
    mock.timers.reset();
  });

  // ---------------------------------------------------------------------------------------------- entering the game
  test('plays ONLY during a race: silent before it, fades out and pauses when it ends, and starts again for the next race', async () => {
    const s = make();
    await settle();
    assert.equal(s.audios.length, 0, 'nothing is created or played before a race');
    assert.deepEqual(s.music.getState(), { status: 'idle', on: false });
    s.music.setActive(true); // the countdown starts
    await settle();
    advance(2000);
    const a = s.audios[0]!;
    assert.deepEqual(s.music.getState(), { status: 'playing', on: true });
    assert.equal(a.volume, MUSIC_VOLUME);
    s.music.setActive(false); // the race is over (or this driver finished)
    assert.deepEqual(s.music.getState(), { status: 'idle', on: false });
    advance(600);
    assert.equal(a.volume, 0, 'faded out, never cut');
    assert.equal(a.paused, true);
    for (const h of s.gestureHandlers) h(false); // a click on the results page never brings it back
    await settle();
    assert.equal(a.paused, true);
    s.music.setActive(true); // the next race
    await settle();
    advance(2000);
    assert.equal(a.paused, false);
    assert.equal(s.audios.length, 1, 'still one element');
  });

  test('a muted player stays muted across races; un-muting between races only takes effect when the next race starts', async () => {
    const s = make();
    s.music.setActive(true);
    await settle();
    advance(2000);
    s.music.mute();
    advance(600);
    s.music.setActive(false);
    s.music.setActive(true);
    await settle();
    assert.equal(s.music.getState().on, false, 'the choice is kept for the next race');
    s.music.setActive(false);
    s.music.enable();
    await settle();
    assert.deepEqual(s.music.getState(), { status: 'idle', on: false }, 'wanted, but no race is running');
    s.music.setActive(true);
    await settle();
    advance(2000);
    assert.deepEqual(s.music.getState(), { status: 'playing', on: true });
  });

  test('isEnabled() is the player\'s choice: true while autoplay is blocked, false only once muted', async () => {
    const s = make(null, false, 'blocked');
    s.music.setActive(true);
    await settle();
    assert.equal(s.music.getState().on, false);
    assert.equal(s.music.isEnabled(), true, 'wants music even though the browser is holding it back');
    s.music.mute();
    assert.equal(s.music.isEnabled(), false);
    const stored = setup('off');
    assert.equal(stored.music.isEnabled(), false, 'a stored mute is read on load');
    stored.music.dispose();
  });

  // ---------------------------------------------------------------------------------------------- under a sound effect
  test('duck: the music glides down under a sound effect and back up by itself afterwards — never a jump, never stuck quiet', async () => {
    const s = make(null, true);
    s.music.setActive(true);
    await settle();
    advance(2000);
    const a = s.audios[0]!;
    assert.equal(a.volume, MUSIC_VOLUME);
    const before = a.volumes.length;
    s.music.duck(3000);
    advance(400);
    assert.ok(Math.abs(a.volume - MUSIC_VOLUME * DUCK_FACTOR) < 1e-9, `ducked to ${a.volume}`);
    assert.ok(a.volume < MUSIC_VOLUME / 2, 'clearly lower while the effects play');
    advance(2500);
    assert.ok(Math.abs(a.volume - MUSIC_VOLUME * DUCK_FACTOR) < 1e-9, 'still lowered until the hold is over');
    advance(700); // hold over (3000) → released
    advance(1500);
    assert.equal(a.volume, MUSIC_VOLUME, 'restored without anyone asking');
    const ramp = a.volumes.slice(before);
    for (let i = 1; i < ramp.length; i++) assert.ok(Math.abs(ramp[i]! - ramp[i - 1]!) < 0.03, `no jump (${ramp[i - 1]} → ${ramp[i]})`);
    assert.equal(s.audios.length, 1);
    assert.equal(a.paused, false, 'ducking never stops or restarts the track');
  });

  test('unduck() brings the music back at once (leaving the race screen), and duck(…) again restarts the hold', async () => {
    const s = make(null, true);
    s.music.setActive(true);
    await settle();
    advance(2000);
    const a = s.audios[0]!;
    s.music.duck(10_000);
    advance(400);
    s.music.unduck();
    advance(1500);
    assert.equal(a.volume, MUSIC_VOLUME);
    s.music.duck(500);
    advance(300);
    s.music.duck(500); // a second effect: the hold starts over
    advance(400);
    assert.ok(a.volume < MUSIC_VOLUME / 2, 'still ducked 700 ms after the first duck');
    advance(200);
    advance(1500);
    assert.equal(a.volume, MUSIC_VOLUME);
  });

  test('ducking while muted, or before the music has started, never makes sound; a start during a duck fades in to the ducked level', async () => {
    const m = make(null, true);
    m.music.setActive(true);
    await settle();
    advance(2000);
    m.music.mute();
    advance(600);
    m.music.duck(2000);
    m.music.unduck();
    advance(2000);
    assert.equal(m.audios[0]!.volume, 0, 'muted stays silent through duck and unduck');
    assert.equal(m.audios[0]!.paused, true);
    m.music.dispose();

    const b = make(null, true, 'blocked'); // not started yet (autoplay blocked)
    b.music.setActive(true);
    await settle();
    b.music.duck(5000);
    b.audios[0]!.playMode = 'ok';
    b.fire(false); // the first gesture starts it while an effect is playing
    await settle();
    advance(2000);
    assert.ok(Math.abs(b.audios[0]!.volume - MUSIC_VOLUME * DUCK_FACTOR) < 1e-9, 'fades in to the ducked level');
    advance(3500);
    advance(1500);
    assert.equal(b.audios[0]!.volume, MUSIC_VOLUME, 'and comes up to full once the effect is over');
  });

  test('subscribers are told only about real changes; the state object is stable in between (React-safe)', async () => {
    const s = make();
    let calls = 0;
    s.music.subscribe(() => calls++);
    const first = s.music.getState();
    assert.equal(s.music.getState(), first);
    s.music.setActive(true);
    await settle();
    const playing = s.music.getState();
    assert.notEqual(playing, first);
    const n = calls;
    s.music.enable(); // already playing → nothing changes visibly
    await settle();
    assert.equal(s.music.getState().status, 'playing');
    assert.ok(calls >= n);
    assert.equal(s.music.getState(), s.music.getState());
  });

  test('setVolume / getVolume: adjusts audio volume immediately, persists to storage, mutes at 0, and unmutes when raised above 0', async () => {
    const s = make();
    s.music.setActive(true);
    await settle();
    advance(2000);
    const a = s.audios[0]!;
    assert.equal(s.music.getVolume(), MUSIC_VOLUME);

    s.music.setVolume(0.65);
    assert.equal(s.music.getVolume(), 0.65);
    assert.equal(a.volume, 0.65, 'audio volume updated immediately');
    assert.equal(s.store.get(MUSIC_VOLUME_KEY), '0.65', 'volume persisted to storage');

    // Persists across a reload (new controller reading the same storage)
    const reloaded = createMusic(s.env);
    assert.equal(reloaded.getVolume(), 0.65, 'restored from storage on load');
    reloaded.dispose();

    // Dragging to 0 mutes the music
    s.music.setVolume(0);
    assert.equal(s.music.getVolume(), 0);
    assert.equal(s.music.getState().on, false);
    advance(600);
    assert.equal(a.paused, true);

    // Unmuting via toggle() after dragging to 0 restores the last non-zero volume (0.65)
    s.music.toggle();
    await settle();
    assert.equal(s.music.getState().on, true);
    assert.equal(s.music.getVolume(), 0.65);
    advance(2000);
    assert.equal(a.volume, 0.65);

    // Mute explicitly, then drag slider above 0 → unmutes and plays at the new volume immediately
    s.music.mute();
    advance(600);
    assert.equal(s.music.getState().on, false);
    s.music.setVolume(0.4);
    await settle();
    assert.equal(s.music.getState().on, true);
    assert.equal(s.music.getVolume(), 0.4);
    assert.equal(a.volume, 0.4);
  });
});

// ------------------------------------------------------------------------------------------------ the shipped clip
/** Duration of an MP3 from its Xing/Info header (frame count × 1152 samples ÷ sample rate). */
function mp3Facts(buf: Buffer) {
  let i = 0;
  if (buf.subarray(0, 3).toString() === 'ID3') i = 10 + ((buf[6]! << 21) | (buf[7]! << 14) | (buf[8]! << 7) | buf[9]!);
  while (i < buf.length - 4 && !(buf[i] === 0xff && (buf[i + 1]! & 0xe0) === 0xe0)) i++;
  const h = buf.readUInt32BE(i);
  const version = (h >> 19) & 3; // 3 = MPEG1
  const layer = (h >> 17) & 3; // 1 = Layer III
  const sr = [44100, 48000, 32000][(h >> 10) & 3]!;
  const mono = ((h >> 6) & 3) === 3;
  const tagAt = i + 4 + (version === 3 ? (mono ? 17 : 32) : mono ? 9 : 17);
  const tag = buf.subarray(tagAt, tagAt + 4).toString();
  const frames = (buf.readUInt32BE(tagAt + 4) & 1) === 1 ? buf.readUInt32BE(tagAt + 8) : 0;
  return { version, layer, sr, channels: mono ? 1 : 2, tag, frames, seconds: (frames * 1152) / sr };
}

// The supplied source is 10:34.14 long; the soundtrack is everything after its first 20 s, i.e. 10:14.14.
const SOURCE_SECONDS = 634.14;
const SKIPPED_SECONDS = 20;
const TRACK_SECONDS = SOURCE_SECONDS - SKIPPED_SECONDS;

describe('the shipped track', () => {
  const file = join(root, 'public', MUSIC_SRC.replace(/^\//, ''));
  test('is the whole remainder of the source after its first 20 s (10:14), not a 20 s clip and not the original', () => {
    const buf = readFileSync(file);
    const f = mp3Facts(buf);
    assert.equal(f.version, 3, 'MPEG-1');
    assert.equal(f.layer, 1, 'Layer III (MP3)');
    assert.equal(f.sr, 44100);
    assert.equal(f.channels, 2);
    assert.ok(f.tag === 'Xing' || f.tag === 'Info', 'has a gapless-playback (Xing/LAME) header');
    assert.ok(Math.abs(f.seconds - TRACK_SECONDS) < 0.2, `${f.seconds.toFixed(3)} s, expected ${TRACK_SECONDS.toFixed(2)} s`);
    assert.ok(f.seconds > 600, 'the full remaining length is kept, nothing is cut from the end');
    assert.ok(buf.length > 4_000_000 && buf.length < 8_000_000, `${buf.length} bytes (optimised MP3, ~6 MB for ten minutes)`);
    assert.ok(!buf.includes(Buffer.from('Zimmer')), 'no source metadata left in the file');
  });

  test('is versioned and reproducible: the recipe skips nothing but the head, evens out the level and fades the loop seam', () => {
    assert.equal(MUSIC_SRC, '/music/f1-theme-trimmed.mp3', 'the one track the player loads');
    const recipe = readFileSync(join(root, 'docs', 'music-filters.txt'), 'utf8');
    assert.match(recipe, /dynaudnorm=/, 'quiet stretches are lifted gently');
    assert.match(recipe, /alimiter=limit=0\.85/, 'peaks held below full scale');
    assert.match(recipe, /afade=t=in:st=0:d=1\.5/, 'soft start');
    // the fade-out must end exactly at the end of the track, so the loop wraps from silence into the fade-in
    const out = recipe.match(/afade=t=out:st=([\d.]+):d=([\d.]+)/);
    assert.ok(out, 'soft end');
    assert.ok(Math.abs(Number(out[1]) + Number(out[2]) - TRACK_SECONDS) < 0.2, `fade-out ${out[1]}+${out[2]} ends at the end of the track`);
    // the loudness is applied on top of the master by MUSIC_VOLUME; at 0.12 a −14.7 LUFS master plays at about −33 LUFS
    assert.ok(MUSIC_VOLUME === 0.12);
  });

  test('the old 20-second clips are gone and the project ships no other audio or video: no original recording; only the track and the two short countdown cues', () => {
    const files = readdirSync(join(root, 'public'), { recursive: true, withFileTypes: true }).filter((d) => d.isFile());
    const names = files.map((d) => join(d.parentPath, d.name));
    const rel = (list: string[]) => list.map((n) => n.replace(root, '').replaceAll('\\', '/')).sort();
    assert.deepEqual(names.filter((n) => /\.(mp4|m4a|flac|webm|mkv)$/i.test(n)), []);
    assert.deepEqual(rel(names.filter((n) => /\.(mp3|ogg)$/i.test(n))), [`/public${MUSIC_SRC}`]);
    assert.deepEqual(rel(names.filter((n) => /\.wav$/i.test(n))), ['/public/sfx/countdown-beep.wav', '/public/sfx/countdown-go.wav']);
    for (const n of names) if (n !== file) assert.ok(statSync(n).size < 400_000, n);
  });

  test('nothing in the source or docs still points at the 20-second clips', () => {
    const stale = /f1-theme-20s/;
    for (const f of ['src/audio/controller.ts', 'src/audio/music.ts', 'README.md', '.dockerignore', 'docs/music-filters.txt', 'server/static.ts']) {
      assert.doesNotMatch(read(f), stale, f);
    }
  });
});

// ------------------------------------------------------------------------------------------------ wiring
describe('how the app uses it', () => {
  test('one shared player: the audio element is created in the controller only, never by a component', () => {
    const music = read('src/audio/music.ts');
    assert.equal((music.match(/new Audio\(/g) ?? []).length, 1);
    for (const f of ['src/App.tsx', 'src/components/MusicToggle.tsx', 'src/components/SiteHeader.tsx', 'src/components/race/Hud.tsx', 'src/screens/Landing.tsx', 'src/screens/Lobby.tsx', 'src/screens/Race.tsx']) {
      assert.doesNotMatch(read(f), /new Audio\(|createElement\('audio'\)|<audio/, f);
    }
    assert.match(read('src/App.tsx'), /music\.setActive\(raceOn\)/);
    assert.match(read('src/App.tsx'), /room\.activity === 'typedrive'[^;]*room\.phase === 'countdown' \|\| room\.phase === 'racing'\) && !showResults/, 'only while a TypeDrive race is on this screen');
    assert.match(music, /export const music = createMusic\(/, 'a module-level singleton, outside React');
  });

  test('the speaker toggle is only on the race screens (where music plays), the last item of the race header, with accessible labels', () => {
    assert.doesNotMatch(read('src/components/SiteHeader.tsx'), /MusicToggle/, 'no speaker where no music ever plays');
    assert.match(read('src/components/race/Hud.tsx'), /<MusicToggle variant="hud" \/>\s*<\/div>\s*<\/header>/, 'last child of the race header');
    assert.match(read('src/screens/Spectator.tsx'), /<MusicToggle variant="hud" \/>/, 'and the host / spectator view of the race');
    const toggle = read('src/components/MusicToggle.tsx');
    assert.match(toggle, /'Mute music'/);
    assert.match(toggle, /'Enable music'/);
    assert.match(toggle, /aria-label=\{label\}/);
    assert.match(toggle, /title=\{label\}/);
    assert.match(toggle, /data-music-toggle/);
    assert.match(toggle, /IconSpeakerMuted/);
    assert.match(toggle, /onMouseDown=\{hud \? \(e\) => e\.preventDefault\(\) : undefined\}/, 'a click never takes focus from the typing field');
  });

  test('typing is untouched: Tab still stays in the field, Shift+Tab can reach the HUD buttons, and music code never touches the game store or sockets', () => {
    assert.match(read('src/components/race/TypingBar.tsx'), /e\.key === 'Tab' && !e\.shiftKey/);
    for (const f of ['src/audio/controller.ts', 'src/audio/music.ts', 'src/components/MusicToggle.tsx']) {
      assert.doesNotMatch(read(f), /from '[^']*(\/store|net\/socket|game\/engine|shared\/)[^']*'|WebSocket/, f);
    }
  });
});
