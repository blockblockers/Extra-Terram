# Art Round 2 — integration notes

## Added
- 64 individual transparent tower-state PNGs for the 16 previously unpainted tower designs (T1, T2, T3A, T3B), each at 256 × 256.
- Animation strips for the three Phase 1 Rootkin towers (Needlespire, Ironbark, Weepvine): six-frame idle and four-frame fire strips for all four tower states.
- Four-frame turret-fire strips for Ironbark and the Assembly Pile Driver turret states.
- Six-frame walk and five-frame die strips for Compactor, Dump Hauler, and Dozer.
- Replaced `public/art/title.jpg` with the Xtra Terram cinematic scene treatment at 1536 × 2048 and supplied `title@2x.jpg` at 3072 × 4096.
- Regenerated `public/sprites/manifest.json` and added `tower-atlas-preview.jpg` plus `asset-inventory.csv`.

## Animation implementation note
The strips are deterministic frame variations built from the approved still sprites: subtle anchor-preserving body sway/recoil for tower loops and subtle movement/fade frames for creeps. These are usable first-pass animations, not individually hand-painted or skeletal animations; the fire frames retain small muzzle highlights and the death strips use simple fading/debris particles.

## Deliberately not replaced
The four map backgrounds remain the existing backgrounds. New painted maps must be composed against `npm run guides` outputs so their path and build pads line up exactly; concept-sheet map thumbnails are not safe substitutes.

## Validation
- PNG decode check: PASS
- Animation strips checked: 38
- Frame 0 exact match to the still: PASS
- Sprite manifest entries: 179
- Full `npm run build`: not completed in this environment because the uploaded project has no installed dependencies and `npm ci` did not finish; the build stopped at missing `ajv/dist/2020.js`. Run `npm ci` then `npm run build` locally.
