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
