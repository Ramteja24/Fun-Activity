# TYPEDRIVE · Gantec Weekly Connect

A real-time **multiplayer typing race**, recreated from the Instagram reel
[`Desx0FQi1HO`](https://www.instagram.com/reel/Desx0FQi1HO/) ("TYPEDRIVE GAME").
Everyone races the same passage in a side-view car race: **typing is the throttle**. Each correct key moves your car,
a wrong key stalls it, first across the line wins. Players join from any laptop or phone with a 4-letter room code,
an invite link, or a QR code — nothing to install.

> What the reel shows (and every place where I had to decide something it doesn't show) is documented in
> [`docs/REFERENCE_ANALYSIS.md`](docs/REFERENCE_ANALYSIS.md).

---

## 1. Run it

Requires **Node.js 20.11+**.

```bash
npm install
npm run admin      # first time only: choose the admin username and password
npm run build      # builds the client + server bundle into dist/
npm start          # http://localhost:3000  (also prints a Network address for teammates)
```

Windows host who just wants to double-click: **`start-weekly-connect.bat`** (installs, asks for the admin login and builds on first run, then starts).

### The admin and the players

There is **one admin** — the person who runs the Weekly Connect. Only the admin can create rooms, host them, run the games
and open the 40-player demo. Everyone else is a **player**: they see the dashboard read-only and can only join a room with
the code (or the invite link / QR code) the admin shares.

* **Set the login once:** `npm run admin` asks for a username and a password (8+ characters) and saves them to `admin.json`
  — only a scrypt hash of the password is stored, and the file is ignored by git. Run it again to change the password; that
  also signs out every browser logged in as admin. Restart `npm start` afterwards. The server will not start without an admin.
* **Log in:** open the app, press **Admin login** (top right), enter the username and password. The browser stays logged in
  (30 days) until **Log out**.
* **Cloud hosts (Render, Docker):** don't ship `admin.json`; set the `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment
  variables instead (`render.yaml` lists them).
* **If the admin's connection drops**, host rights never pass to a player: a running race or round finishes, and the room
  waits until the admin is back (refresh, or open the invite link again while logged in — the admin takes their seat back).
* After eight wrong passwords from one address, logins from it are refused for five minutes.

Development (hot reload): `npm run dev` → open **http://localhost:5173** (the API/WebSocket server runs on :3000).

Other scripts: `npm test` (299 tests) · `npm run sfx` (re-render the countdown sounds) · `npm run typecheck` · `npm run bots` (rehearsal tool, see §5).

## 2. Running a session (host guide)

1. Start the server (above) and open it in your browser → **Host a room** → enter your name.
2. You get a **room code** (e.g. `K7BQ`), an **invite link** and a **QR code**. Share any of them (chat, screen-share the QR).
3. Teammates open the link / scan the QR / type the code → enter a name → **pick their team** (The Titans, The Vibe Tribe or
   Ctrl + Alt + Defeat — nobody is assigned one, and Join stays disabled until a team is chosen) → they appear in the lobby as
   **drivers**, under their team. The lobby shows the three teams side by side with each team's players and player count, its
   running points and its rank, updated live as people join, leave or switch (a driver can switch teams in the lobby or on the
   results page, never mid-race). Under each team, the names from the team lists who have not joined yet are shown dimmed; typing
   a name that is on a list only puts a "That's you?" badge on that team.
   **The host does not race.** You are the room's spectator and referee: you have no car, WPM, position or place in the
   ranking, you take no seat (the 50 seats are all drivers'), and **Start race stays disabled until at least one driver is
   in**. (To try the game alone, open the invite link in a second browser tab and join as a driver.)
4. Press **Start race**. Everyone gets the same 3-2-1-GO (synchronised to the server clock) and the same passage. The drivers
   race; you get the spectator view — the same road and countdown, the five leading cars (the road zooms out so the last of
   them stays in view), a live standings panel listing every driver with their car, and **End race now** (it asks first).
5. **Winning does not end the race for anyone else.** People who finish see their result and a live ranking while the rest
   keep typing. The results are finalised only when everyone has finished or *genuinely* stopped (see below).
6. **Race again** (new passage) or **Back to lobby** — both need a driver online (on a team). Trophies accumulate as a *room
   championship* across rounds; the host never earns any. **Leave** (or Exit Race in the standings) exits cleanly at any time,
   mid-race too.
7. **Team points.** After every race each finisher earns points for their team from the server's final results:
   **1st 100 · 2nd 75 · 3rd 50 · 4th 30 · 5th 20 · every other finisher 10 · anyone who does not finish 0**. A race's points are
   recorded exactly once, only for people who actually raced (never the host or a spectator), and the totals carry from race to
   race — going back to the lobby or racing again never resets them. The results page shows each team's rank, what the race added
   and its total. When you are done press **End match** (it asks first): everyone gets the match results — each team's total and
   rank, every driver's contribution and the winning team, or **a tie** when the top teams are level (nobody is picked at random;
   equal points share a rank, shown as T1, T2…). **Start a new match** sets all team points back to zero, everyone keeps their
   team. A player who switches team keeps the points they already earned for the old team.

**When is someone marked DNF?** Only for one of these explicit reasons, which the results page states next to the DNF:

| Reason shown | Rule (defaults) |
|---|---|
| time limit reached | still racing when the race deadline passes — **8 min** after GO (`RACE_MAX_SECONDS`); passages are ~350 characters, so anyone typing at 9 WPM or more finishes in time |
| stopped typing | another racer had finished and this one then made **no keystroke at all for 45 s** (`IDLE_DNF_SECONDS`) — anyone who keeps typing, however slowly, is never cut off |
| disconnected | offline for more than **30 s** (`OFFLINE_DNF_SECONDS`); coming back sooner resumes the race and nothing typed meanwhile is lost |
| left the race / ended by host | chose to leave, or the host pressed **End race now** (shown to the host on the results page while others are still racing) |

Good to know: rooms hold up to **50 drivers** (`MAX_PLAYERS`, the host is extra); late joiners watch the running race (with the same
spectator view as the host) and race next round (and a 51st driver gets a "room is full (50 players max)" message); if someone's
phone sleeps or Wi-Fi blips they are put back in the same seat automatically; the host can remove a driver (✕ in the lobby).
The host is always the admin (see "The admin and the players" above): if the admin leaves or drops, **host rights never pass
to a driver** — the race that is running finishes normally, and the room waits until the admin is back.

## 2b. The Weekly Fun Activity (three games in one room)

The app now opens on the **Weekly Fun Activity dashboard**: three games, played in this order, with the same rooms, players
and three teams. **Open TypeDrive** (or Funny Pose Challenge / Tech Trivia) shows the name / **Host a room** / **Join a room** page — for
TypeDrive that is the original landing page, unchanged; the other two use the same form with their own wording. A room you create
there **opens straight in that game's lobby** (TypeDrive → the race lobby, the others → their start screen) and waits for the host
to start; people who join follow the room to wherever it is. **Dashboard** (top right of that page) goes back, and **Leave** from any
room returns to the dashboard. A shared **invite link** skips the dashboard and opens on *Join* with the code filled in. Inside a
room there is also an in-room dashboard (the host's **Activity hub** button or the stepper) with the room code, all scores and the overall
leaderboard; the **host** takes the whole room into an activity (every screen follows at once) and back between games. The host only organises — in all three games the host does not
play and earns nothing. Teams are picked on joining and can be switched on the dashboard, but not while the Funny Pose Challenge or
Tech Trivia is on.

1. **TypeDrive** — exactly as described in §2. (It is opened from the dashboard; its screens, rules and scoring are unchanged.
   Host-only buttons were added to its lobby and match-results pages to get back to the dashboard / on to the Funny Pose Challenge.)
2. **Funny Pose Challenge** (it replaced the earlier emoji-guessing game) — a performance game for the live Microsoft Teams call. The
   host presses **Start the challenge**; each of the **8 rounds** is run by the host, who **chooses only the team** (the three teams
   are shown with how many are here and how many rounds each has played). The moment a team is chosen a **spinner picks one of its
   players at random** — a reel of the team's names that spins on every screen (timed from the server's clock, so everyone sees the same
   spin) and stops on the server's pick, which is then highlighted ("Selected!"). **The host cannot choose the player.** Then **Start
   round** — the picked player's name and team now fill every screen and the pose is still hidden — **Reveal the pose**, and the player
   copies it on the call while everyone watches. How the spinner picks: only a connected participant of that team (never the host,
   never anyone who has left or dropped out); **nobody is picked again until everyone eligible on the team has had a turn** (random
   among those with the fewest turns — the count carries over from session to session, and someone who joins late goes first); a turn
   is counted when the round actually starts, so a spin the host abandons by choosing another team costs nobody theirs (choosing the
   same team again does not re-spin, so the host cannot keep spinning for someone); and if the picked player leaves before the round
   starts, the spinner runs again among the people still there. A pose is a picture to imitate, not something to guess: a drawn
   figure showing the body position and expression, its name, a one-line instruction and a 30 s clock. The host then marks
   **Completed** (+**10** points for the player's team) or **Not completed** (0), and goes to the **next round**; the team scores update
   at once and a round scores once. The host never takes part. The bank holds **24 funny poses** in five categories
   (Reactions: confused face, shocked reaction, laughing, crying dramatically, scared, angry stomp · Heroes: superhero stance, flying
   superhero, muscle flex, karate kick, victory cheer, T-Rex roar · Sleepy & Thinking: sleeping standing up, big yawn, the thinker, big
   shrug, dramatic faint · Dance Moves: disco point, robot, chicken dance, surfer balance · Attitude: sneaky spy, selfie, royal wave —
   all in `shared/poses.ts`, each drawn from joint angles by `src/portal/PoseDrawing.tsx`, so no image files are needed). A session
   deals 8 of them, spread over the categories, and the next session avoids those until the bank would run short. Which pose a round
   has is dealt by the server and sent to the screens only when the host reveals it.
3. **Tech Trivia** — **5 questions** per quiz, each from a different topic (Python, AI, SQL, Git, Cloud, general software; bank of 24 in
   `server/data/trivia-bank.ts`), one at a time with four options and a 20 s timer. Everyone answers on their own screen; an answer
   is final. A correct answer is worth **100 + up to 100 for speed**; a team's score for a question is the **average** of its players'
   points (non-answers count 0), so a bigger team has no advantage. The question closes when everyone has answered, the time is up or
   the host reveals it; only then does the server send the right answer (with an explanation and how many picked each option). Final
   screen: team leaderboard (a tie is a tie) and the top players.

**Scores.** Each activity keeps its **own** team points (shown on its card on the dashboard). The **overall leaderboard** adds up
**placements** — in every activity that has scored, 1st = 3, 2nd = 2, 3rd = 1 (equal scores share a place) — because the games score
on very different scales (a race adds hundreds, a trivia question at most 200); teams level on placements are ordered by how many
activities they lead, and if they are still level the dashboard shows a **tie** rather than picking someone. When all three are complete
the dashboard announces the overall winner (or tie). Replaying an activity replaces only that activity's score. Everything is
computed and synchronised by the server (`shared/activities.ts` is the single definition of the order, the point values and the
overall ranking); a client never decides a pick, an answer or a score.

**Restart note:** the server code changed — restart `npm start` after `npm run build`, and refresh the open browser tabs.

### 2c. The arcade design language (look and feel only)

Every screen shares one esports / arcade-racing look. It is a **presentation layer**: no game rule, score, team, pick, message or
server file changed for it, and the existing markup, class names and tests are kept (the layer only adds to them).

* **Where it lives:** `src/arcade.css` (loaded last, so it only adds to the other stylesheets), the small components in
  `src/components/arcade/` (`KeyArt` the three games' key art, `Podium` / `TeamPodium`, `TimerRing`, `CountUp`, `Burst`, `Embers`) and
  `src/audio/ui-sounds.ts`.
* **The first screen and the in-room dashboard** show each game as a key-art tile (a drawn road with cars / a figure on a stage / a
  quiz board), in the fixed play order, with a "Open …" button. Menus (first screen, landing, lobby, difficulty) are *still
  pictures*: a lit floor, a vignette and angled plates — nothing moves across a whole page, as agreed for the landing page.
* **TypeDrive:** a full-lane start sequence (edge vignette, a big number on a shockwave ring, GO flashes the lane and throws rays)
  on the same numbers, lights and clock as before; angled glass HUD plates with a segmented WPM meter; **speed lines** that follow
  the WPM the HUD shows; a finish card with the place as an ordinal; a **podium** for the top three on the results; a gauge on each
  difficulty card.
* **Lobby:** driver cards tinted by team colour, room-code plates, join blip.
* **Funny Pose Challenge:** spotlights and a few slow embers behind the stage, a timer ring, a curtain-style reveal of the pose, a
  burst when a player is picked and on the verdict, a podium at the end. **Tech Trivia:** a marquee, a timer ring that turns red,
  options that slide in and light up green / red on the reveal, counted-up score gains, a podium at the end.
* **Sounds** (`ui-sounds.ts`, synthesized — no files): click, select, tick, ding, whoosh, pop, join, correct, wrong, fanfare. All
  are short and quiet (≤ 1.3 s, the small ones ≤ 0.25 s), **follow the speaker button** (muted = silent, un-mute brings them back),
  stay silent while the browser blocks audio, never repeat faster than their own gap, and only the win fanfare lowers the music for
  a moment. The race-start beeps and the background music are untouched. Nothing on the server or in the race engine knows about
  them. *They could not be listened to in the build environment — only their length, level and gating are tested; please give them a
  listen and tell me which feel too loud or too busy.*
* **Motion rules:** moments (start, finish, reveal, podium) animate; menus do not. Embers and spotlights exist only behind the two
  quiz-style games. `prefers-reduced-motion` turns every animation of the layer off.

### 2d. Branding, the racing wordmark and the arcade race (look and feel only)

* **Whose logo where.** The dashboard (first screen and the in-room dashboard), the Funny Pose Challenge, Tech Trivia and the
  name/host/join page opened for either of them wear the **platform** logo — **GANTEC's official logo (transparent, on the dark theme — `public/gantec-logo.png`), with WEEKLY CONNECT under it** (see 2k;
  `src/components/PlatformLogo.tsx`, names in `PLATFORM` in `src/brand.ts`). **TypeDrive's own logo** (`Logo.tsx`) stays on TypeDrive's screens only: its landing page,
  lobby, race, results and match results. `SiteHeader` takes `brand="platform"`; TypeDrive's default is unchanged. The browser tab
  and icon are the platform's too, and the tab names the game being played ("Tech Trivia · Gantec Weekly Connect").
* **The wordmark** on TypeDrive's landing page ("TYPE FAST. DRIVE FASTER.", `components/landing/RacingWordmark.tsx` + the `rwm-*` rules in
  `src/brand.css`) is a sports coupé **made of its own letters**, in SVG: no font text, no picture. The upper row ("TYPE FAST.", racing
  blue and silver) is the greenhouse — every letter's top edge follows one smooth roofline, a fastback rising to a crown and a raked
  windshield down to the cowl. The lower row ("DRIVE FASTER.", fiery orange) is the body — its top edge is a low rear deck, flat doors
  and a long bonnet falling to the nose. The wheels sit under the two narrowest letters, the **I** of DRIVE and the second **T** of
  FASTER, in round arches bitten out of the lettering (an SVG mask) with a wheel-house liner behind and a fender lip over each tyre, so
  no word is hidden behind a wheel and each wheel is part of the body. The tyres are about 28% bigger than the first version's (radius
  45 against 35) with forged alloys — tread, a blue and an orange sidewall line, a drilled disc, a caliper, five twin spokes and fixed
  glints that do not turn with the wheel. Besides letters it draws only glass behind the cabin, a roof rail, a nose cone with two air
  intakes, a headlight with a daytime strip, a splitter, a rocker sill, a rear wing on two pylons, a tail lamp, and **two booster
  nozzles set into the tail** (one above the other, flush with the back of the body, each with a silver rim and a hot throat). It
  **drives in place** — the car never leaves its mark, the rest is what makes it look like it is doing 200: the car slides in at speed
  (a little motion blur) → the wheels spin up for two turns and then **keep turning at speed** (one turn every 0.3 s, with a pale blur
  disc over the spokes that grows during a surge) → the two boosters light, each burn orange outside and blue-white inside, flickering
  all the time (two flames that are never in step), with sparks and soft puffs of exhaust streaming back from each nozzle → **streaks
  of air run away behind the car** → it plants with one bounce and the tail lamp flares once → from then on it rides on its suspension
  (the body moves about a pixel, the wheels do not) and every 6.4 s the burn **surges** — the flame stretches by about 50%, the
  glow swells, the nose lifts half a degree — and settles again. On a phone the exhaust puffs and the soft shadow behind the mark are
  dropped. The slogan is the `<h1>`'s own text for screen readers; reduced motion shows the finished logo with its flames lit and
  everything still. The other two games keep their own headline. The proportions and the animation are pinned by
  `test/wordmark.test.ts` (wheel size and positions, how deep an arch may bite a letter, the roof and bonnet profile, two boosters and a
  burn no longer than 8% of the car, the order of the timeline, a resting flame that is clearly visible, small tilts and rides only, the
  loops allowed, the particles and streaks, the reduced-motion list).
* **The race** (`src/racing.css`, `components/Vehicle.tsx`, `components/race/Track.tsx`): lit asphalt with floodlight pools, painted
  chevrons and tyre marks that scroll with the road, red-and-white kerbs, a steel barrier, a darkened frame, a finish gantry; cars with a
  glossy finish, panel lines, glowing head/tail lights, a soft shadow and neon underglow, and **wheels that turn** faster with speed.
  Typing becomes effects without touching React: each correct character **flares the exhaust flame**, a fast car (past about 60 WPM)
  lights a blue **nitro jet** and a long speed trail, and when two cars swap places the one that moved ahead flashes (with one soft
  whoosh when it is you who passes). The HUD gauge has **shift lights** (nine lamps, green → amber → red), the leader's position plate
  turns gold, and the standings are a timing tower (place plates, the team's colour down the side, progress bars).
* **Between games**: when the host moves the room to another game (or back to the dashboard) every screen gets a one-second wipe that
  names where it is going (`GameTransition` in `App.tsx`). It cannot be clicked and delays nothing. Funny Pose Challenge's title gets
  marquee bulbs and an ON AIR tag with curtains at the sides of the stage; Tech Trivia gets a LIVE ARENA tag and a faint blue grid.
* **Performance:** the only per-frame work is the existing car placement plus a few `classList` / CSS-variable writes that happen
  only when a value changes (`paintFx`); all motion is transform / opacity on a handful of elements, and the wheel and flame
  animations switch off under reduced motion.

### 2e. The dashboard as a game launcher (look and feel only)

* **Why the three game tiles used to differ in size, and the fix.** `.ph-games` is a stretching grid, so each list item was as tall as the
  tallest — but the visible panel (`.ph-game-in`, the cut-corner surface) is a plain block *inside* the item and only grew to its own
  content. A title that wrapped ("Funny Pose Challenge") or a longer description made one panel taller than the others, and the hovered
  tile (lifted 6 px) looked shorter still. `src/dashboard.css` fixes the layout rather than setting heights: the panel fills its cell
  (`display: flex; flex: 1; flex-direction: column`), the body is a column in which the description takes the spare room and the
  button sits at the bottom, every game name is one line at one size (`min(27px, 7.4cqw)` of the text box, so the longest just fits),
  and the picture is the same 16:10 canvas on all three. Three equal columns from 820 px; one column (max 560 px) below, with the
  whole picture shown on a phone. The first screen and the in-room dashboard use the same tiles, so both are fixed.
* **TypeDrive as the hero** (same size, more light): a warm glow of its own, a light that runs along its top edge every few seconds,
  and a richer picture — the same road and racer, now with a lit skyline, floodlight beams, light trails from the tail lights, a road
  whose centre line flows toward you, exhaust flames, an idling car and a lens-flare line on the horizon. Pointing at the tile speeds the
  road up and lights its neon edge. Funny Pose Challenge gained a boarded stage floor, three spotlights, an audience and a swaying
  performer; Tech Trivia a hex-grid arena, crossing lights, a glint on the screen, a running clock, a glowing right answer and the
  three teams' standing bars. Under reduced motion the pictures are still (the road shows its still dashes).
* **Around the tiles:** the "WEEKLY FUN ACTIVITY" headline in the chrome lettering (speed lines, no fire — that is TypeDrive's), a larger
  GANTEC emblem with a glow and a hairline under the header, HOW IT WORKS as a four-step timeline, the dashboard's own lighting
  (warm left, violet right, a cool wash at the foot, a fine hatch), calmer spacing between the hero, the tiles and the leaderboard,
  and a light that crosses each button on hover. *(The lighting, the emblem, the layout and the tile styling were taken further in 2k; TypeDrive is no longer the "hero" tile there.)*

### 2f. The race lobby as a pit garage (look and feel only)

* **What was wrong with the old layout.** On a desktop the page was locked to exactly one screen tall (`height: 100dvh`) and the three
  teams scrolled *inside* their panel, wrapped into two columns — so the third team was cut off behind a scrollbar — while the host
  card, the level and Start were stacked into the same narrow column, and the invite panel left a gap under it. `src/pit.css`
  replaces that: the page grows with its drivers (normal page scroll), the three bays sit side by side at full height, and **Race
  control** is a band across the top of the grid so Start is on the first screen. Below 1000 px everything is one column (race
  control first, the three bays still across the full width); on a phone Start is a docked bar as before.
* **The paddock** (`.lb-set`, pictures only, click-through): ceiling lights with cones that brighten as the grid fills, a little fog, and a
  pit lane along the bottom — lit in the three team colours, its centre dashes sliding slowly past.
* **Event title and grid board:** "RACE LOBBY" in the chrome lettering, and a board that says **Waiting for drivers / Grid forming / Grid
  ready** (lit red, amber, green) with the room code and the number on the grid.
* **Room access:** each character of the code is an illuminated display that powers on in turn; the QR code resolves in, with a scan
  line passing over it and "Access ready"; Copy code / Copy invite catch a light on hover; the invite link selects with one click.
* **Teams on the grid** (`components/lobby/TeamBoard.tsx`): three **pit bays** — orange for The Titans, purple for The Vibe Tribe, cyan
  for Ctrl + Alt + Defeat — each with a bay number, an emblem, the team name, players / online, points and rank, a lit lamp over the
  bay and a striped kerb along its front. A driver's **car drives into the bay** (with a glow of the team colour behind it) when they
  appear; free places are marked **waiting positions** (P1, P2, P3…) with the outline of a car. The host is never in a bay.
* **Race setup:** a panel tabbed "Race setup". **There is no card for the host any more** (the "Race host · Spectator" panel with the
  eye, the name and the status line was removed on request, and there was never any control-tower wording) — the host is still the
  room's spectator everywhere that matters: no seat, no car, never in a bay, never in the race; the lobby's lead line says "You host
  and watch the race", and the race screen shows "HOST · SPECTATING". The level is a three-position throttle (Easy / Medium / Hard
  with Beginner / Standard / Pro under each, the chosen one lit — the host moves it with the same message as the full-screen picker,
  everyone else only sees it) beside the existing "Select difficulty" button; above Start, a **start gantry** of five lamps (captioned
  "Start lights · n/5") lights one lamp per driver on a team, and once three are on the grid ("Grid ready") the Start button glows.
  Start still needs a driver on a team and still opens the level screen first.
* **Layout (from 1000 px):** the room-code panel and Race setup are one band across the top, and **the three teams take the whole width
  beneath it**, so each bay is about 350 px — wide enough for "Kailashnath Sharma" without a clipped letter. While the QR code is open
  the level sits above Start (they fill the height of the invite panel); once the room has more than twelve drivers the QR code folds
  behind its button, and the level and Start sit side by side. On a tablet it is one column; the bays sit three across only where each
  is at least ~280 px wide and stack below that. A full bay (once any bay has more than six drivers, all three) uses **dense rows**:
  a smaller car, no stagger, a green dot for "ready" instead of a line of text — 14 drivers per team fit without a list that scrolls
  inside the bay. The page scrolls normally for forty. The host's name on a team's reference list is no longer counted as someone
  "yet to join".
* **Night circuit:** floodlight masts either side of the page, painted grid boxes on the floor, a lit strip with a chequered end under
  the title, a "Paddock pass" tab on the room-code panel, a shutter bar on each bay, a gear plate on each emblem, cars that park into
  staggered grid slots (the waiting positions are painted corners, not plain boxes) and leave a short skid mark; the three-cell timing
  board (Room · On the grid · Seats) sits under the title.
* **Starting the race:** the 3-2-1-GO lights, ring, numbers and sounds are unchanged and still driven by the server's `goAt`, so every
  screen agrees; a **"Race starting · level · N drivers on the grid" card** now sits over the grid for the whole 3-2-1 (it only reads
  the room and adds no timing).
* All motion is CSS (transform / opacity / a few glows); none of it touches the room or the network, and every lobby animation is off
  under reduced motion. The room code, QR code, invite link, joining, team picking and difficulty logic are untouched.

### 2g. The race results as an awards ceremony (look and feel only)

* **Same data, new staging** (`screens/Results.tsx`, `components/results/*`, `src/ceremony.css`). The ranking rows, scores, WPM, accuracy,
  times, DNF reasons, team points, the host's controls and the host-spectator view are exactly what the server sends; nothing is
  scored, ranked or randomised on the client.
* **The ceremony** (only once the race is over and someone finished): a dark stadium stage with three spotlights, a crowd and camera
  flashes. On the left the **winner announcement** — a large gold trophy, the winner's name in gold chrome lettering, their team, WPM,
  accuracy, time and the team points they earned (a shared first place names everyone; "You are the winner" for the winner). On the
  right the **awards podium**: 2nd, 1st, 3rd on brushed silver / gold / bronze pedestals, a trophy and a spotlight over each, a name
  plate with the team colour, speed and points. It builds itself (3rd, then 2nd, then 1st, then the name plates; the winner's name
  lands with a flash), with confetti for everyone and the fanfare for the podium finishers and the host.
* **Official race ranking:** metallic medals for 1–3, a team-coloured edge on every row, and separate Speed / Accuracy / Time / Team
  points columns (stacked on a phone); your row is outlined in green; rows slide in after the podium.
* **Team standings:** one card per team — what it earned *in this race* (the server's `match.last.gained`; it always equals the sum of its
  drivers' points, which the cards also list, DNFs as +0), its place in this race and its match rank and total. The team with the most
  points this race is lit gold; a tie lights both.
* **Layout:** a wide two-column page (ranking left; your race, the teams and the room championship right) instead of the narrow centre
  panel; one column on a phone, no horizontal scroll. With reduced motion everything is shown finished.

### 2h. The Funny Pose Challenge and Tech Trivia landing pages (look and feel only)

* **What it is.** The name / host / join page opened from the dashboard for these two games (`screens/Landing.tsx`, the same page TypeDrive
  uses) now has its own identity: `src/games.css` (loaded last) and `components/landing/GameStages.tsx` (pictures in SVG / CSS, no
  images, no data from the room). TypeDrive's landing page and its wordmark are not touched. Room creation, joining, the team
  pick, random player selection, scoring and the quiz are the same code — a test pins the form logic and the new files hold no state.
* **Funny Pose Challenge:** a chrome heading in pink and gold with depth and a light glint; a **game-show stage** under the form with
  curtains, a marquee of bulbs, a boarded floor and five of the game's own poses (shocked, laughing, superhero as the star, confused,
  disco), each under its own coloured spotlight with a pool of light and a name plate; they walk on one after another, bob, lift on
  hover, and confetti falls. A glittering magenta / gold backdrop drifts behind.
* **Tech Trivia:** a chrome heading in blue and orange; a **quiz arena** under the form — a giant glowing "?" on a lit stage with
  floating Python, SQL, AI, Cloud and Git badges, circuit traces to each, pulsing rings, light beams, four answer panels with one
  lit, rising particles — on a circuit-pattern backdrop. On a phone it shows the middle of the arena and regroups the badges.
* **The panel:** both pages show the facts of the game under the introduction (rounds / poses / points, or questions / seconds / best
  score — taken from the shared rules and pinned by a test), a larger "Ready to play?" card with equal-height name and room-code
  fields, a Host / Join switch that is clearly lit, and a button in the game's accent colour. The layout fits one screen on a desktop;
  on a phone it is one column.
* Every animation is CSS and is off under reduced motion (the finished pictures stay). `test/games.test.ts` covers the stage, the arena,
  the facts, the unchanged form logic, the stylesheet order and the reduced-motion list.

### 2i. The 40-player demo (a preview with made-up data)

* **How to open and close it.** The **40-player demo** button is in the header of the dashboard and of TypeDrive's landing page (not on the
  Funny Pose Challenge or Tech Trivia pages). It opens the *real* lobby, race and results screens with a make-believe room of 40 drivers; a
  bar across the top (marked **DEMO · 40 players · mock data**) has **Lobby / Race / Results** tabs, **Replay joining**, **View as Host /
  Driver**, **Restart race** and **Close demo** (or press Esc). Closing puts the app back exactly where it was.
* **What it shows.** *Lobby*: the 40 drivers walk in one by one (about 5 s) and park in their team's bay — 13 + 14 + 13 across the three
  teams, each with their own car and their own name in full. You can press Start (the level screen works) and the race begins. *Race*:
  the 3-2-1, then 40 cars on one passage at 46–104 WPM (the race lasts about 40–90 s, like a real one); **Host** view is what you will
  see (all 40 cars on the road — see 2j — and the live standings), **Driver** view is the screen of the driver who
  finishes 20th (WPM gauge, typing bar, "OVERTAKEN" and position banners); when the last driver is home it moves on to *Results*:
  the awards ceremony, the 40-row ranking and the three team cards, with team points by the real table (100 / 75 / 50 / 30 / 20, then 10).
* **Made-up, and sealed off.** The names are the three teams' reference lists minus the host (the host spectates), the speeds come from
  a fixed seed (the demo is the same every time), and the scoring is the shared rules (`shared/game.ts`, `shared/teams.ts`) applied to
  those numbers (`src/demo/mock.ts`). While it is open the socket is muted (only the clock-sync ping goes out), the server's messages are
  ignored, no saved session is resumed, every button the screens use is replaced (Start, Back to lobby, Leave and Exit race do the demo's
  thing; the rest says "This is the 40-player demo"), and it only opens from a screen with no room. No connection is made and no player
  record is read or written (`src/demo/session.ts`, pinned by `test/demo.test.ts`).
* **What it needed in the real screens (look only).** With forty on the road the race screens draw every car (2j), the live standings use
  tighter rows (and redraw 2.5 times a second) when there are more than 14 racers, and the ranking rows give a name more room.
* **To rehearse with real connections instead**, `npm run bots -- ROOMCODE 40 HOST:PORT 45 90` joins 40 scripted typists over the real
  protocol (they spread themselves over the three teams); the lobby, the race and the results above were checked both ways.

### 2j. The race with a big field: every racer has a car (look only)

* **Why the road used to show only a few.** The road has five lanes: a driver saw *their own car and the four closest rivals*, the host
  *the five leaders* (`assignLanes` / `assignLeaderLanes` in `src/game/engine.ts`). With 40 racers the standings listed everyone but 35
  cars had no body on the road. An earlier preview then stood in for them with dots; that is gone.
* **Now, from 13 racers up** (`FIELD_FROM` in `src/game/field.ts`; up to 12 racers the road is exactly as it was) **every racer has a car**,
  and each car **is** a racer: the engine's lane list is simply every racer, in the order the server dealt them, fixed for the whole race
  (a car never hops lanes; a racer who turns up late is added on the end). Nothing is decorative and nothing is invented: a car's place on
  the road is its racer's server-confirmed position, so a car moves when its player types and stops when they stop; WPM, places, scoring and
  team assignment are untouched.
* **Ten lanes, up to four cars each.** The road is cut into 10 lanes (fewer for a smaller field); the cars are dealt round the lanes, so
  40 racers make 10 lanes × 4 cars and every lane has a mix of teams. Each lane is cut into two sub-rows (three above 40 racers) and a
  car that comes within a car length of another in its own sub-row steps into a clear one, sliding sideways like a lane change — so the
  cars of a lane almost never sit on top of each other. On the grid the places of a lane are staggered. Cars that finish roll on past
  the line and park one after another instead of piling up.
* **My car, among forty.** A driver is taken out of the ten lanes and has **a lane of their own in the middle of the road** (40 racers →
  39 cars in 10 lanes, five above and five below, and mine), so the bigger car never has to share space and nothing it wears lies on
  another car or another name. It is **1.4× the size** of the others, framed in a **cyan and gold outline with a slow glow**, has a
  cyan-and-gold **spotlight on the road under it** and the lane itself is tinted along its whole length, and carries a floating gold
  label **"YOU · NAME"** with its place. It always has its full effects (wheels turning, a live flame, the nitro jet and the trail).
  Its team is still the team it picked: the place plate and the standings row keep that colour. The highlight is on for the whole race.
* **Two views, switchable at any time, mid-race** (the **Overview / Driver focus** buttons in the road's top-left corner; the choice
  is the camera only — nothing about the race changes). *Overview* (the default): all 40 cars together, the camera framed on the whole
  field with the leader at the front; zoom buttons (− / FIT ALL / +) zoom in on the leaders. *Driver focus*: the camera follows my car
  and the road scrolls up and down so my lane is in the middle, showing about 5½ lanes at about twice the size; it zooms out just
  enough to keep my six nearest rivals on screen, ahead and behind, and the zoom buttons work here too. The host (who has no car) has the
  Overview only.
* **What each other car carries:** the place on a plate in its **team colour** (orange Titans, purple Vibe Tribe, cyan Ctrl + Alt +
  Defeat — the same colours as everywhere else), its player's name at a readable size (10–15 px), a lit strip of the team colour under
  it, and its own car (every racer has a different one). The leader's plate and strip are gold. **Labels never lie on another car:**
  a label that the car behind would be under shrinks to the plate alone until there is room again. The standings panel is the same list
  from the same numbers, so a car's plate and its row always agree; in a big field **my row is lit in cyan and gold and stays pinned to
  the top or the bottom of the list** while it scrolls.
* **Space.** With a big field the stage uses the whole visible height (the scenery band shrinks to the HUD's height, the typing bar to its
  gauge): about 650 px of road at 1080p instead of 500, so a car is about 30 px tall in the Overview (40 px for mine) instead of 22, and
  the lanes are painted as alternating bands with clearer dashes. On a phone all the cars are still drawn, smaller. The HUD is bigger too:
  WPM, place (`#18 / 40`), the share of the passage done, and the clock; and a bar along the road's lower kerb shows my progress.
* **Effects where the eye is.** Forty cars with every effect on is more than a CPU-only browser pane can repaint (it dropped from 60 fps to
  ~15), so the wheel spin, the jagged flame and the nitro jet are on for my car and the 12 cars nearest the camera's focus (the leader
  in the Overview, me in Driver focus) and a plain glow is used for the rest; the road's moving decoration is written straight onto the
  few elements that show it. Cars sidestep smoothly (the lane change takes 0.4 s) when they would overlap.
  Tests: `test/field.test.ts`.

