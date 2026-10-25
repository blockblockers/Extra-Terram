# Handoff — Phase 1 scaffold (2026-10-22, updated with v0.2.0 art pass)

## v0.2.0 — unit art, weapon effects, sprite pipeline (same day, later)

- `src/engine`: the sim now emits per-tick render events (`fire`, `hit`, `kill`, `leak`, `place`, `upgrade`, `sell`, `wave`) in `state.events`; cleared each step, excluded from the state hash. Determinism unchanged (smoke test hash identical before and after).
- `src/render/sprites.ts`: sprite library. Reads `public/sprites/manifest.json`, preloads listed images, falls back to vector art per sprite. Keys and file layout match the art handoff doc.
- `src/render/vectorArt.ts`: distinct vector units: Needlespire (spire with needle rings; t3a rust-tipped and weeping, t3b twin spires), Ironbark (armoured trunk + rotating seed-pod cannon turret; t3a steel barrel, t3b double pod), Weepvine (hooded bell with trailing vines; t3a surfacing roots, t3b snare loops); Compactor, Dump hauler, Dozer as top-down vehicles; needle and acorn projectiles.
- `src/render/effects.ts`: pooled particles (400, one draw batch): muzzle flashes, projectile trails, impact bursts by damage type, bio drips, death bursts by armour (sparks + tumbling scrap for plated, sap + leaves for organic, shards for shielded), leak pulse, place/upgrade/sell rings. Battery saver halves counts.
- `PixiRenderer.ts`: turret aiming with easing and recoil, aura root-rings with rotating tendrils and motes, slow ring, stun motes, bleed tint, soft shadows under creeps, ellipse selection marker.
- HUD is a fixed two-row layout and the footer slot has a fixed height, so the board never shifts when a wave starts or a tower is selected (it did before; a tap could land on the wrong cell).
- `scripts/sprites.py` (`npm run sprites`, `-- --fit`): fits raw crops from `public/sprites/_inbox/` to the canvas spec and writes the manifest.

Verified: build, lint, typecheck, sim smoke test (hash unchanged), headless phone-size run with placement, waves at 1–3×, selection, tier-2 upgrade; no console errors.


## What was built

A runnable Phase 1 vertical slice of *Extra Terram*: Rootkin towers (Needlespire, Ironbark, Weepvine) against Assembly creeps (Compactor, Dump hauler, Dozer) on one fixed maze (`rootkin-forest-01`, "Mossbank Hollow"), ten waves, economy, lives, win/lose with stars. Vite + React 18 + Tailwind 3 + PixiJS 8 as a PWA; the engine is headless and deterministic.

Verified in this session:

- `npm run build` passes (validate → typecheck → vite build; PWA service worker generated, map art precached).
- `npm run lint` passes, and the engine rules fire: a probe file importing React and calling `Math.random`, `Math.sin`, `Date.now` inside `src/engine` produced four errors.
- `npm run sim` passes: same seed → identical state hash; replaying the input log → identical hash; a different seed → a different hash. The scripted builder clears all ten waves with 11–17 lives (2 stars) depending on how many towers it is allowed, so the easy level is beatable without being free.
- Played in headless Chromium at a 412×915 phone viewport: menu → play, three towers placed by tapping pads, a wave called early and run at 3×, tower panel opened with live stats, no console errors.

## Files (all v0.1.0 unless noted)

| Area | Files |
| --- | --- |
| Project | `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`, `eslint.config.js`, `index.html`, `netlify.toml`, `.gitignore`, `README.md` |
| Engine | `src/engine/{index,types,rng,map,sim,inputs,snapshot}.ts` |
| Content | `src/content/{races,towers,creeps,damage-matrix}.json`, `maps/rootkin-forest-01.json`, `waves/rootkin-forest-01.json`, `schemas/*.schema.json`, `index.ts` |
| Render | `src/render/{renderer,PixiRenderer}.ts` |
| App + UI | `src/app/{App,GameShell}.tsx`, `src/app/{loop,settings}.ts`, `src/ui/{Hud,BuildBar,TowerPanel,Overlays,Menu}.tsx`, `src/main.tsx`, `src/styles/index.css` |
| Scripts | `scripts/validate-content.mjs`, `scripts/sim-smoke.ts`, `scripts/gen-background.py`, `scripts/gen-icons.py` |
| Art | `public/maps/rootkin-forest-01.png` (generated, 768×1024), `public/icons/icon-{192,512}.png` (generated) |

