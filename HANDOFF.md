# Handoff — Phase 1 scaffold (2026-10-22)

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
4. **Four small open questions** under Decisions in the design doc (lives in 2v2 Lanes, send targeting, empty seats, King of the Maze base rule).
5. **Project instructions** are still empty: paste the brief's §8 ways of working.
6. Phase 2 starts with content: the other three tower rosters and creep rosters, upgrade branches for all, more mazes per world, painted backgrounds per world, sound. The schemas already accept all eight role slots and creep archetypes; the engine does not yet implement flyers, path-skippers, tower-attackers, buffers, splash or economy towers.
