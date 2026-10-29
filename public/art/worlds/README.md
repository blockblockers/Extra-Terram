# Runtime planet intro assets (v0.24.0 full-resolution update)

Each `<world>.webp` is a 1024 × 1024 still converted from the matching `art/world-intro/<world>.png` 2048 × 2048 master.
Each `<world>-frames.webp` is an 8192 × 1024 (8-frame) transparent strip converted from the matching `art/world-intro/<world>-strip.png`.

`src/ui/WorldIntro.tsx` plays the strips at 6 fps and uses the still as the loading/reduced-motion fallback.
Regenerate with `python scripts/gen-planets.py --from art/world-intro` (never without `--from`: that is placeholder mode).
