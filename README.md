# Extra-Terram: The Alien Race Tower Defense

Four races with their own passives, four solo maps plus six versus maps, single player plus online play in five modes: Parallel race, Mirror (sends), Co-op (one shared board), Lanes (a lane each on one board, 2 to 4 players or 2 v 2) and King of the Maze (one trail forking to a base each). Every run can be played as written or with custom rules: up to 100 rounds that keep getting harder and score more, mini-bosses every 10, 5 or 3 rounds, and (co-op) Hard or Brutal difficulty. Each level has two top-score lists: Standard (the level as written) and Ultimate (any rules).
Web first (PWA on Netlify), Android and iOS later through Capacitor. The design doc in the Claude Project is the source of truth for everything beyond what is built.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (also on your LAN for the S24: use the "Network" URL Vite prints)
npm run build      # validate content -> typecheck -> vite build (what Netlify runs)
npm run preview    # serve the production build locally
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run validate` | Checks every file in `src/content` against its JSON Schema and cross-checks ids |
| `npm run sim` | Headless smoke test: determinism, replay-from-log, seed sensitivity, a wave-by-wave summary. `-- --max-towers 8` caps the scripted builder to probe difficulty |
| `npm run sim:seats` | Wallets per seat, tower owners, creep sends and receives, replay with seats; Lanes and King of the Maze (lane ownership, sends, eliminations, placements, 2 v 2) |
| `npm run sim:lockstep` | The shared-board protocol over an in-memory channel: frames, rejects, a lost frame, a hash mismatch |
| `npm run calibrate` | Scans a difficulty factor per level and prints lives left per race |
| `npm run calibrate:rules` | Long runs (`-- --long --rounds 100 --boss 5 [--level id]`) and co-op difficulty (`-- --coop`): how far the scripted builder gets |
| `npm run calibrate:endless` | Scans a level's growth past its script (`-- --level id --hp 1,2,3`) |
| `npm run calibrate:versus` | Scripted builders play every versus map (mirror, mixed, 2 v 2): the round each side fell in, or its lives at the end (`-- --map id --sends 3`) |
| `npm run calibrate:versus-d` | Scans a versus map's difficulty factor (`-- --map id --d 1,1.5,2 [--sends 3] [--teams]`) |
| `npm run check-versus` | Per lane or base: route length, own and shared pads, how much of the route each reaches |
| `npm run lint` | ESLint, including the rules that keep `src/engine` headless and deterministic |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run art` | Regenerates the placeholder backgrounds and icons (needs Python with numpy + pillow); maps with a real painting, listed in `art/maps/painted.json`, are skipped. Ends with `scripts/gen-map-thumbs.py`, which cuts a 640 × 200 strip of every map into `public/maps/thumbs/` for the level pickers (`--force` to redo them all) |
| `npm run check-sprites -- <drop>` | Checks an unpacked art drop (laid out like the game) against the sprite spec before it goes in: sizes, transparency, base line, turret pivots, strip frame 0 against its still, effects, icons, and every tower body with its turret drawn on the game's pivot (warns when a socket shows beside it). Writes `sprite-check.png` into the drop |
| `npm run art-drop` | After copying a checked drop into `public/`: tidies cut stills, refits footprints (never a head-less body or a still with strips), brings strips back onto their still, reduces strips to 256 colours, rewrites `public/sprites/manifest.json` and `mounts.json` |
| `npm run check-art` | Measures the art against the specs in the art review: tower tiers, branches and contours; creep sizes, contours and the step across their outline on every painted trail; map trail and ground values; whether strips really move. `-- towers|creeps|maps|strips --drop <delivery>` checks a delivery before it goes in |
| `npm run audio` | Writes `public/audio/manifest.json` from the sound files in `public/audio/` and the loop points in `audio/loops.json`; an id with no file plays its placeholder |
| `npm run compose-music` | Regenerates the music from `audio/compose/` (a trip-hop set written as code: drums, bass, keys, swing, dub effects, seamless loops), masters it to the brief's loudness targets and writes the encodes and the manifest (needs numpy, scipy, ffmpeg) |
| `npm run check-audio -- <folder>` | Checks a sound delivery against the audio handoff (ids, encodings, 48 kHz, lengths, loudness or peak, head silence, loop seams; needs ffmpeg for the measurements) |
| `npm run art-preview` | Dev server page with the real sim and renderer: towers and creeps chosen by URL (`?level=…&towers=mortar:t3a,…&creeps=mega-dozer,…&speed=1`) to look at new art in motion; versus maps open with every seat filled (`&all=1` builds the towers on every seat's pads); `&flat=1` looks straight down, `&unlit=1` shows the painting without the ground lighting |

## Layout

```
src/engine/    headless, deterministic sim: no React, no Pixi, no DOM, no wall clock, no Math.random (lint-enforced)
src/content/   JSON content + schemas; every file carries content_version
src/render/    PixiJS v8 renderer behind a small Renderer interface; camera.ts (the tilted view: a homography from board px to
               screen px) and ground.ts (the painted map lit as relief, with lights from the shots, through a normal map built at load)
src/app/       the loop (fixed 20 Hz timestep, interpolated render, fps cap, idle between waves), the game shell, lockstep.ts (Co-op frames)
src/ui/        React HUD, build bar, tower panel, overlays, menu (static styling, safe-area insets)
src/audio/     the mixer (Web Audio): music per scene with a battle stem, effects from the sim's events with voice caps, placeholders in code
src/net/       Supabase: client, auth (email + password / link + code / guest), run results + offline queue, leaderboards,
               player search + lobby invites, match service (Supabase Realtime online, BroadcastChannel between tabs when offline)
supabase/      the SQL migrations (tables, RLS, RPCs; 0002 = search + invites; 0003 = run rules + Ultimate list) and the dashboard setup guide
scripts/       validate-content, sim-smoke, art generators
public/maps/   painted backgrounds, one per map, and thumbs/ (a strip of each for the level pickers, from gen-map-thumbs.py);
               public/icons/ PWA icons; public/art/ key art; public/ui/ interface icons
public/audio/  music/ and sfx/ as the audio handoff names them, and manifest.json (written by scripts/audio-manifest.py)
public/sprites/ towers, turrets, creeps, effects and their strips; manifest.json and mounts.json are written by scripts/sprites.py
               (stills and effects are in the offline download; animation strips load on first use and are cached then)
audio/         the audio handoff (AUDIO_HANDOFF.md), loops.json (loop points, trims, tempo per piece), compose/ (the music as
               code: engine, pieces, mastering) and review/ (what came of each sound delivery) (not shipped)
art/           concept sheets, key-art originals, round notes and layout guides (not shipped); art/mounts.json: turret
               pivots off the default and emitter points, kept by hand from the art drops' READMEs; art/review/: the
               art review's notes and the check-art baseline, and what came of each later delivery (2026-10-27-rework,
               2026-10-28-batches, 2026-10-28-round3-updates, 2026-10-28-round5-title, 2026-10-28-round3-candidates);
               art/key-art/: the title paintings as received
```

## Rules that the structure enforces

- The sim only ever advances through `stepSim`; inputs go through `applyInput`, which validates, applies and logs them with their tick. The log replays a run exactly (`replay`), which is what leaderboards, spectating and anti-cheat will stand on.
- React never re-renders because something moved: the HUD reads a 10 Hz snapshot. The canvas is the only animated surface.
- Maps are painted grids. The path is derived at load (`parseMap`), so a map is authored by typing tiles, never coordinates. Versus maps add a `zones` layer of the same size: a digit gives a cell to that lane or base, `.` is shared.
- Safe areas are spacing tokens (`pt-safe-top`, …) from the first screen. Full-bleed surfaces are never inset.
- Content is versioned JSON; `npm run build` fails on a bad balance edit instead of shipping it.

## Deploy

Netlify: build command `npm run build`, publish directory `dist` (both in `netlify.toml`). Node 22. The service worker is served with `Cache-Control: no-cache` so updates roll out.

Accounts and leaderboards need three environment variables (`.env.example`; on Netlify under Site configuration → Environment variables) and the migrations in `supabase/` (0001, 0002, 0003, in order). Without them the game runs fully offline — no login screen, scores stay on the device. The setup walkthrough is `supabase/README.md`.

Identifiers still to register when the time comes: domain (deferred), Android package id (suggested `com.deadblock.extraterram`).

## Controls

The home page is laid on the key art (two lettering-free paintings of the same world, one for each orientation). In landscape (desktop, tablets on their side) a column of six plates over the painting's tree is the menu: Play, Multiplayer, Battlefield (levels, rules, challenge code, top scores), Your race, How to play and Settings, with the race bar along the bottom; the panels open beside the plates. In portrait (phones) the portrait painting shows under the title, and a bar with the race tiles and Play stays at the bottom while the race card, the battlefields and the rules scroll under it.

Tap a tower in the build bar, then tap a build pad: while a tower is picked, every free pad shows how many trail cells it would cover and the best pads turn gold. Tap a planted tower to upgrade (a branch choice at tier 3) or sell it (Sell asks once more before it goes). Desktop: `1`–`9` pick a tower, `Esc` cancels, `Space` pauses. A strip over the board shows the next wave during each build window; calling the next wave early banks the remaining seconds as money. A tier-3 tower can be reinforced (+15% damage a level) — the money sink for long runs. The first run with a race shows a one-card hint for its passive. In Mirror, Lanes and King of the Maze the footer has a *Send* tab (pick which rival, and from round 8 the race's mini-boss at half the income); on a shared board (Co-op, Lanes, King) only the host pauses or changes speed, and only a tower's owner upgrades or sells it. In Lanes and King the waves come on the clock, and a pad ringed in a rival's colour is theirs. A finished match offers a rematch: the host opens a fresh lobby with the same rules and everyone else gets a button to join it.

The board is seen from a tilted camera (a stronger angle in landscape, a milder one on phones) and the painted map is lit as relief — the trail a sunken channel, the pads raised — with the shots, hits, kills and leaks lighting the ground around them. Both are settings — *Map view* (Tilted / Straight down) and *Ground lighting* — in the menu's Settings and on the pause screen, so they change mid-run; straight down and unlit, the board is the painting as before.

Sound: background music (a trip-hop set — the menu theme; a world's calm loop with its battle stem during waves) and game sounds (shots, hits, deaths, leaks, building, the wave cues, interface taps), each with an on/off switch and a volume, plus Mute everything — in the menu's Settings and on the pause screen. Sound plays only while the game is on screen: it stops when the phone locks or the app is put away and carries on when the game shows again.