## Decisions made while building (none contradict the design doc)

- TypeScript throughout. The engine's state and content types are the contract the renderer, UI, scripts and later the server all share; it is worth the stricter edits.
- Tailwind 3.4 (classic config file) rather than 4, to match the Deadblock setup you know.
- No `React.StrictMode`: its double-mounted effects would open two WebGL contexts on the one canvas in dev.
- Tiles are 64 px in board space and the board letterboxes into the canvas. The map is 12×16 (3:4); on a phone in portrait that leaves empty space above and below, so Phase 2 portrait maps should be taller (about 10×20).
- The sim stores `px, py` for every creep and projectile so the renderer interpolates between ticks; the sim rate is 20 Hz, the render rate is capped at 60 (30 with battery saver).
- Rootkin "Growth" (towers strengthen while standing) is not in the slice; `Tower.placedTick` is recorded so Phase 2 can add it without a save-format change.

## Balance notes (Phase 2 work, numbers are starting points)

- Kinetic vs Plated is 0.75, so the Rootkin opening against the Assembly is intentionally sluggish; Weepvine's bio DoT (1.5× vs Plated) is the counter. The scripted builder never buys Weepvine first, and a human who does should feel the difference.
- Waves 6–10 are where lives are lost (dozers at 460 hp, leak cost 3). Earlier waves are a tutorial.
- Bounties: 5 / 11 / 30, wave bonus 20, early-call bonus 1 sap per second left. Total sap over a perfect run is about 1,900.

## Pending items

1. **Install the dependencies on Windows** (`npm install`) — `node_modules` is not in the zip. Node 22 is pinned in `netlify.toml`.
2. **Push to the repo and connect Netlify** (build `npm run build`, publish `dist`). Deep links work through the SPA redirect in `netlify.toml`.
3. **Profile on the S24** through `chrome://inspect` with the 3× button held through waves 9–10, and watch for thermal throttling over ten minutes. If frames drop, the first knobs are `MAX_RESOLUTION` in `PixiRenderer.ts` (2 → 1.5) and the battery-saver setting (30 fps).
4. ~~Four small open questions~~ Settled Oct 22: 2v2 Lanes share a team life pool; free-for-all sends hit one random rival (seeded, carried in the send event); bots fill empty seats and move into Phase 4; a fallen King of the Maze base ends the match, ranked by score at that moment.
5. **Project instructions** are still empty: paste the brief's §8 ways of working.
6. Phase 2 starts with content: the other three tower rosters and creep rosters, upgrade branches for all, more mazes per world, painted backgrounds per world, sound. The schemas already accept all eight role slots and creep archetypes; the engine does not yet implement flyers, path-skippers, tower-attackers, buffers, splash or economy towers.

## v0.3.0 — concept-art integration (2026-10-23)

- The art pack's four concept sheets live in `art/concept-sheets/`. They are labelled sheets on fake-transparency checkerboards, so `scripts/cut-sheets.py` cuts the usable units out: flood-fills the checker to true alpha, drops baked ground shadows and label fragments, rotates projectiles to face right, then `scripts/sprites.py --fit` places them on the spec canvases and writes the manifest. `npm run cut-sheets` does both; `npm run art` regenerates everything.
- Mapping (sheet 01, Rootkin columns): column 1 broad/stout → Ironbark; column 2 drooping vines → Weepvine; column 3 narrow/pointed → Needlespire; the labelled IRONBARK pod on sheet 02 is the rotating turret (rotated 135° to point right, one image for every tier). Assembly creeps are sheet 02's three right-facing walkers: small → Compactor, mid → Dump hauler, wide crab → Dozer. Projectiles: sheet 02's green leaf-needle (Needlespire) and gold seed (Ironbark). Swap a folder's files to change any of this; no code change needed.
- 21 sprites in `public/sprites/` and listed in the manifest; every other sprite still falls back to vector art.
- Background repainted to the pack's palette (saturated moss with teal shadow, bark trail with root edges and stepping stones, sap-gold rimmed stumps, gold spawn gate, cyan-green grove heart). Chrome retinted to the sheets' deep teal-navy; `theme_color` and the Pixi clear colour match.
- PWA icons cut from sheet 03's Rootkin tier-2 tree on a teal-navy tile with a sap-gold glow: `icon-512`, `icon-192`, `apple-touch-icon` (180), `favicon-32`, and a safe-zone `icon-maskable-512` for the manifest's maskable entry. `index.html` links all of them.
- UI: build bar and tower panel show the tower sprite (t1 / current tier); the menu shows the three towers as a race preview. `TowerIcon` falls back to a colour dot when an image is missing.
- Renderer: image towers draw at 1.85 tiles with the footprint anchor from the spec; turrets mount at half a tile above the centre on image bodies; creep canvases scale with hit radius (0.95 to 1.5 tiles).

