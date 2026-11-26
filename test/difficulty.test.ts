import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createApp, parseClientMsg, type App } from '../server/app';
import { defaultConfig } from '../server/config';
import { EASY_PASSAGES, HARD_PASSAGES, MEDIUM_PASSAGES, PASSAGES, PASSAGES_BY_DIFFICULTY, passagesFor } from '../server/passages';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, DIFFICULTY_IDS, difficultyDef, isDifficulty, type Difficulty } from '../shared/difficulty';
import { calcAccuracy, calcScore, calcWpm, trophiesFor } from '../shared/game';
import type { ResultRow } from '../shared/protocol';
import { DifficultyBadge, DifficultySelectScreen } from '../src/components/DifficultyPicker';
import { BrowserLike } from './helpers/browser-like';
import { Sim } from './helpers/room-sim';
import { FAST } from './helpers/ws-client';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('difficulty definitions & wire protocol', () => {
  test('defines Easy Typing, Medium Typing, and Hard Typing with player-facing descriptions', () => {
    assert.deepEqual(DIFFICULTY_IDS, ['easy', 'medium', 'hard']);
    assert.equal(DEFAULT_DIFFICULTY, 'medium');
    assert.deepEqual(
      DIFFICULTIES.map((d) => d.name),
      ['Easy Typing', 'Medium Typing', 'Hard Typing'],
    );
    for (const d of DIFFICULTIES) {
      assert.ok(d.description.length >= 40, `${d.id} has a clear description`);
      assert.ok(d.highlights.length >= 3, `${d.id} lists key characteristics`);
      assert.equal(difficultyDef(d.id), d);
      assert.equal(isDifficulty(d.id), true);
    }
    for (const bad of ['extreme', 'beginner', '', null, undefined, 2, {}]) {
      assert.equal(isDifficulty(bad), false);
    }
  });

  test('parseClientMsg validates difficulty frames and optional start difficulty', () => {
    for (const d of DIFFICULTY_IDS) {
      assert.deepEqual(parseClientMsg(JSON.stringify({ t: 'difficulty', difficulty: d })), { t: 'difficulty', difficulty: d });
      assert.deepEqual(parseClientMsg(JSON.stringify({ t: 'start', difficulty: d })), { t: 'start', difficulty: d });
    }
    assert.deepEqual(parseClientMsg('{"t":"start"}'), { t: 'start' });
    for (const bad of ['"insane"', '123', 'null', '{}', '[]']) {
      assert.equal(parseClientMsg(`{"t":"difficulty","difficulty":${bad}}`), null);
      assert.equal(parseClientMsg(`{"t":"start","difficulty":${bad}}`), null);
    }
  });
});