### 2k. The dashboard as an esports portal (look and feel only)

The Weekly Fun Activity dashboard — the first screen, and the in-room dashboard that shares its header, headline and game cards — was
taken from "three cards on a purple page" to a game-selection screen, in two passes. Nothing it does changed: room creation and joining,
room codes, QR codes and invite links, team assignment, the three-game order and navigation, scoring and the leaderboards, the 40-player
demo button and every piece of text and information that was there. Styles: `src/dashboard.css` (still the last stylesheet),
`src/brand.css` (the logo, its glow and its shine); new parts: `components/arcade/Arena.tsx`, `StepIcons.tsx`, `GAME_KICKER` in `src/brand.ts`.

* **The layout, top to bottom.** Branding top-left; the centre — a centred headline on a pool of stage light, the one-line lead, then the
  four steps as a strip; at the bottom the three game cards in one row (stacked on a phone). On the **first screen** the headline is
  one title card, "WEEKLY FUN ACTIVITY" across the whole width (it scales with the width and the height of the window, up to 104 px),
  and stacks in two centred lines below 640 px of room. The **in-room dashboard** keeps its two columns — the room code has to stay
  beside the headline — but has the same header, arena and cards.
* **The official GANTEC logo, on the dark theme.** The logo at the top left of every platform screen is GANTEC's own logo, not a drawing.
  The company's file is kept untouched in `assets/gantec-logo-original.png` (248 × 70, on white; a test pins its SHA-256), and
  `npm run logo` (`scripts/make-gantec-logo.ts`) makes the dashboard's copy, `public/gantec-logo.png`, from it — and does only this: the
  white background becomes **transparent** (so there is no white card), the orange of the icon and the G is kept **exactly** (#F67C01),
  the dark grey of "ANTEC", unreadable on a dark page, is printed in a soft white (the usual "logo on dark" treatment; change
  `LETTER_COLOUR` in the script to put the grey back), the empty margin is trimmed, and the picture is enlarged 3× with a smooth edge so
  it stays sharp (573 × 111). The shapes, the lettering and the proportions are the original's; a test regenerates the copy from the
  original and compares it byte for byte, and checks the amount of orange and of lettering against the original. It is a plain `<img>`,
  1 em tall at its own proportions, in the lockup's old place (50 px tall at most on the dashboard, 34 px on a phone, 21 px on the
  games' crowded headers), with a warm glow and a soft shadow around it, and the old slow shine passing over it (masked by the logo's own
  shape). **WEEKLY CONNECT** stays a separate subtitle straight under it, silver between two gold bars, with its own band of light. The
  rest of the page is exactly as it was before the logo was replaced. TypeDrive's own screens keep TypeDrive's logo. For a retina-sharp
  result from the company's side, a larger original (an SVG, or a PNG about 750 px wide) dropped into `assets/` and `npm run logo` is all
  that is needed.
