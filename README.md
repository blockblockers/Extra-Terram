# Extra Terram: The Alien Race Tower Defense

Phase 1 vertical slice: the Rootkin hold a forest moon against the Assembly's construction crew on one fixed maze.
Web first (PWA on Netlify), Android and iOS later through Capacitor. The design doc in the Claude Project is the source of truth for everything beyond this slice.

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
| `npm run lint` | ESLint, including the rules that keep `src/engine` headless and deterministic |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run art` | Regenerates the placeholder background and icons (needs Python with numpy + pillow) |

## Layout

```
src/engine/    headless, deterministic sim: no React, no Pixi, no DOM, no wall clock, no Math.random (lint-enforced)
src/content/   JSON content + schemas; every file carries content_version
src/render/    PixiJS v8 renderer behind a small Renderer interface
src/app/       the loop (fixed 20 Hz timestep, interpolated render, fps cap, idle between waves) and the game shell
src/ui/        React HUD, build bar, tower panel, overlays, menu (static styling, safe-area insets)
src/net/       Supabase: client, auth (OAuth / email link + code / guest), run results + offline queue, leaderboards, match plumbing
supabase/      the SQL migration (tables, RLS, RPCs) and the dashboard setup guide
scripts/       validate-content, sim-smoke, art generators
public/maps/   painted backgrounds, one per map; public/icons/ PWA icons; public/art/ key art
art/           concept sheets, key-art originals, round notes and layout guides (not shipped)
```

## Rules that the structure enforces

- The sim only ever advances through `stepSim`; inputs go through `applyInput`, which validates, applies and logs them with their tick. The log replays a run exactly (`replay`), which is what leaderboards, spectating and anti-cheat will stand on.
- React never re-renders because something moved: the HUD reads a 10 Hz snapshot. The canvas is the only animated surface.
- Maps are painted grids. The path is derived at load (`parseMap`), so a map is authored by typing tiles, never coordinates.
- Safe areas are spacing tokens (`pt-safe-top`, …) from the first screen. Full-bleed surfaces are never inset.
- Content is versioned JSON; `npm run build` fails on a bad balance edit instead of shipping it.

## Deploy

Netlify: build command `npm run build`, publish directory `dist` (both in `netlify.toml`). Node 22. The service worker is served with `Cache-Control: no-cache` so updates roll out.

Accounts and leaderboards need three environment variables (`.env.example`; on Netlify under Site configuration → Environment variables) and the migration in `supabase/`. Without them the game runs fully offline — no login screen, scores stay on the device. The setup walkthrough is `supabase/README.md`.

Identifiers still to register when the time comes: domain (deferred), Android package id (suggested `com.deadblock.extraterram`).

## Controls

Tap a tower in the build bar, then tap a build pad. Tap a planted tower to upgrade (a branch choice at tier 3) or sell it. Desktop: `1`–`3` pick a tower, `Esc` cancels, `Space` pauses. Calling the next wave early banks the remaining seconds as sap.
