# Extra Terram v0.24.0 — animated world-intro integration

This ZIP is the complete v0.24.0 project with the four full-resolution animated world-intro planets integrated.

## Installed assets

- `art/world-intro/{rootkin,assembly,chitin,lumenari}.png`: four 2048×2048 transparent masters.
- `art/world-intro/<world>-strip.png`: eight transparent 1024×1024 frames in one 8192×1024 horizontal strip per world.
- `public/art/worlds/<world>.webp`: four runtime 1024×1024 transparent stills.
- `public/art/worlds/<world>-frames.webp`: four runtime 8192×1024 transparent strips, converted from the PNG animation strips.
- `src/ui/WorldIntro.tsx`: continuous 6 FPS crossfaded loop; reduced-motion preference displays the still; existing zoom and storytelling untouched.
- `scripts/gen-planets.py`: accepts the full-res `-strip.png` source and its matching master; keeps legacy deliveries supported.
- `vite.config.ts`: versioned runtime cache `world-intros-v024-fullres` (avoids cached 443px frames).

## Verify / run

From the project folder:

```bash
python scripts/gen-planets.py --check art/world-intro
python scripts/gen-planets.py --from art/world-intro  # only if you want to regenerate runtime WebPs
npm install
npm run build
npm run dev
```

Start any solo level to see the corresponding animated intro. Test reduced-motion mode; it should show a static planet.

**Avoid running `python scripts/gen-planets.py` with no `--from` or `--check`:** that default mode generates the older procedural placeholders and overwrites the four runtime stills.

## QA and limitations

All 4 masters are 2048px square and all 4 strips contain 8 frames of 1024px. Source frame zero exactly matches the downsampled master in all worlds, alpha is unchanged between frames, and the planet checker passes 4/4. See `art/review/2026-10-29-world-intro/fullres-integration-qa.json` for per-file hashes and measurements. The TS files were syntax checked. The full Vite build was **not** completed here because an npm dependency was unavailable from the offline package cache.

Artwork resolution disclaimer: Rootkin is from a standalone painting; the other 3 were derived from concept-sheet images that had been enlarged prior to this update. These new strips are dimensionally correct, but cannot recover detail absent from the original source. The animation is intentionally a subtle surface/haze light loop rather than a separately painted turntable or 3D rotation.