* **A live-event arena instead of a purple page.** A black-charcoal base with electric-blue light high on the right, orange low on the
  left and a blue wash at the foot; over it a fixed, click-through layer (`<Arena />`): a lighting truss across the top with seven
  lamps, three searchlights that sway slowly from the three big lamps (blue, cyan, orange), a perspective floor grid running into the
  haze, a fine carbon texture, a dark vignette, and 26 sparks drifting up (orange, cyan, blue). Only transforms and opacity move; it is the
  same every visit (a seeded scatter), it is drawn only on the dashboard, and under reduced motion the lights hold still and the sparks
  are not drawn.
* **HOW IT WORKS.** A metal-edged strip with a lit top bar: a heading column ("How it works", "4 steps") at the left and the same four
  steps side by side — an orange number plate with a small blue icon badge (a controller, a key, a small crowd, a trophy) and the words
  beside it. Two across from 600 px, four across from 1024 px, the heading column from 1240 px; on a phone the steps run down a
  glowing timeline instead.
* **The three cards are equally important.** Still exactly equal (the fix in 2e is untouched), and no card is the "hero" any more: the
  same pool of light, the same neon edge that follows the cut corners, and the same light running along the top edge — one card after
  the other — each in its own colour (orange TypeDrive, pink Funny Pose Challenge, blue Tech Trivia). Each says what kind of game it is
  above its name — **Live multiplayer typing race · Team entertainment challenge · Technical quiz challenge** — then its title, its
  description and a launch button with an arrow that leans in; hovering lifts the card, brightens its edge and sends a band of light
  across its picture; clicking presses. On a narrow card (three across at ~820 px) the button label may take two lines and the
  kind-of-game line keeps two lines of room on all three, so names, text and buttons still line up.