Verified: build, lint, typecheck, sim smoke test (hash unchanged), headless phone-size run with placement, waves, selection and a tier-2 upgrade; no console errors.

## v0.4.0 — four playable races, four maps, new weapon types (2026-10-23)

**Fixes**
- The freeze on the last kill: the loop stopped drawing the instant the board emptied, so the last creep's sprite and death burst never rendered. It now keeps drawing for a 1.5 s settle period (`SETTLE_FRAMES` in `src/app/loop.ts`).
- Painted creeps no longer rotate with the path (which turned them upside down heading left or sideways heading down). They mirror when heading left and lean slightly into vertical travel. Vector creeps still rotate.

**Engine** (`src/engine`, still deterministic: smoke hash unchanged across runs and replays)
- New attack kinds: `beam` (hitscan, optional `chain` to extra targets at 60% damage), `economy` (`income` sap per wave end, scales with tier), `support` (`buff` multipliers on damage, range and fire rate for every tower in range; strongest buff wins, no stacking).
- Projectile `splash` radius (damage to everything in the ring), `critChance` (2× on the sim RNG), `slowOnHit` / `slowTicks`. Branch effects added: `cooldownMult`, `splashMult`, `chain`, `critChance`, `slowOnHit`, `slowTicks`, `incomeMult`, `buffBonus`.
- Events added: `beam`, `income`; `hit` carries `splash` for the ring effect.

**Content** (`content_version` 0.2.0)
- 28 towers: seven per race in the shared role slots (starter, heavy, control, splash, range, economy, support), each with three tiers and a tier-3 branch choice. Trap slots are not built yet.
- 12 creeps: rusher / workhorse / tank for every race. Armour: Rootkin and Chitin organic, Assembly plated, Lumenari shielded.
- Damage matrix softened for mirror matches (kinetic→plated 0.85, bio→organic 0.9, energy→shielded 0.7); counters unchanged.
- Maps: Slag Trench (Assembly scrap plains, normal, vs Chitin), Brood Gallery (Chitin hive tunnels, normal, vs Lumenari), Prism Span (Lumenari crystal fields, hard, vs Rootkin), plus Mossbank Hollow. The validator now walks the path from spawn to exit (it caught two gaps in my grids).
- `npm run sim` plays every level with every race using a role-based builder and prints a balance table; all 16 pairs are winnable by that builder after tuning (Chitin got cheaper towers).

**Art**
- `scripts/cut-sheets.py` now cuts all four races: 48 tower images (3 towers × 4 states × 4 races), the Assembly pile-driver turret, 12 creeps, projectiles. Mapping per race is in the script header. 77 sprites in the manifest.
- Towers without sheet art (splash, range, economy, support for every race) use role-based vector art in the tower's colour; the build bar shows a drawn role glyph for them.
- Backgrounds: one painter, four palettes (`scripts/gen-background.py` paints every map by its `world`).

**UI**
- Menu: race picker (4) and level picker (4), remembered between sessions; build bar scrolls horizontally for seven towers; tower panel describes beams, splash, chains, crits, income and buffs; aura rings use the tower's colour; support towers draw links to the towers they buff.

Verified: build, lint, typecheck, sim smoke test (determinism + replay), headless phone-size runs as Lumenari on Slag Trench (beams, chains, support links) and Chitin on Prism Span; no console errors.

## v0.5.0 — animation playback, title key art, simpler seed (2026-10-23)

