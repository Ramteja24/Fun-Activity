# Reference analysis — "TYPEDRIVE GAME" (Instagram Reel `Desx0FQi1HO`)

> This document is the source of truth for the recreation. Everything under **Observed** was read
> directly off frames of the reel. Everything under **Decided** is a choice made where the reel does
> not show the answer — those are the places to look if something differs from the original.

## How the reel was analysed

* The reel is publicly viewable without logging in (posted by `viral_typing_girl`, 45.2 s, 1088×1936,
  caption: *"Think you have the skills to win? Challenge your friends and put your skills to the test
  with TYPEDRIVE GAME … Play, compete, and see who comes out on top! The most fun way to increase
  typing speed!"*).
* It was opened in the in-app browser, paused, and stepped through by seeking to ~40 timestamps
  (0.3 s … 44.5 s), with zoomed views of the HUD, banners, countdown, vehicles and results table.
* **Limits:** the video is muted/no audio was heard; the footage is a phone-portrait crop of a monitor,
  so the right edge of the race screen and the left edge of the start grid are cut off; no lobby,
  matchmaking, garage or settings screens appear in the reel.

## The game: a typing race

It is **not** a plain typing test. It is a side-view car race where *typing is the throttle*.

### Observed — flow

1. **Starting grid + countdown (≈ 0–3.3 s).** Five vehicles sit on a staggered starting grid (dashed
   numbered slots 1–5, checkered start line). A traffic-light pill (three bulbs) sits top-centre with a
   big italic number and a caption on a dark pill:

   | Stage | Light  | Colour of number | Caption |
   |-------|--------|------------------|---------|
   | 3     | red    | red-orange       | `DRIVERS ON THE STARTING GRID... GET READY!` |
   | 2     | amber  | amber            | `ENGINES REVVING... PREPARE YOUR FINGERS!` |
   | 1     | amber  | amber            | `GREEN LIGHTS IN A MOMENT... LAUNCH IMMINENT!` |
   | GO!   | green  | green/cyan glow  | `FULL THROTTLE! TYPE THE TEXT!` |

   The passage is already visible in the typing bar during the countdown; the timer reads `0:00.0` and
   starts at GO. Roughly 1.1 s per stage.
2. **Racing.** Every racer types the *same* passage. The cars move along the road in proportion to how
   much of the passage they have typed. The camera follows the local player (labelled **You**, with a green
   ellipse under the car); rivals are drawn relative to the player, so slower rivals slide off the left
   edge and faster ones off the right.
3. **Finish.** When the player is ~40 characters from the end a `FINISH` gate (dark plate, yellow text,
   hazard stripes) and a checkered line scroll in from the right. Finishing = typing the last character.
4. **Victory pop-up** (≈ 1 s after finishing): gold-bordered card — checkered-flag icon, trophy +
   **STUNNING VICTORY!**, sub-line `1ST PLACE • 57 WPM • ACCURACY 93%`, three icons (✨ 🏆 ✨), confetti.
5. **Results page** (≈ 2 s later): `VICTORY!` / "You finished in 1st place!", four stat tiles
   (final speed, accuracy, time, global score), reward chips (+coins, +trophies, +XP), a level progress
   bar and the **official race ranking** (medal/rank, name, `YOU`/`PLAYER` tag, WPM, accuracy · time).

### Observed — rules

* **Passage in the reel:** *"Carved by monumental glacial ice over thousands of years, emerald waters
  wind between towering vertical cliffs lined with roaring mountain waterfalls."* — **150 characters**
  including spaces, no trailing space.
* **Typing must be exact and in order.** Characters are consumed left-to-right; the space between words
  is a keystroke. A wrong key does **not** advance: the expected character flashes red (red background
  + red caret) and the car stalls. Correct characters dim; the current word is bright; finished words
  are grey.
* **WPM maths is standard (chars ÷ 5 ÷ minutes).** Check: 150 chars ÷ 5 = 30 words; finished in 31.4 s →
  30 ÷ (31.4/60) = **57.3 WPM** — the reel shows **57 WPM**. ✔ The *live* WPM in the HUD fluctuates
  strongly (41 → 93 → 66 → 30 → 55), i.e. it is a short rolling window, not a whole-race average.
* **Accuracy** (93 %) = correct keystrokes ÷ all keystrokes (≈ 11 wrong keys for 150 correct).
* **Position (`POS #n`)** is live. Changes pop a banner for ~2 s:
  * red/glowing, warning icon: `OVERTAKEN! #3` / `-1 Position • Nitro Falcon passed you! ACCELERATE!`
  * crown icon: `IN THE LEAD! P1 LEADER` / `+1 Position • You overtook Turbo Lynx!`
  * (a third gain variant at ≈ 5.3 s is too small to read; treated as `POSITION #n` / `+1 Position • Ahead of …`)
* **Per-word effect:** completing a word outlines it with a rounded box and fires a small "BOOM!" ring +
  sparks at the car's rear. Speed (WPM) controls flame length, road-dash scroll speed and cyan speed-streaks;
  at high WPM the car sits further forward on screen (camera lag).
* **Speedometer:** round dial bottom-left (teal→red rim, needle, small WPM label), overlapping the typing bar.
* **Opponents are tagged `PLAYER`** in the results table (Nitro Falcon, Turbo Lynx, Pixel Gecko, Rapido
  Panda), i.e. the original is an online multiplayer game with a "Custom Rooms" mode (visible in its nav).

### Observed — visual design

| Element | Detail |
|---|---|
| Race stage | Top HUD → green "scenery" band (power pylons, dark building blocks, chain-link fence, neon-green edge, checkered curb) → dark asphalt road with **5 lanes** (dashed white lane lines) → full-width translucent dark **typing bar** → round speedometer overlapping bottom-left |
| HUD | left: dark-green pill with big italic WPM number + `POS #n` pill (cyan number) · centre: `TYPEDRIVE` white + `GAME` orange wordmark · right: timer pill `0:00.0` + small icon button |
| Vehicles (side view, facing right) | **You** = green VW-Beetle-style hatchback; pink pickup; orange sport bike; blue supercar; silver/teal muscle car. Small dark name-tags above each; orange flame behind moving vehicles |
| Typing font | bold monospace (JetBrains-Mono-like), ~wide gaps between words; caret = cyan bar |
| Results page | deep navy background, rounded panels with thin borders; `VICTORY!` in italic heavy gold with glow; WPM tile orange, accuracy cyan, time yellow, score green; coin/trophy/XP chips in amber/blue/purple; ranking rows with gold/silver/bronze rank badges, `YOU` (green) / `PLAYER` (cyan) tags |

## Decided — where the reel is silent

| Topic | Decision | Why |
|---|---|---|
| Opponents | Real people in the room only. No bots. | Requirement: genuine multiplayer. |
| Lobby / landing / join flow | Own screens in the same navy + neon style. Room code + share link + QR. | The reel shows none. |
| >5 racers | Track shows **you + the 4 closest rivals** (5 lanes, exactly like the reel). A standings panel (the reel's unidentified top-right icon button) lists everyone. | Keeps the original look at team scale. |
| Global score | `round(WPM×10 + accuracy×0.75)`, scaled by progress for DNFs. Server-computed. | One data point (57 WPM / 93 % → +643) is matched; the real formula is not observable. |
| Rewards | Only **trophies** (1st +25 as seen; 2nd +15, 3rd +10, other finishers +5) as a running room championship. Coins / XP / levels / garage omitted. | They need persistent accounts. |
| Non-winner pop-ups | 2nd–3rd `PODIUM FINISH!`, others `RACE COMPLETE!` | Only the 1st-place pop-up is visible. |
| Results language | English labels (the recording was made in a French-locale session: *Vitesse finale, Précision, Temps, Score global*). | The team is English-speaking. |
| Branding | Wordmark kept for fidelity; it is a single constant (`src/brand.ts`). | It is someone else's product name — rename before sharing beyond the team. |
| Race end | The race ends when every racer has finished or genuinely stopped: left, offline > 30 s, or (once somebody has finished) **no keystroke for 45 s**; or at the 5-min deadline; or the host ends it. **A win never ends the race for people who are still typing.** Unfinished racers are ranked by progress and marked DNF *with the reason shown*. | The first version cut everyone off 45 s after the winner — that was the DNF bug. |
| Room size | Up to **50** players (`MAX_PLAYERS`), 50 distinct vehicle looks. | Weekly-connect team size. |
| Sound | None (the reel is muted). | — |

## Architecture

**Goal:** simplest reliable thing that supports an *authoritative*, real-time, multi-device race.

```
 phones / laptops (React + Vite + Tailwind, TypeScript)
        │   WebSocket  (JSON, ~10 msgs/s per racer)
        ▼
 one Node process (TypeScript, `ws`)  ── serves the built site AND the socket
        │  in-memory rooms  (no database)
```

* **Why not Next.js + Supabase Realtime?** Supabase Realtime is client-trusted broadcast — scores
  validated "on the server" would need extra edge functions — and Next.js on Vercel cannot hold
  long-lived WebSockets. A single Node WebSocket server gives an *authoritative* game loop with no
  third-party accounts, no cost, and one deployable unit (Docker / Render / Railway / Fly / a laptop).
* **Why no database?** Rooms live minutes and nothing must survive a restart. The trophy
  championship lives in the room object.
* **Server-authoritative race:** clients send *only keystrokes* (`seq`, `char`). The server checks each
  against the passage, advances position, counts wrong keys, keeps a rolling WPM window, stamps the
  finish time, ranks everyone and computes WPM / accuracy / score / trophies. Clients never report
  scores. The client predicts its own typing for zero-latency feel and is reconciled from server
  acks (so a dropped or rate-limited key can never desync a racer).
* **Synchronised start:** the server picks `goAt` (server clock). Clients estimate their clock offset
  with ping/pong (best-of-N lowest RTT), and all show the same 3-2-1-GO relative to `goAt`.
* **Reconnects:** each player holds a random token in `sessionStorage`; reconnecting (refresh, Wi-Fi
  blip, phone sleep) resumes the same racer, position and trophies. A disconnected host hands over
  host rights after a short grace period.