* **The art, reusing the originals.** TypeDrive keeps its road and car, and gains red-and-white kerbs that run toward you, chasing blue LED
  boards, wind past the car, a chrome-blue rim light and gantry lights (orange light, metallic-blue accents). Funny Pose Challenge: a
  pink-and-violet live stage — a lighting truss, an LED wall with a halo, a turning ring and an equaliser, falling confetti — with the same
  performer and audience. Tech Trivia: a cyan hologram question mark, code / chip / braces / binary / AI symbols, circuit traces with a
  pulse running along them, a scan-lined screen — with the four answers, the clock and the standings as before.
* **Measured in the browser (CPU-only pane):** 1920 × 1080 and 1440 × 900 show the whole dashboard, launch buttons included, without
  scrolling; 1366 × 768 scrolls about 90 px (the buttons start just below the fold); the three cards are exactly the same width, height
  and button position at 1920, 1440, 1366, 1024 and 820 px (equal single-column cards at 768 and below); no horizontal overflow from 360
  px up; no console errors. All three entry points were driven for real: *Open TypeDrive* → name / host / join → Race lobby; *Open Funny
  Pose Challenge* → the game screen with its stepper; a click anywhere on the *Tech Trivia* card → its screen, and Dashboard from there
  → the in-room dashboard with the arena and the big lockup. Moving pictures cost frames in a CPU-only pane, so no filter or blur sits
  over them — the shadow under a card is a blurred shape behind it, drawn once.
  Tests: `test/dashboard-upgrade.test.ts`, with the older pins updated in `test/dashboard.test.ts` and `test/brand.test.ts`.