- **Animation strips.** Any PNG next to a still whose width is a whole multiple of its height is an animation strip (`t1-idle.png`, `t1-fire.png`, `turret-t1-fire.png`, `creeps/<creep>-walk.png`, `creeps/<creep>-die.png`). `src/render/sprites.ts` slices it by shape, `src/render/anim.ts` plays it (idle/walk loop, fire/die one-shot) in sim ticks, so playback follows the speed buttons and stops on pause. Death strips play as a ghost sprite where the creep fell. Verified with a synthetic 6-frame Needlespire idle strip (removed again; the pipeline is `npm run cut-strip -- <lineup> <frames> <out>`).
- **Procedural idle** when no strip exists: painted towers breathe (1.5% scale, own phase) and flinch on fire; painted creeps bob and roll in time with their speed; turrets recoil as before.
- **Title screen.** `public/art/title.jpg` is drawn full-bleed behind the menu (1536 × 2048 portrait, 150 KB stand-in composed from the faction style sheet). Logo lockup in live text (sap-gold EXTRA TERRAM, pale-leaf subtitle). Panels are translucent with blur. Replace the JPEG with real key art; no code change.
- **Seed → challenge code.** The seed field is gone from the main flow. Play always uses a fresh random code; "Have a challenge code?" reveals an input for replaying a friend's waves; the result screen shows the run's code with a Copy button and offers "Same waves again" / "New waves".
- **Tools.** `npm run guides` exports `art/guides/<map>-guide.png` (trail, pads, spawn, exit on grey) to paint map backgrounds over; `npm run cut-strip` turns a keyframe lineup into a strip and refuses frames that drift more than 6%; the cut-out helpers moved to `scripts/cut_sheets_lib.py` and are shared.
- Art direction for all of this is in the Project doc *Art Round 2 Handoff*.

## v0.6.0 — accounts, login screen, run results, leaderboards (2026-10-23)

Phase 3 from the design doc, plus the Phase 4 match tables and channel so multiplayer gameplay has something to stand on. The game still runs with no backend at all.

- **Login screen** (`src/ui/LoginScreen.tsx`), same door as Deadblock: OAuth buttons (Google by default, `VITE_AUTH_PROVIDERS` adds more), email link + 6-digit code in one email, **Play as guest** always available. Shown over the title key art, before the menu, unless a session or the guest flag exists. Auth redirect errors (expired link) come back as an inline notice. No provider logos are drawn; buttons use a neutral glyph.
- **Guest mode** is deliberate, not a dead end: full single-player, runs wait on the device in a local queue (`extra-terram.run-queue.v1`, cap 50, without input logs) and upload the first time that device signs in. Account bar on the menu: "Playing as guest · Sign in" / name + Sign out / "Pick a name for the leaderboards" the first time.
- **Run results.** `GameShell` reports a finished run once (`onResult`); `App` posts it through `recordRun()` → `submit_run` RPC with the input log (up to 2000 inputs). The result screen says where it went: posted / saved on this device, sign in to post / will post when the connection is back. Local personal bests are kept regardless.
- **Leaderboards.** "Top scores" under the level list (only in builds with a server): one best per player, race dot, stars, score; your posted best when signed in; 30 s cache. Anonymous visitors can read it.
- **SQL** `supabase/migrations/0001_accounts_and_matches.sql`: `profiles` (trigger on `auth.users` + `ensure_profile`), `player_progress`, `run_results`, `matches`, `match_players`, `match_logs`; RLS on all; RPCs `set_username`, `submit_run` (validates ranges, stars-on-loss, duration vs waves; raises the star record), `save_settings`, `leaderboard`, `my_best`, `create_match`, `join_match`, `start_match`, `submit_match_result`, `save_match_log`, `rating_current` (computed, never a counter). Applied twice against a local Postgres 16 with a stub `auth` schema and exercised as three users (join by code, full lobby refused, outsider sees nothing, non-host cannot start, both reports finish the match, anon reads the leaderboard but cannot submit).
- **Client** `src/net/`: `supabase.ts` (null client without env, publishable or legacy anon key), `auth.tsx` (`AuthProvider`/`useAuth`), `progress.ts`, `leaderboard.ts`, `match.ts` (`MatchChannel`: Broadcast + Presence on `match:<id>`, typed `MatchEvent` union for frames, inputs, hashes, sends, board summaries, snapshots). The engine still cannot import any of it (lint).
- **Setup guide** `supabase/README.md` + `.env.example`: migration, keys, Netlify env vars, redirect URLs (with the Netlify preview wildcard), magic-link template with `{{ .Token }}`, Google OAuth client, SMTP note, Realtime note, end-to-end check.
- **Renderer fix:** towers/backgrounds managed by the Pixi Assets cache are no longer destroyed on exit, so a replay no longer re-decodes every sprite (and the "managed by Assets" warnings are gone).