describe('curated passages per difficulty level', () => {
  test('Easy Typing: short sentences, simple everyday vocabulary, clean printable ASCII', () => {
    assert.ok(EASY_PASSAGES.length >= 10);
    assert.equal(new Set(EASY_PASSAGES).size, EASY_PASSAGES.length);
    for (const p of EASY_PASSAGES) {
      assert.match(p, /^[A-Za-z][A-Za-z ,.]*[.]$/, p);
      assert.ok(!p.includes('  '), `no double spaces: ${p}`);
      assert.ok(p.length >= 110 && p.length <= 165, `easy length ${p.length}: ${p}`);
      const sentences = p.split('. ').filter(Boolean);
      assert.ok(sentences.length >= 3, `at least 3 short sentences: ${p}`);
      const words = p.split(' ');
      const avgWordLen = words.reduce((sum, w) => sum + w.replace(/[,.]/g, '').length, 0) / words.length;
      assert.ok(avgWordLen <= 5.2, `simple beginner words (avg ${avgWordLen.toFixed(2)}): ${p}`);
    }
  });

  test('Medium Typing: medium-length sentences (300–350 chars) with varied vocabulary and punctuation', () => {
    assert.equal(MEDIUM_PASSAGES, PASSAGES);
    assert.ok(MEDIUM_PASSAGES.length >= 10);
    for (const p of MEDIUM_PASSAGES) {
      assert.ok(p.length >= 300 && p.length <= 350, `medium length ${p.length}`);
      assert.ok(p.includes(',') && p.includes('.'), `contains punctuation: ${p}`);
    }
  });

  test('Hard Typing: longer passages with complex vocabulary, numbers, punctuation, and special ASCII characters', () => {
    assert.ok(HARD_PASSAGES.length >= 10);
    assert.equal(new Set(HARD_PASSAGES).size, HARD_PASSAGES.length);
    const maxMedium = Math.max(...MEDIUM_PASSAGES.map((p) => p.length));
    for (const p of HARD_PASSAGES) {
      assert.match(p, /^[\x20-\x7E]+$/, `strictly printable keyboard ASCII: ${p}`);
      assert.ok(!p.startsWith(' ') && !p.endsWith(' ') && !p.includes('  '), `clean spacing: ${p}`);
      assert.ok(p.length > maxMedium && p.length <= 440, `longer than medium (${p.length} chars): ${p}`);
      assert.match(p, /\d/, `contains numbers: ${p}`);
      assert.match(p, /[:;!?'"()-]/, `contains varied punctuation: ${p}`);
      assert.match(p, /[#@&%/$+=<>]/, `contains special characters: ${p}`);
      const complexWords = p.split(' ').filter((w) => w.replace(/[^A-Za-z]/g, '').length >= 11);
      assert.ok(complexWords.length >= 3, `contains complex vocabulary (${complexWords.join(', ')}): ${p}`);
      // Even a 12 WPM typist finishes comfortably inside the 8-minute race deadline
      const minWpm = p.length / 5 / (defaultConfig.raceMaxMs / 60_000);
      assert.ok(minWpm <= 11.5, `hard passage (${p.length} chars) needs only ${minWpm.toFixed(1)} WPM to beat raceMaxMs`);
    }
  });

  test('random selection draws from the chosen difficulty collection and avoids immediate repeats', () => {
    for (const difficulty of DIFFICULTY_IDS) {
      const pool = passagesFor(difficulty);
      assert.equal(pool, PASSAGES_BY_DIFFICULTY[difficulty]);
      let rngIdx = 0;
      const samples = [0.0, 0.0, 0.35, 0.72, 0.99];
      const sim = new Sim({}, 0, false, { rand: () => samples[rngIdx++ % samples.length]! });
      try {
        sim.join('Asha');
        assert.equal(sim.room.setDifficulty(sim.room.hostId, difficulty), true);
        const seen: string[] = [];
        for (let r = 0; r < 5; r++) {
          assert.equal(sim.room.start(sim.room.hostId), true);
          const text = sim.text;
          assert.ok(pool.includes(text), `race ${r + 1} passage belongs to ${difficulty} collection`);
          if (seen.length > 0) assert.notEqual(text, seen[seen.length - 1], 'never picks the same passage twice in a row');
          seen.push(text);
          sim.advanceToGo();
          assert.equal(sim.room.endByHost(sim.room.hostId), true);
        }
        assert.ok(new Set(seen).size >= 4, `varied random draws across ${difficulty} pool`);
      } finally {
        sim.destroy();
      }
    }
  });
});

describe('host control & multiplayer synchronization across all three difficulties', () => {
  let app: App | null = null;
  const clients: BrowserLike[] = [];
  afterEach(async () => {
    for (const c of clients.splice(0)) c.close();
    await app?.close();
    app = null;
  });

  async function openRoom(driverNames: string[]) {
    app = createApp({ config: { ...FAST, raceMaxMs: 30_000, idleDnfMs: 4000, maxKeysPerSecond: 250, maxMessagesPerSecond: 400 } });
    const port = await app.listen(0, '127.0.0.1');
    const host = new BrowserLike(port, 'Host');
    clients.push(host);
    await host.connect({ create: true });
    host.send({ t: 'activity', activity: 'typedrive' });
    await host.until(() => host.room?.activity === 'typedrive');

    const teams = ['titans', 'vibe', 'ctrl'] as const;
    const drivers: BrowserLike[] = [];
    for (let i = 0; i < driverNames.length; i++) {
      const d = new BrowserLike(port, driverNames[i]!);
      clients.push(d);
      await d.connect({ code: host.room!.code, team: teams[i % teams.length]! });
      drivers.push(d);
    }
    return { port, host, drivers, all: [host, ...drivers] };
  }

  test('only the host can select difficulty; all participants see live updates, late joiners sync, and mid-race changes are blocked', async () => {
    const { port, host, drivers, all } = await openRoom(['Asha', 'Ben']);
    const [asha] = drivers as [BrowserLike, BrowserLike];

    assert.equal(host.room!.difficulty, 'medium', 'room defaults to medium');

    // Driver cannot change difficulty
    asha.send({ t: 'difficulty', difficulty: 'hard' });
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(host.room!.difficulty, 'medium', 'driver difficulty request is ignored');

    // Host selects Hard Typing -> every participant updates immediately
    host.send({ t: 'difficulty', difficulty: 'hard' });
    await Promise.all(all.map((c) => c.until(() => c.room?.difficulty === 'hard')));

    // Late-joining driver sees Hard Typing immediately upon joining the lobby
    const chitra = new BrowserLike(port, 'Chitra');
    clients.push(chitra);
    await chitra.connect({ code: host.room!.code, team: 'ctrl' });
    assert.equal(chitra.room!.difficulty, 'hard');

    // Host switches to Easy Typing before starting
    host.send({ t: 'difficulty', difficulty: 'easy' });
    await Promise.all([...all, chitra].map((c) => c.until(() => c.room?.difficulty === 'easy')));

    // Start the race: mid-race difficulty changes are ignored by the server
    host.send({ t: 'start' });
    await Promise.all([...all, chitra].map((c) => c.until(() => c.room?.phase === 'racing')));
    const easyText = host.room!.race!.text;
    assert.equal(host.room!.race!.difficulty, 'easy');
    assert.ok(EASY_PASSAGES.includes(easyText));

    host.send({ t: 'difficulty', difficulty: 'hard' });
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(host.room!.difficulty, 'easy', 'cannot mutate difficulty while a race is running');
    assert.equal(host.room!.race!.text, easyText);
  });

  test('full 3-race multiplayer match playing Easy Typing, Medium Typing, and Hard Typing end to end', async () => {
    const { host, drivers, all } = await openRoom(['Asha', 'Ben', 'Chitra']);
    const [asha, ben, chitra] = drivers as [BrowserLike, BrowserLike, BrowserLike];

    const order: { level: Difficulty; pool: readonly string[]; typoForBen: boolean }[] = [
      { level: 'easy', pool: EASY_PASSAGES, typoForBen: true },
      { level: 'medium', pool: MEDIUM_PASSAGES, typoForBen: false },
      { level: 'hard', pool: HARD_PASSAGES, typoForBen: true },
    ];

    let expectedRaces = 0;
    for (const { level, pool, typoForBen } of order) {
      host.send({ t: 'difficulty', difficulty: level });
      await Promise.all(all.map((c) => c.until(() => c.room?.difficulty === level)));

      host.send({ t: 'start', difficulty: level });
      await Promise.all(all.map((c) => c.until(() => c.room?.phase === 'racing')));

      // Every participant in the room plays the exact same difficulty and passage
      const sharedText = host.room!.race!.text;
      const sharedGoAt = host.room!.race!.goAt;
      assert.ok(pool.includes(sharedText), `${level}: chosen passage comes from ${level} collection`);
      for (const c of all) {
        assert.equal(c.room!.difficulty, level);
        assert.equal(c.room!.race!.difficulty, level);
        assert.equal(c.room!.race!.text, sharedText);
        assert.equal(c.room!.race!.goAt, sharedGoAt);
      }
      for (const d of drivers) {
        assert.equal(d.engine.text, sharedText);
      }

      // Drivers type at staggered speeds so finishing order is Asha (1st), Ben (2nd), Chitra (3rd)
      const benTask = (async () => {
        await new Promise((r) => setTimeout(r, 40));
        if (typoForBen) {
          const wrong = sharedText[0] === '~' ? '!' : '~';
          ben.engine.handleChar(wrong);
          ben.engine.handleChar(wrong);
        }
        await ben.typeAll(6);
      })();
      const chitraTask = (async () => {
        await new Promise((r) => setTimeout(r, 90));
        await chitra.typeAll(8);
      })();

      await Promise.all([asha.typeAll(4), benTask, chitraTask]);
      await Promise.all(all.map((c) => c.until(() => c.room?.phase === 'results', 10_000)));

      expectedRaces += 1;
      const rows = host.room!.results as ResultRow[];
      assert.equal(rows.length, 3);
      assert.deepEqual(
        rows.map((r) => [r.name, r.rank, r.finished]),
        [
          ['Asha', 1, true],
          ['Ben', 2, true],
          ['Chitra', 3, true],
        ],
      );
      assert.deepEqual(rows.map((r) => r.trophies), [trophiesFor(1, true), trophiesFor(2, true), trophiesFor(3, true)]);
      assert.deepEqual(rows.map((r) => r.teamPoints), [10, 8, 6]);

      // Verify WPM, accuracy, and global score formulas on the server rows
      for (const r of rows) {
        assert.ok(r.timeMs !== null && r.timeMs > 0);
        const expectedWpm = Math.round(calcWpm(sharedText.length, r.timeMs!) * 10) / 10;
        assert.equal(r.wpm, expectedWpm, `${level} ${r.name} WPM`);
        assert.equal(r.score, calcScore(calcWpm(sharedText.length, r.timeMs!), calcAccuracy(sharedText.length, r.name === 'Ben' && typoForBen ? 2 : 0), 1));
      }
      assert.equal(rows[0]!.accuracy, 100);
      if (typoForBen) {
        const expectedAcc = Math.round(calcAccuracy(sharedText.length, 2) * 10) / 10;
        assert.equal(rows[1]!.accuracy, expectedAcc);
      } else {
        assert.equal(rows[1]!.accuracy, 100);
      }

      // Every participant and the host have identical results and team match totals
      for (const c of all) {
        assert.deepEqual(c.room!.results, rows, `${level}: ${c.name} sees identical results`);
        assert.equal(c.room!.match.races, expectedRaces);
      }
    }

    // Cumulative trophies and team standings after all 3 difficulty races (3 × [10, 8, 6] = [30, 24, 18])
    const teamTotals = Object.fromEntries(host.room!.teams.map((t) => [t.id, t.points]));
    assert.deepEqual(teamTotals, { titans: 30, vibe: 24, ctrl: 18 });
    assert.equal(host.room!.players.find((p) => p.name === 'Asha')!.trophies, 75);
    assert.equal(host.room!.players.find((p) => p.name === 'Ben')!.trophies, 45);
    assert.equal(host.room!.players.find((p) => p.name === 'Chitra')!.trophies, 30);
  });
});

describe('difficulty selection screen & badges in Lobby, Race HUD, Spectator HUD, and Results', () => {
  test('DifficultySelectScreen renders all three attractive cards, descriptions, selection state, and host/player controls', () => {
    for (const level of DIFFICULTY_IDS) {
      const hostHtml = renderToStaticMarkup(
        createElement(DifficultySelectScreen, {
          selected: level,
          roomCode: 'K7BQ',
          isHost: true,
          driversReady: 4,
          onSelect: () => {},
          onStart: () => {},
          onBack: () => {},
        }),
      );
      assert.match(hostHtml, /<h1 class="df-h1">Select difficulty<\/h1>/);
      for (const d of DIFFICULTIES) {
        assert.ok(hostHtml.includes(d.name), `renders card title ${d.name}`);
        assert.ok(hostHtml.includes(d.description), `renders description for ${d.name}`);
        assert.ok(hostHtml.includes(`data-difficulty-card="${d.id}"`), `card hook for ${d.id}`);
      }
      assert.match(hostHtml, new RegExp(`aria-checked="true"[^>]*data-difficulty-card="${level}"`));
      assert.ok(!hostHtml.includes('data-difficulty-card="easy" disabled'), 'host cards are interactive');
      assert.match(hostHtml, /Start (Easy|Medium|Hard) race · 4 drivers/);
    }

    const playerHtml = renderToStaticMarkup(
      createElement(DifficultySelectScreen, {
        selected: 'hard',
        roomCode: 'K7BQ',
        isHost: false,
        driversReady: 4,
        onSelect: () => {},
        onStart: () => {},
        onBack: () => {},
      }),
    );
    assert.match(playerHtml, /disabled=""[^>]*data-difficulty-card="easy"|data-difficulty-card="easy"[^>]*disabled=""/);
    assert.match(playerHtml, /Current race level: Hard Typing/);
  });

  test('DifficultyBadge renders selected difficulty for Lobby, Race HUD, and Results', () => {
    for (const d of DIFFICULTIES) {
      const lobbyBadge = renderToStaticMarkup(createElement(DifficultyBadge, { difficulty: d.id, variant: 'lobby' }));
      assert.ok(lobbyBadge.includes(d.name));
      assert.ok(lobbyBadge.includes(`df-${d.id}`));

      const hudBadge = renderToStaticMarkup(createElement(DifficultyBadge, { difficulty: d.id, variant: 'hud' }));
      assert.ok(hudBadge.includes(d.short.toUpperCase()));
      assert.ok(hudBadge.includes('TYPING'));
      assert.ok(hudBadge.includes(`diff-pill df-${d.id}`));
    }
  });

  test('Lobby, Race HUD, Spectator HUD, and Results all display the selected difficulty, while Funny Pose & Tech Trivia remain untouched', () => {
    const lobby = read('src/screens/Lobby.tsx');
    assert.match(lobby, /<DifficultySelectScreen/);
    assert.match(lobby, /<DifficultyBadge difficulty=\{room\.difficulty\} variant="lobby" \/>/);

    const hud = read('src/components/race/Hud.tsx');
    assert.match(hud, /<DifficultyBadge difficulty=\{difficulty\} variant="hud" \/>/);

    const race = read('src/screens/Race.tsx');
    assert.match(race, /difficulty=\{room\.race\?\.difficulty \?\? room\.difficulty\}/);

    const spectator = read('src/screens/Spectator.tsx');
    assert.match(spectator, /<DifficultyBadge difficulty=\{room\.race\?\.difficulty \?\? room\.difficulty\} variant="hud" \/>/);

    const results = read('src/screens/Results.tsx');
    assert.match(results, /<DifficultySelectScreen/);
    assert.match(results, /<DifficultyBadge difficulty=\{racedDifficulty\} variant="results" \/>/);

    // Scope guard: Funny Pose Challenge and Tech Trivia were not modified with difficulty logic
    for (const untouched of ['src/screens/FunnyPose.tsx', 'src/screens/TechTrivia.tsx', 'server/games/pose.ts', 'server/games/trivia.ts']) {
      assert.doesNotMatch(read(untouched), /DifficultyBadge|DifficultySelectScreen|setDifficulty/);
    }
  });
});