## 3. Making it reachable for your team

Players need a URL they can open. Pick one:

| Option | Cost | Who can join | How |
|---|---|---|---|
| **A. Same office network / hotspot** | free | people on the same Wi-Fi/LAN | `npm start`, share the **Network:** address it prints (the lobby's invite link/QR already uses it). Windows will ask to allow Node through the firewall the first time — allow **Private** networks. Some office/guest Wi-Fi blocks device-to-device traffic ("client isolation"); if so use B or C. |
| **B. Temporary tunnel from your laptop** | free | anyone with the link | While `npm start` runs: `cloudflared tunnel --url http://localhost:3000` (Cloudflare "quick tunnel", no account) or `ngrok http 3000` (needs an ngrok account). Share the `https://…` URL it prints. This exposes your running game server to the internet until you stop the tunnel — only do it with your org's OK. |
| **C. Cloud host (always-on URL)** | free tier / paid | anyone | Any host that runs a **long-lived Node process with WebSockets**: Render (`render.yaml` included), Railway, Fly.io, or any Docker host (`Dockerfile` included). HTTPS is automatic on these, and the client switches to `wss://` by itself. |

**Deploying to Render (example):** push this folder to a Git repo → Render dashboard → *New → Blueprint* → pick the repo
(it reads `render.yaml`) → deploy → share the `https://….onrender.com` URL. The free plan sleeps after ~15 min idle, so
open the site a few minutes before the event (or choose a paid plan). **Nothing has been deployed for you, and no
accounts/secrets are needed or included.**

⚠️ Run **one instance only**. Rooms live in memory, so a second instance would split the room. Restarting the server
ends active rooms (clients show "room closed" and return to the start screen).

Not suitable: Vercel/Netlify serverless functions (no long-lived WebSockets).

### Configuration (all optional environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP + WebSocket port |
| `HOST` | `0.0.0.0` | bind address (`127.0.0.1` = this machine only) |
| `MAX_PLAYERS` | `50` | players per room (hard maximum 100 — every racer receives every racer's position 10×/s, so cost grows with the square of the room size) |
| `RACE_MAX_SECONDS` | `480` | race deadline, counted from GO. The only thing that stops someone who is still typing |
| `IDLE_DNF_SECONDS` | `45` | after a finisher exists, a racer with no keystroke for this long stops holding the results back |
| `OFFLINE_DNF_SECONDS` | `30` | how long a disconnected racer is waited for |
| `MAX_KEYS_PER_SECOND` | `40` | anti-cheat key-rate limit per player |

(`FINISH_GRACE_SECONDS` from the first version no longer exists: it was the cause of the DNF bug — see below.)

### The DNF bug that was fixed

The old server ended every race **45 s after the first finisher**, whether or not the others were still typing. In a
38.4 s race with typists at 26 WPM and 19 WPM, that moment (83.4 s) found them at 98 % and 72 % → recorded as DNF. Two
client defects made it worse: keystrokes typed while the socket was down were never re-sent (the car moved, the server
never knew), and a throttled background tab could close its own healthy connection. All three are fixed and have
regression tests (`test/race-lifecycle.test.ts`, `test/engine.test.ts`, `test/socket.test.ts`).

## 4. How it works

```
phones / laptops  (React + Vite + Tailwind, TypeScript)
      │  WebSocket (JSON)
      ▼
one Node process (TypeScript, `ws`) — serves the built site AND the socket; in-memory rooms, no database
```

* **Server-authoritative.** Clients only send keystrokes (`seq`, `char`). The server checks each key against the passage,
  advances position, counts wrong keys, keeps a rolling-window WPM, stamps finish times, ranks everyone and computes
  WPM / accuracy / score / trophies. Clients never report a score; made-up messages are ignored.
* **Instant feel, no desync, no lost keys.** The client predicts its own typing, then reconciles on every server `ack`
  (server position + still-unacked keys). A key the server dropped is rolled back; a predicted finish the server did
  not confirm is reverted. Every keystroke stays queued until the server acknowledges it, so anything typed during a
  disconnect is re-sent, in order, as soon as the player is back in the room.
* **Synchronised start.** Server picks `goAt`; each client estimates its clock offset by ping/pong (lowest-RTT sample)
  and counts down against it.
* **Reconnects.** A per-tab token (`sessionStorage`) resumes the same racer (position, trophies, results screen) after a
  refresh, sleep or network blip. Same name from a new device also reclaims an *offline* seat.
* **Many racers.** The track shows **you + the 4 closest rivals** (the reel's 5 lanes); the HUD's list button opens live
  standings for **everybody** (up to 50). There are 50 distinct vehicle looks, so every seat in a full room is different.

Layout: `server/` (rooms, protocol handling, static files; `server/games/` the Funny Pose Challenge and Tech Trivia sessions, `server/data/` Tech Trivia's
question bank — kept server-side so answers never reach the client bundle) · `shared/` (wire protocol + pure rules used by both sides;
`activities.ts` the three activities, their scoring constants and the overall ranking, `poses.ts` the 24 poses and the geometry that draws them) ·
`src/` (React app: `screens/` — `Welcome.tsx` (the first page), `Hub.tsx`, `FunnyPose.tsx` and `TechTrivia.tsx` are the new screens, `portal/` their shared
frame, team roster, score strip, pose drawing and timers, `portal.css` their styling, `components/race/`, `components/landing/` + `landing.css` for the landing page, `lobby.css` for the lobby (which reuses the landing page's panels, title and buttons), `scenery.css` + `components/race/Crowd.tsx` for the race screen's cheering crowd and sponsor boards, `game/sizing.ts` for the race stage's geometry (speedometer and typing-bar sizes), `game/engine.ts`, `net/socket.ts`, `store.ts`) · `test/` ·
`docs/REFERENCE_ANALYSIS.md`.

### Customising

* **Passages** — `server/passages.ts`: two sentences each, 300–350 characters (a test enforces ASCII letters/space/comma/period,
  the length, and uniqueness; #1 opens with the reel's passage). The race deadline (8 min) is sized for them: anyone typing at
  9 WPM or more finishes in time.
* **Background music** — `public/music/f1-theme-trimmed.mp3` is the supplied F1 theme **minus its first 20 seconds**: everything from
  00:20 to the end (the source is 10:34, so the track is 10:14), 80 kbps stereo MP3 (~6 MB, no metadata). It is levelled with a gentle
  dynamics pass (about −14.7 LUFS; no 10-second stretch is quieter than −28 dBFS RMS), peaks held below full scale, with a 1.5 s fade-in and a 3 s
  fade-out so the loop seam is soft. One shared player (`src/audio/`) plays it as one continuous soundtrack across the landing
  page, lobby and race, looping the whole track until the player mutes or leaves, at 25 % element volume (`MUSIC_VOLUME` in
  `src/audio/controller.ts`; about −27 LUFS at the output). Browsers block sound before the first click/keypress, so it starts on
  that first interaction (entering the lobby or the race re-checks it, and a small "Tap anywhere for sound" note hangs under the
  speaker while it is held back); the speaker button at the right end of the header on the landing page, lobby and race screen
  controls it, and a mute is kept in `localStorage` (`typedrive.music`). To re-cut it:
  `ffmpeg -ss 20 -i source.mp4 -vn -filter_script:a docs/music-filters.txt -c:a libmp3lame -b:a 80k -ar 44100 -ac 2 -map_metadata -1 -id3v2_version 0 -write_xing 1 f1-theme-trimmed.mp3`
  (the levelling, limiter and fades are in `docs/music-filters.txt`; the fade-out start `st=` must be the track length minus 3 s).
  The server sends `Cache-Control: no-cache` + `Last-Modified` for everything except the hashed `/assets/` bundles, so a track
  replaced in place is picked up on the next load (an unchanged one costs a 304, not 6 MB).
  The 10-minute original recording is not part of the project.
* **Race-start sounds** — a beep for **3 · 2 · 1** (the same `public/sfx/countdown-beep.wav` at rising pitch, +0/+2/+4 semitones) and a
  stronger, longer **GO!** (`public/sfx/countdown-go.wav`: A-major stab, deep impact, engine-rev sweep, swoosh). Both are synthesised
  by `npm run sfx` (`scripts/make-countdown-sfx.ts`, no samples, no dependencies) as mono 44.1 kHz WAV so the first sample is the
  first sample played. They are scheduled from the same server-clock green-light time (`goAt`) that draws the lights —
  `countdownStage()` in `src/game/countdown.ts` is the one definition both read — and handed to the Web Audio clock up front
  (`src/audio/countdown-audio.ts`, browser side `src/audio/sfx.ts`), so a busy page or a throttled timer cannot delay or double
  them: each cue plays once per race (keyed by race id + `goAt`), a cue whose moment has passed is dropped, never played late,
  and a reconnect or refresh only plays what is still ahead. The music glides down to ~35 % under the effects and eases back
  about a second after GO (it restores itself even if the race screen is torn down). The speaker's mute silences the effects too;
  while the browser still blocks audio (no click or key press yet) the countdown is simply silent. Sound only reads the race
  start — nothing in the engine, server or timer reads sound (a test enforces this). Loudness: `SFX_VOLUME` in `src/audio/sfx.ts`.
  **Licensing:** this is a commercial recording — fine for an internal team session, but get the rights (or swap the file) before
  sharing the game publicly.
* **Names** — players always type their name; nothing pre-fills it and the browser never stores it (`src/screens/Landing.tsx`, `src/store.ts`).
* **Name/branding** — `src/brand.ts`. The wordmark follows the reel's; it is someone else's product name, so rename it
  before sharing beyond the team.
* **Scoring & trophies** — `shared/game.ts`. WPM = chars ÷ 5 ÷ minutes (matches the reel's 57 WPM exactly); the *score*
  formula is **mine** (it reproduces the reel's +643 for 57 WPM / 93 %, but the original formula isn't visible).
* **Teams and team points** — `shared/teams.ts`: the three teams, their reference member lists (from the supplied list; anyone can
  still join and pick any team), the points table and the ranking/tie rules. The match ledger lives in `server/room.ts`
  (`recordTeamPoints`, `endMatch`, `newMatch`). Player names are now up to **20** characters (`NAME_MAX`) so every name on the
  lists fits ("Kailashnath Sharma" is 18).
* **Timings** — `server/config.ts`.

## 5. Testing — what was and wasn't verified

**Automated (`npm test`, 466 tests in 31 files, all passing; `npm run typecheck` clean — the real-socket files (`server`, `client-server`, `entry-flow`, `capacity`) can time out when the whole suite runs on a busy machine; run them on their own, where they pass):**

| File | Covers |
|---|---|
| `pose.test.ts` (24) | **the Funny Pose Challenge**: the bank (24 different poses in five categories, every one the brief names present, each with its own drawn figure that stays inside the picture, 8 dealt per session across the categories with no repeats until the bank runs short), the message parser (no "choose a player" message exists), and in a room (virtual time): the host chooses only the team and the server picks the player from it, the spin lasts exactly the spin time and Start waits for it, the pick really is random (240 spins, all six players of a team come up, no fixed order), **fairness** (nobody twice before everyone, over several cycles and across sessions, a late joiner first, a spin the host abandons costs nobody their turn, no re-spin for the same team), never someone who dropped or left (40 seeds), the spinner running again if the pick leaves mid-spin or before the round starts (or back to choosing a team when nobody is left), participants cannot run anything, steps only in order, the pose absent from every payload until the reveal, 10 points once per round (0 for not completed), a whole 8-round session, identical spinner state on every screen, session replay with new poses, host leaving / taking over — and the whole round over real WebSockets |
| `activities.test.ts` (23) | **the Weekly Fun Activity**: Tech Trivia's bank and question picking (server-only, never imported by client code), the speed bonus, the overall leaderboard (placements, ties, activities with no points), and in a room (virtual time): the dashboard as home, host-only navigation, TypeDrive untouched and not leavable mid-race, a whole Tech Trivia quiz (answer rules, per-team averages, team size not mattering, once-only scoring, no right answer in the payload, top players), scores for the three activities staying separate and adding up on the overall board, the payload size at 50 players — and Tech Trivia over real WebSockets |
| `portal-ui.test.ts` (23) | the new screens (source-level guards): routing order with TypeDrive's routes unchanged, the dashboard (three activities in order, host-only open, overall board, tie), the Funny Pose Challenge (team buttons only — no way to choose a player in the screen, store or protocol, host-only team buttons, the spinner timed from the server clock and stopping on the server's pick, nobody named or lit until it stops, Start waits for it, pose drawn only once its id arrives, every host step, SVG drawing, reduced motion, no trace of the old emoji game), Tech Trivia (answer is final, right answer drawn only after the reveal), the store messages, the accents |
| `entry-flow.test.ts` (9) | the first screen and how a room starts: the create message's validated `activity`, real sockets — a room created from "Open TypeDrive" opens in TypeDrive's lobby with a spectating host, a joiner lands there with the team they picked, and the race starts from it; Funny Pose Challenge / Tech Trivia rooms open in their games, no or invalid choice → the in-room dashboard — plus source guards: the app starts on the dashboard, the original landing page and its wording are intact, leaving returns to the dashboard, invite links skip it |
| `arcade.test.ts` (17) | **the arcade look** (guards and unit tests): every interface sound is short and quiet, muted/locked audio is silent, per-cue rate limit, spinner ticks climbing in pitch, only the fanfare ducks the music, no server/shared/engine code imports the sounds; the podium's 2nd–1st–3rd order and ties; `arcade.css` loaded last, no animation in the still environment, embers only on the two quiz-style stages, a reduced-motion rule for every animated class, key art on both dashboards, the start sequence still on the existing numbers/clock, speed lines driven by the HUD's WPM, podiums on every finale |
| `brand.test.ts` (20) | **branding and the race's look**: the platform lockup (no TypeDrive wording), the platform header on the dashboard / in-room dashboard / both other games / their landing page and TypeDrive's header unchanged, no platform screen using TypeDrive's logo, the tab title and icon; the wordmark (only on TypeDrive's headline, words unchanged, every decoration behind the letters and `aria-hidden`, the animations and reduced motion, phone header sizes); all 50 car looks render with two turning wheels, gloss, lights and shadow and no randomness; typing effects done only through classes / CSS variables (no React state), written only when they change, nitro hysteresis, an overtake needing a real gap and a car of my own; the shift lights; the game-to-game wipe (only on a change, click-through, reduced motion); the game-show / arena identities only on their own screens |
| `dashboard.test.ts` (13) | **the dashboard tiles and picture**: the layout fix for equal tiles (panel fills the cell, body a column, text takes the spare room, button at the bottom, one-line names at one size, no fixed heights), three equal columns / one column, the same 16:10 picture; the first screen and the in-room dashboard built from the same parts with all their information and handlers; all three pictures on the same 320 × 200 canvas with unique ids, the original TypeDrive road and racer still there, every picture animation off under reduced motion with a still-road fallback; the hero glow and edge light on TypeDrive only; the headline (same words, chrome, no fire); HOW IT WORKS keeping its four steps; the stylesheet loaded last |
| `field.test.ts` (31) | **a car for every racer**: the geometry (40 racers → 10 lanes × 4 cars in two sub-rows, 13 → 10 lanes, 50 → 10 × 5 in three; every car in its own cell; the staggered grid; the zoom steps); cars that come close take another sub-row (the car behind steps aside, nobody flickers when none is clear); the engine against real racers (40 racers → 40 lane entries, no gaps or duplicates, never the host; the order never changes during a race even when the race order is reversed; a late racer gets a car and every car is in the standings; a car moves only with its racer's server position and stops when they stop; up to 12 racers the road is the normal five lanes; zoom resets per race); **my own lane and car** (a driver gets an eleventh lane in the middle, no other car is ever in it, the car is 1.4× the others' and fits with room for its label); labels that never lie on another car (the front car shrinks to its plate, the one behind keeps its name); the effects budget; the camera (Overview frames the leader and the whole field, Driver focus follows my car, the host always has the whole field, a small field is untouched, switching changes no race number); the focus scale that keeps the six nearest rivals on screen; and the sources (one car per lane entry, nothing decorative, `field.css` scoped to the full field, the light-weight choices, the dot map gone) |
| `demo.test.ts` (23) | **the 40-player demo**: forty drivers split 13 + 14 + 13 over the three real teams, each with their own car and a name that fits; the split is even for 0–50 drivers; names come from the reference lists minus the host; the same data every time; the real pit bays rendered for 1, 10, 20 and 40 drivers (every driver in their team's bay, every name printed in full, no host panel, dense rows once a bay is full); the race (nobody goes backwards, all finish in a real race's time, the live state sorted leader first, the driver view is 20th of 40); the results (places by finish time, points by the shared table, each team's total is the sum of its drivers', the room carries the numbers the server would); and that it never reaches a real room (no socket / fetch / storage, muted socket, server messages ignored, opens only with no room, every action replaced and restored, the buttons and Close / Esc, the bar and its stylesheet) |
| `wordmark.test.ts` (17) | **the hero logo as a car made of letters**: both rows spell the slogan with the word gaps kept; the roofline is one smooth rise-crown-fall with no cabin letter squashed below a third; the beltline has a low deck, flat doors and a falling bonnet with no body letter below 70%; the wheels sit under the I of DRIVE and the second T of FASTER at coupé-like positions; every arch leaves every letter at least 55% of its height and clears its tyre; the markup (two masked arches cutting only the body row, 9 + 12 vector letters, no font text, unique ids, decorative); the tyres 25–30% bigger than the first version’s; two booster nozzles inside the chassis with a burn under 8% of the car’s length, nothing an image or a font; the animation in order (wheels turning → boosters light → trails → car plants → idle), the idle bob / pitch / flame kept small, the bounce moving the body and not the wheels, no loops on a phone; the entrance keyframes |
| `results.test.ts` (12) | **the awards-ceremony results**: the team summary as a pure function against the server's numbers (each team's total = the sum of its drivers' points = `gained`; the server's figure wins if it ever differed; ordering; ties light every top team; nobody lit when nobody scored; DNFs listed as +0), the podium rendered for real (2nd-1st-3rd, silver-gold-bronze, a trophy each, "you" marked), the winner announcement (all the figures, a shared first place, "You are the winner", nothing when no one finished), the team cards, and guards that nothing is scored or randomised on the client, the host's controls and spectator view are unchanged, live results have no ceremony, the reveal order, the ranking's columns, and reduced motion |
| `games.test.ts` (10) | **the Funny Pose Challenge and Tech Trivia landing pages**: the stage rendered for real (five of the game's own poses, one star, real titles, bulbs and confetti), the arena (the "?", five topics, four answer panels with one lit, unique ids), both decorative and image-free; the facts under each introduction equal the shared rules (rounds, poses, points; questions, seconds, best score); the page keeps TypeDrive's scene and sections, the form logic is the same code and the new files hold no state or network; `games.css` loads last, is scoped to the two games, has no network assets and every motion in the reduced-motion block |
| `lobby.test.ts` (13) | **the pit-garage lobby**: the three bays rendered for real from fixture rooms (an empty grid is three numbered bays with emblems and waiting positions; a driver's car sits in their team's bay and the free positions shrink; names, counts, points and rank come from the snapshot; the host is never in a bay; join / switch buttons only for a driver between races), the difficulty throttle (three positions, host can move it, others see it disabled), and guards that room code / QR / invite / copy, the host spectator card, Start's rules and the level flow are untouched, that "grid ready" is only a look, that every lobby animation is off under reduced motion, that the old height lock / scrolling team list / wrapped third team are gone, and that the countdown card adds no timing |
| (existing files) | the earlier tests all still pass (incl. `difficulty.test.ts`); the test helpers now take the host to TypeDrive first (a new room opens on the dashboard) |
| `race-lifecycle.test.ts` (18) | the real room logic under **virtual time**, on the shipped ~345-character passage: the reported 98 % / 72 % scenario, normal finish, finishing while others race, a 98 % racer continuing long after a win, every genuine DNF cause (deadline, inactive, offline, host-ended, left), a 9 WPM typist finishing inside the default deadline, delayed delivery, identical results for all clients, reconnect and race-again |
| `long-passage.test.ts` (4) | **every shipped passage** raced end to end (finish detection, time, WPM, accuracy, score); a **35-driver race** under the shipped rules where even a 12 WPM typist finishes and nobody is DNF, with one shared passage; the 35-driver lobby's online count |
| `capacity.test.ts` (10) | **50 drivers + the host on real sockets in one room**: join, 50 distinct looks (the host holds none), 51st driver refused, configurable capacity that counts drivers only, reconnect/same-name while full, ghost-seat eviction (never the host's), a synchronised 50-driver race, reconnect + race-again at 50 — plus a **35-teammate session** (roster, counts, one shared 300–350 character passage, identical results) |
| `client-server.test.ts` (8) | the **real client engine ↔ real server** on long passages with injected 80–160 ms latency, a severed connection while typing, a server that drops a burst of keys, a page refresh mid-race, a genuine DNF, the host leaving mid-race, a driver leaving mid-race, and the **host's real engine in spectator mode** (no car/WPM/position/banners, follows the five leaders) |
| `server.test.ts` (18) | rooms/codes, name rules, host-only start/end, shared `goAt`, keystroke validation, rate limit & flood guard, reconnect by token and name, late joiners, host hand-over, kick, lobby pruning, malformed frames — all with a spectating host and drivers who race |
| `host-spectator.test.ts` (15) | **the host never races** (real room logic, virtual time): not racing in any phase, never on the track / in the state / in the results / with trophies, their keystrokes change nothing, a race needs a driver, only the host starts/ends/resets, no seat and no car (capacity counts drivers), host leaving or dropping mid-race, the longest-present driver taking over (and watching from the next race), a demoted host coming back as a driver with a real car, every driver leaving, late joiners |
| `teams.test.ts` (22) | **team play**: the three teams and member lists exactly as supplied, the points table (100/75/50/30/20/10/0), ranking and tie rules; in a room — a driver must pick a team (never assigned; reconnecting keeps it), live roster sync, scoring from the final results with the host/spectators/team-less drivers earning nothing, points recorded exactly once, totals persisting across races and the lobby, switching teams (between races only; earned points stay put), leaving/dropping keeps points, ending the match (host only, after a scored race) with a winner, a tie, a 0–0–0 three-way tie, a new match resetting to zero, a 50-driver payload size check — and a real-WebSocket match from join to winner |
| `teams-ui.test.ts` (13) | the team screens (source-level guards): the picker with no default and Join disabled until a team is chosen, name hint badge only, the three team sections and the lobby's live data, switching only between races, team standings and the confirmed End match on the results page, the match results screen (winner / tie / contributions, host-only new match), and that racing, countdown and audio know nothing about teams |
| `host-ui.test.ts` (12) | the host's screens (source-level guards) — drivers get the race screen, the host the spectator screen with no typing field/speedometer/WPM/position; the lobby with no host panel and a driver-only roster; results headline and championship; the "you are the host now" notice — and the client engine's spectator mode (lanes = the five leaders with stable lanes, camera on the leader, zoom to keep every car in view, anchor clear of the standings panel) |
| `engine.test.ts` (14) · `socket.test.ts` (4) · `game.test.ts` (11) | prediction/reconciliation/keystroke queue/lanes/banners · stale-connection detection · scoring, rules and passage length/charset |
| `music.test.ts` (27) · `static.test.ts` (8) | the background-music controller with a fake audio element (one element ever, fade in/out without jumps, blocked-autoplay → first gesture, entering a screen retries a blocked start, a muted player never auto-plays, stored mute survives a refresh, ducking under sound effects and always coming back, errors never break the game), the shipped track is the 10:14 remainder of the source after its first 20 s (not a 20 s clip) with only the two short cues beside it in `public/` and no references to the old clips, the toggle is wired into all three headers; byte-range, `audio/mpeg` / `audio/wav` serving and `Last-Modified` → 304 revalidation |
| `countdown-audio.test.ts` (22) | the race-start sounds: each cue lands on the instant its light shows (same `countdownStage` function), exactly once per race (re-renders, StrictMode, reconnect, back-to-back races, same race id in another room), never late, silent and un-ducked when audio is locked or muted and picked up when it unlocks, clean-up on leaving the screen, the music ducking and recovering with the real controller, the two WAVs' format/length/level/clean edges (GO stronger than a beep), and that no game, server or socket code knows about audio |
| `ui-contract.test.ts` (3) | source-level guards: names never pre-filled or stored, the landing preview's three alternating sponsor panels, preview animation slowed 40–50 % |
| `race-visuals.test.ts` (9) | the race screen's look: speedometer ≥ 1.4× its old size and seated inside the typing bar (sizing maths shared by JS and CSS, stage fits short/narrow windows), the sponsor boards carry exactly GANTEC / TYPE FAST / DRIVE FASTER, the crowd renders (3 tiles, pose layers, flags, floodlights), the industrial skyline is gone, crowd animation stays light and honours reduced motion |

**Manually, in the in-app browser** (several independent tabs, plus the rehearsal bots for a full 50-player room): create/join
via link, lobby sync, synchronised countdown, racing, banners, finish pop-up, results pages, DNF reasons, "Race again",
refresh-resume mid-race and on the results page, server restart → "room closed", late joiner, a 51st player being
refused, the 50-row lobby / standings / results, a 375×812 phone viewport, and the production bundle served standalone.
The redesigned lobby was also checked with **35 scripted drivers** at 1920×1080, 1366×768, 768×1024 and 375×812 (roster scrolls,
Start stays on screen), followed by a full race on a 347-character passage, "End race now", and back to the lobby. The race screen
(crowd, sponsor boards, larger speedometer with the passage window beside it) was checked at 768×1024 and 375×812 and measured
at desktop size (nothing overlaps the road, HUD or typing text).

**The entry flow was driven in the in-app browser** (port 3100): open the app → dashboard → Open TypeDrive → name → Create room →
race lobby (host spectating) → a second tab: dashboard → Open TypeDrive → Join a room (code + team) → lobby → host starts the race →
the participant types, bots race → results with team points; Leave returns to the dashboard; Funny Pose Challenge and Tech Trivia each opened
from the dashboard and created a room that opened on their start screen; an invite link opened on Join with the code filled in.

**The Weekly Fun Activity was also driven in the in-app browser** on its own server (port 3100): the dashboard with 9 scripted
participants joining live; a host and a second browser tab as a participant joining mid-session; **the Funny Pose Challenge**
(choose a team → the spinner runs on the host's and a participant's screen and lands on the same player → Start round → pose hidden →
reveal → completed, over a full 8-round session to the final screen with a tie shown as a tie, plus "Not completed" scoring 0, a new
session replacing the scores, and the participant's own "Your turn!" view with the reference figure; the 24 figures were also rendered
side by side and looked over). **The player spinner specifically:** three rounds in a row on one team picked three different players;
a player who joined afterwards was picked next; and when the picked player left before Start round, the round did not start with them
— the spinner ran again and landed on someone still there); a Tech Trivia quiz with scripted answerers plus a real click as a participant (locked in, answered counts live, reveal with
per-team points, final leaderboard and top players); the overall leaderboard (a tie again, correctly); a TypeDrive race with 6
typing bots from the dashboard through results and match results; and a 375×812 phone viewport (no horizontal scroll on any
screen). **Not checked:** real phones answering trivia, and 50 participants in the new games (covered only by the server-side
payload test).

**The arcade look was driven in the in-app browser** (port 3100) at desktop size and 375×812: first screen and in-room dashboard
tiles, the landing page, the lobby with team-tinted driver cards, the difficulty select with its gauges, the start sequence (3-2-1-GO),
racing with speed lines, the finish card, the results podium, the host's Spectator view, the Funny Pose spinner / reveal / verdict /
final podium, a Tech Trivia question / reveal / final podium — no horizontal scroll on any of them. Two phone problems found that way
were fixed (the difficulty gauge sat on top of the card's text; the host's HUD plates pushed the timer off the screen). **Not checked:**
the sounds by ear, and real phones.

**Rehearsal tool (`npm run bots -- ROOMCODE 49`):** joins scripted typists (random 25–90 WPM, with typos) to a room over real
WebSockets so you can watch a full 50-player race before the event. It is a QA aid, not part of the game.

**Not verified — please check before the event:**
* **Real phones** (iOS Safari / Android Chrome): the soft-keyboard path (one hidden `<input>` handling composition,
  autocorrect and the keyboard resizing the viewport) was designed for it but only exercised with emulated viewports and
  injected keystrokes. Do a 2-minute test with a real iPhone and Android before the event.
* Access from **another device on the LAN** (the server is reachable on this PC's LAN address, but I could only test
  from the same PC) and from the **public internet** (nothing was deployed).
* Firefox/Safari desktop; very long sessions; **audio by ear** (the music, the race-start sounds and the interface sounds could only be
  checked by length, level and gating, not listened to).
* The reel's lobby/matchmaking/garage screens don't appear in the video, so the landing/lobby screens are my own design
  in the same style; coins/XP/levels were intentionally left out (they need accounts).