Verified: build (offline and with a dummy Supabase env), lint, typecheck, sim smoke test (hash unchanged); headless phone-size runs: offline build goes straight to the menu with no account bar; dummy-env build shows the login screen, validates the email field, guest → menu → lost run → "Saved on this device · sign in to post it" → account bar "Guest · 1 run waiting to post" → login screen notes the queued run; second run in the same page renders with zero console warnings.

Not done yet (next): the real Google client and redirect URLs are the user's dashboard steps (see the guide); Phase 4 lobby UI and the mirrored-boards mode on top of `MatchChannel`; replay verification of uploaded input logs (an Edge Function that re-runs `replay()` and compares the score); the main bundle grew to ~720 KB with supabase-js — split it with a dynamic import if first paint on 3G matters before launch.

## v0.6.1 — Google parked, email + password sign-in (2026-10-23, later)

- **OAuth is dormant, not deleted.** `authProviders()` returns an empty list while `VITE_AUTH_PROVIDERS` is unset (or `none`), so no provider buttons render and no Google Cloud setup is needed. `.env.example` has the line commented out. Setting `VITE_AUTH_PROVIDERS=google` after the client exists (guide, section 5) brings the button back with no code change.
- **Email + password** is the sign-in: *Sign in* / *Create account* (8+ characters, Show/Hide), *Forgot password?* (reset link → "Choose a new password" screen, driven by the `PASSWORD_RECOVERY` event), *Email me a sign-in link instead* (the link + code flow from v0.6.0). Create-account handles both dashboard settings: with "Confirm email" on it shows the confirm notice; with it off the player is signed in at once. Guest is unchanged.
- Guide updated (section 4): turn **Confirm email off** for now so accounts work with the built-in mailer; password sign-in itself sends no email.

Verified: lint, typecheck, build; headless phone-size run with a dummy server: no Google button, field validation (empty email, missing password, short password), Show toggle, reset and link side doors, friendly "No connection to the server" on a failed sign-in, guest path intact; zero console errors.

## v0.7.0 — art round 2 integrated (2026-10-24)

What the pack contained, against the *Art Round 2 Handoff*:

| Asked for | Delivered | Status |
| --- | --- | --- |
| Animated towers and creeps (strips) | 38 strips: idle (6 f) + fire (4 f) for Needlespire, Ironbark, Weepvine in all four states; turret-fire for Ironbark and the Assembly Pile Driver; walk (6 f) + die (5 f) for Compactor, Dump Hauler, Dozer. Frame 0 is the still, later frames are generated sway/recoil/fade — a usable first pass, not hand-drawn | **In** — dropped straight into `public/sprites/` (the handoff's naming was followed exactly), so the strip player picked them up with no code change |
| Title / loading screen in the tower-art style | 1536 × 2048 painted scene with all four races, planet and floating islands — strong, matches the towers. The title lettering is painted into the sky and reads **"XTRA TERRAM"** | **In** — `public/art/title.jpg`; the live text lockup is hidden while `TITLE_ART_HAS_LOGO` is true (`src/ui/Title.tsx`) so the title is not shown twice. Spelling: the game's name is *Extra Terram* — either regenerate the art without text (the brief asked for text-free) and flip the flag, or decide the brand is "Xtra" |
| In-depth painted backgrounds per world | Not delivered ("deliberately not replaced"; the artist's note says new maps must be painted over `npm run guides` output) | **Open** — still the generated backgrounds |
| — (not requested this round) | 64 stills for the 16 towers that had no sheet art (Whirlseed, Spirebirch, Sapwell, Elderwood; Tar Sprayer, Railgun, Salvage Rig, Relay Mast; Web Spinner, Stalker Eye, Resin Nest, Pheromone Node; Chrono Field, Pulsar, Solar Collector, Resonator), flat vector-icon style | **In as placeholders** — better than the procedural shapes, but visibly flatter than the painted towers next to them; refitted to the tower canvas rule so they are the same size. Round 3: repaint these in the sheet style |

Engineering that came with it:

- **Idle strips between waves.** The loop used to stop rendering whenever nothing moved (the heat rule), which froze idle strips in the build phase. `GameLoop.idleFps` (10 fps) now keeps frames coming while a tower with an idle strip is on the board; battery saver sets it to 0 and towers hold still between waves. Waves still render at the full cap.
- **Strip size.** 38 RGBA strips weighed 8.4 MB, all of it in the PWA precache. `npm run optimize-strips` (`scripts/optimize-strips.py`) quantises strips to 256-colour palette PNGs with dithering: 1.9 MB, no visible change at game scale. Stills are untouched. Run it after dropping new strips in; it skips files already in palette mode. Originals stay in the art pack zip.
- **Key art in the precache** (`jpg` added to the workbox globs and `art/*.jpg` to `includeAssets`), so the title shows offline. Precache is now ~10.2 MB (was 6.9 MB).
- **Key art tuning.** The painted scene ends at y ≈ 1280 with a hard step into a neutral grey fill; `title.jpg` is republished with that fill blended toward the app background and the step feathered, so desktop gutters match. The backdrop is now scaled by height (`auto 100%`) instead of `cover`: identical on phones, and on wide screens the painting sits centred instead of being blown up with the lettering cropped. Untouched originals: `art/key-art/title-round2.jpg`, `title-round2@2x.jpg` (the 3072 × 4096 version is not shipped: 1.3 MB for no visible gain on phones), plus the v0.5 stand-in.
- The artist's notes, inventory and atlas preview are in `art/round2/`.

Verified: lint, typecheck, build, headless phone-size run: login and menu over the new art (phone and 1280 × 800), idle strip frames change between waves, a wave with animated Assembly creeps, flat Whirlseed next to painted Needlespire at matching size; zero console errors.

Art round 3 (when you generate again): painted map backgrounds over `art/guides/<map>-guide.png`; key art without lettering (or confirm the "Xtra" spelling); the 16 flat towers repainted in the sheet style; hand-keyed strips for the remaining painted towers and creeps once the first-pass ones feel too subtle.

## v0.7.1 — art round 4 (2026-10-24, later)

The round-4 pack is an interim pass; the real repaint of the 16 tower families is promised for the next drop.

- **Text-free key art — in.** New cinematic scene (all four races, planet, islands) with no lettering, so the live "EXTRA TERRAM" lockup is back (`TITLE_ART_HAS_LOGO = false` in `src/ui/Title.tsx`) and the spelling question is closed. The scene was upscaled ~3× from a crop of a showcase board, so it is softer than round 2 at native size; `title.jpg` is republished with a mild unsharp mask, the hard edge at y ≈ 1485 feathered, and the lower fill blended to the app background. Originals in `art/key-art/title-round4*.jpg` (the 3072 × 4096 version is again not shipped). Round 5 ask: generate the text-free scene directly at 1536 × 2048.
- **64 tower stills — in, refitted.** Same flat designs as round 2 with a procedural shading/tint/grain pass (the pack's own README says so). They arrived at the original undersized scale again, so `scripts/sprites.py --refit` now exists: any tower still whose artwork fills the canvas more than 8% off the rule (70% for t1/t2, 85% for t3a/t3b, footprint at y = 168) is trimmed and refitted in place; painted towers and anything already right are left alone (59 of 64 changed). Strips are never touched.
- **`npm run art-drop`** is the whole routine for any future pack: unzip it over the repo, run that (refit stills → quantise strips → rewrite the manifest), then `npm run build`. The included `round4-art-polish.py` is archived under `art/round4/`, not `scripts/`: it rewrites sprites in place and references the other tool's paths, so it is reference only.
- Precache is 12.0 MB (title.jpg grew with the sharper, larger scene).

Verified: lint, typecheck, build; headless phone-size run: login and menu with the lockup over the new art, idle strips still playing between waves, refitted Whirlseed next to Needlespire; zero console errors.

Waiting on the next drop: painted repaints of the 16 families (same filenames → `npm run art-drop`), painted map backgrounds (still open since round 2), and eventually hand-keyed strips.

## v0.7.2 — reachable pads, sign-up URL fix (2026-10-24, later)

- **Every build pad can now reach the path.** The normal and hard maps had pads 2.0–4.1 tiles from the nearest path cell; the shortest attack range in the game is 1.8 tiles, so towers there never fired. Rule now: a pad is at most 1.5 tiles (centre to centre) from a path cell — orthogonally or diagonally adjacent. 49 pads were moved to the nearest free cell that satisfies it (pad counts unchanged: 44 / 23 / 24 / 13), the validator fails the build on any pad beyond 1.5 (`PAD_REACH` in `scripts/validate-content.mjs`), and the backgrounds and layout guides were regenerated from the new grids (`gen-background.py`, `gen-guides.py`). The sim smoke still wins all 16 level × race pairs. Difficulty on the harder maps comes from fewer pads and longer stretches of path without them, not from pads that cannot fire.
- **"Invalid path specified in request URL" on Create account** is Supabase's gateway refusing a URL it does not route: it happens when `VITE_SUPABASE_URL` carries a path — typically the REST endpoint (`…/rest/v1`) or the Auth endpoint (`…/auth/v1`) copied from the Data API page instead of the bare project URL. `src/net/supabase.ts` now keeps only the origin of whatever was pasted (and warns in the console), and the login screen explains the fix if the message ever reaches it. `.env.example` and the guide say "bare project URL" in so many words. Fix your `.env` and the Netlify variable to `https://<ref>.supabase.co`, then redeploy with a cleared cache.

Verified: lint, typecheck, validate (the rule rejects a test pad at 2.0 tiles), sim smoke, build with a deliberately wrong URL (`…/rest/v1`) → warning logged, origin used, no errors; headless screenshots of the three harder maps with the new pads.

## v0.8.0 — difficulty scaling, multiplayer lobby and the parallel race (2026-10-24, later)

**Difficulty.** Normal and hard were only harder by map shape; the scripted builder won every level with every race without losing a life. Wave scripts now carry a `scaling` block (`src/content/waves/*.json`, schema-checked): `hpMult`, `speedMult`, `countMult` apply to every creep on the level, and `hpPerWave` / `speedPerWave` ramp per wave (`hp = def.hp × hpMult × (1 + hpPerWave × waveIndex)`, same for speed; counts rounded up; bounties untouched so harder is not richer). Applied at spawn in `src/engine/sim.ts` (`waveMultipliers`); the creep carries its `speedMult`. Engine 0.2.0 (state shape changed), content 0.3.0.

Calibrated with `npm run calibrate` (`scripts/calibrate.ts`: one factor d drives all five knobs; it prints lives left per race for each d). The smoke builder was first made a fairer floor — it now spends bounty during waves and upgrades before it sprawls. Chosen factors: easy 0.35 (still a clean win for every race), Slag Trench 0.65 and Brood Gallery 0.9 (the builder wins three races with lives lost and loses one), Prism Span 1.15 (tight wins, one loss). A human should beat the builder; if a level still feels soft, raise its numbers in the JSON — no code change — and rerun `npm run sim` to see the table. The late waves are the cliff: a few percent of hp decides whether the last wave leaks nothing or everything, which is why the ramp is gentle and the base multiplier does most of the work.

**Multiplayer.** The menu has a *Multiplayer* button. The screen lists the five modes from the design doc; **Parallel race** is playable, the other four are marked *Soon* (they need the shared-board lockstep and sends, the next phase).

- Flow: create a lobby (mode, level, 2–4 players) or join by 6-character code → lobby with seats, race pick, Ready, host Start → 3-second countdown → everyone plays the same level and seed on their own board. A standings strip over the board shows wave, lives and score for every player (board events once a second); finishing broadcasts a `finished` event; the result screen shows ranked standings and updates until everyone is done. Rank: winners by score, then players still playing, then losers by wave reached.
- `src/net/matchService.ts` is the one door: `SupabaseMatchService` (RPCs + Realtime Broadcast/Presence, `MatchChannel`) when the build has a server and the player is signed in; `LocalMatchService` (`src/net/localMatch.ts`: lobbies in localStorage, a BroadcastChannel per match, heartbeat presence) otherwise — two tabs of one browser can race each other with no server, which is how it was tested here. Online lobbies require sign-in (guests get a "Sign in" door); the local transport is labelled as such on screen.
- Results: each client submits its own placement through `submit_match_result` (provisional on finish, final once all have reported); race runs are recorded with mode `challenge`, so they stay off the solo leaderboard.
- `src/net/activeMatch.ts` (`rankStandings`), `src/ui/MultiplayerScreen.tsx`, `src/ui/RivalsBar.tsx`, `RaceResult` in `Overlays.tsx`, match wiring in `GameShell.tsx`, screens in `App.tsx`.

Verified: lint, typecheck, validate, sim smoke; headless two-tab race on the local transport (create, join, ready, start, live standings on both tabs, both finish, both tabs agree on 1st/2nd); solo flow unchanged. The Supabase transport runs the same code against the real channel and is not exercised here — the first online test is yours.

Next for multiplayer, in order: Mirror (sends: spend sap to add creeps to a rival's next wave — `send` events already exist), then the shared-board modes (host-sequenced input frames every 5 ticks, hash every 20, snapshot resync), then bots for empty seats.

## v0.8.1 — title intro, longer mixed waves on normal and hard (2026-10-24, late)

- **Title intro.** The first title screen of a page load shows the painting alone: the key art is preloaded, held for 2.4 s after it has loaded (or until a tap — "Tap to continue" pulses at the bottom), then the panels slide in (`Reveal` in `src/ui/Title.tsx`; the menu, login, multiplayer and new-password screens wrap their panels in it). The backdrop eases from 1.06× to 1× during the hold and the gradient deepens as the panels arrive. Once per page load: coming back from a game shows the menu at once. Reduced-motion users get the hold without the slide.
- **Waves.** Slag Trench and Brood Gallery went from 10 to 14 waves (377 / 385 creeps), Prism Span from 10 to 18 (≈650). The new waves mix group types (rush, column, siege, pincer, escort) and bring in the other races as raids: Lumenari on Slag Trench, Assembly on Brood Gallery, Chitin and Assembly on Prism Span — different armour types mid-level, so one damage type no longer carries a run. Names are in the JSON; the menu shows the new counts.
- **Scaling re-tuned** for the longer scripts with `npm run calibrate`: easy 0.35 (unchanged), Slag Trench 0.65, Brood Gallery 1.3, Prism Span 0.6 — a lower base on hard because the ramp now runs 18 waves (≈1.8× hp and 1.2× speed by the end). The builder wins both normal maps with lives lost (and loses the Lumenari mirror on Brood Gallery); on hard it reaches waves 16–18 and falls — hard is meant to need a real player. If that proves too much in play, lower `hpMult` in `lumenari-crystal-01.json` first (each 0.1 is about a wave of breathing room).
- The smoke builder keeps buying towers past 16 now (the old plan capped it, which made long levels look impossible).

Verified: lint, typecheck, validate, sim smoke; headless: intro hold with the hint, auto-reveal, no intro on return from a game, tap-to-skip; two-tab race still passes; no console errors.

## v0.8.2 — round-5 towers in, map alignment kit (2026-10-25)

- **All 16 tower families repainted (batches A1–A4), in the game.** Painted, same style as round 1; every state present. The crops needed work, now automated in `scripts/clean-stills.py` (part of `npm run art-drop`): sheet grid lines along the crop edges (every Lumenari file), label remnants under the units ("T3A", Assembly), a sliver of the neighbouring cell (Chitin T1s), specks. It reports what it cannot fix: six Lumenari stills are **cut by their crop at the left edge** — `chrono-field` t2/t3a/t3b and `solar-collector` t2/t3a/t3b — usable but visibly clipped on the left blade/petals; ask for a re-crop with margin.
- **Footprint fix.** Tier-3 stills had been fitted at 85% height, which the 256 canvas cannot hold with the footprint at y = 168; they ended up with their base 36 px lower than tiers 1–2 (towers sagged on upgrade). `sprites.py` now caps every state so the base sits on y = 182, and the renderer grows tier 2 by 5% and tier 3 by 14% instead. `--refit` also catches a wrong footprint, not only a wrong size.
- **Map alignment kit** (`art/guides/`, `npm run guides`): per map a `layout.json` (every path cell and pad with pixel centres at 1536 × 2048, lettered columns), a `template@2x.png` (current background, nothing drawn: the image-to-image start), an `overlay@2x.png` (trail band, socket rings, spawn, exit; transparent), a labelled `guide@2x.png`, and `MAP_KIT_README.md`. `npm run check-map <map> <painting>` writes the painting with the overlay and a per-pad contact sheet and reports weak trail cells, centring on straights and pads without a socket. Calibrated: the generated backgrounds pass (Slag Trench is flagged for a low-contrast trail, which is true of it), a painting checked against the wrong map fails on 10 cells and 5 pads.
- Batch notes and QA sheets archived in `art/round5/`.

Verified: lint, typecheck, build; headless: one round-1 and one round-5 tower side by side for all four races, no console errors.

Still missing from the art (specific, for the next drop): the six Lumenari re-crops above; turrets (128 × 128, pivot centre, pointing right) for Whirlseed, Spirebirch, Mortar, Acid Bloat, Stalker Eye, Nova — 4 states each, `turret-t1.png` … `turret-t3b.png`; projectiles (64 × 64) for Whirlseed and Spirebirch; the four painted map backgrounds (now with the kit); the text-free key art regenerated at 1536 × 2048; walk/die strips for the nine creeps without them and idle/fire strips for the painted towers without them.
