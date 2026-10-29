# World intro paintings and looping animations — v0.24.0 full-resolution upgrade

Four source PNG stills at **2048 × 2048** and four **8 × 1024 × 1024** horizontal RGBA animation strips are now installed in this folder. The runtime WebPs are in `public/art/worlds/`.

| World | Visual content in the painting |
| --- | --- |
| `rootkin` | Forest moon under Chitin drop-pod invasion |
| `assembly` | Industrial foundry being overtaken by Rootkin growth |
| `chitin` | Purple hive surface struck by Lumenari energy beams |
| `lumenari` | Crystal fields under Assembly mining operations |

The game intro already loads `/art/worlds/<world>.webp` and `<world>-frames.webp`. `src/ui/WorldIntro.tsx` now cross-fades the frames at **6 fps** with a forward wrapping loop, and continues to show the still when reduced motion is requested or while animations load. Its independent planet zoom remains unchanged.

**Rebuild from source:** From project root run `python scripts/gen-planets.py --check art/world-intro` then `python scripts/gen-planets.py --from art/world-intro`. The importer now understands `-strip.png` directly and refuses strips with the wrong size or a frame-0 mismatch. **Do not run the script without flags**, since the no-flag mode generates the older procedural placeholders.

**Provenance / artistic limit:** Rootkin came from its standalone generated image. The other three 2048px masters were previously upscaled from smaller paintings. This pack corrects frame count/resolution and preserves the approved visual design; it cannot restore unavailable native high-frequency detail for those three worlds. The motion is subtle glow / haze rather than hand-drawn changing terrain.

**PWA / cache:** `vite.config.ts` assigns a new runtime cache (`world-intros-v024-fullres`) to the larger frame WebPs so devices do not reuse the old low-resolution cached strips. Stills remain precached. For the full game, run `npm install && npm run build` on a machine with npm access.

**QA:** `art/review/2026-10-29-world-intro/fullres-integration-qa.json` documents the dimensions, centering, transparency, animation deltas, and SHA-256 digests. These checks passed for the eight imported PNGs and eight emitted WebPs. Full in-browser game testing has not been performed here.
