# v0.24.0 — full-resolution world intro integration

The originally delivered 443px frames have been replaced with four 8 × 1024px horizontal source strips and matching 2048px masters. They are imported under `art/world-intro/` and converted to the eight runtime WebPs under `public/art/worlds/`.

The existing `WorldIntro` scene remains the presentation layer. Its animation cadence was changed from the previous 0.55 s forward/backward cross-fade to a forward 6 fps loop with cross-faded wrap (8 frames, 1.333 s cycle). When reduced motion is enabled, only the still image is shown. The 5.2-second intro and independent zoom are unchanged.

`gen-planets.py --from` now accepts the full-size horizontal `-strip.png` and checks exact first-frame correspondence with the master before conversion. The Workbox runtime cache is versioned to avoid showing the older 443px cached frames to returning players.

QA: see `fullres-integration-qa.json` and `fullres-animation-comparison.jpg` for measured results and image checks. Source art quality for three worlds remains limited by earlier upscaling. A full npm build and interactive browser run should be performed after installing dependencies.
