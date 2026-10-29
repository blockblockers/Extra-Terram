# Extra Terram v0.15.1 — Art rework delivery

## Installation
This folder is an **overlay**, not a standalone game. Unzip the **game-drop** into the project root, preserving paths. In particular, `art/maps/painted.json` marks all ten maps as painted so `gen-background.py` will not overwrite the new King maps. The ten `public/maps/*.jpg` files are the actual game backgrounds. Large PNG masters and separate editable `.ora` sources are supplied in the full pack only.

Keep the original v0.15.1 files backed up or test on a development branch. Do not substitute v0.13.0 King guides: Foundry Crown is 13×16 (49/30), Elder Fork 13×18 (52/31), and Crystal Throne 13×19 (66/35).

## Changes actually made
- **Maps:** rebuilt the three King boards on the new v0.15.1 layout coordinates, adjusted the color/lightness and trail contrast of the other seven boards; all ten packaged as full-size JPEG quality 94 and PNG masters. King boards include separate trail / socket / objective / scenery layers in editable OpenRaster (`.ora`).
- **Units:** improved dark contours and directional rim highlights on 112 tower-body states, 32 turret states, and 16 creeps including bosses; corrected selected tower mounts, the Stalker Eye T1 leftover, some tier growth, and under-filled creep silhouettes. The existing painted materials were retained.
- **Motion:** rebuilt 212 existing tower/creep motion strips with exact frame-0 matches; added greater visible recoil, sway and gait displacement, and empty final death frames. These are procedural motion enhancements based on approved stills, **not** bespoke leg-by-leg character animation.
- **Effects:** replaced four impact strips, four muzzle flashes, four aura field textures, and the Mandible bite strip. The existing beams and race passive effects were intentionally left untouched.
- **UI:** improved 14 small icons, four favicon/touch icons, and the title artwork lower gradient. The full-size app icon is unchanged.

## Automated validation (run on the new delivered art)
- Map checker: **10/10 ALIGNED**: no weak trail cell or missing socket on the delivered JPEG files. Pad counts and image dimensions match current v0.15.1 layouts.
- Art value checker: **10/10 maps** inside required trail/ground CIE L* and C* ranges.
- Art size/contrast checker: **16/16 creeps** pass.
- Animation motion checker: **212/212 strips** pass.
- Tower checker: **7/28 families** meet every strict silhouette rule, up from **0/28** in the review baseline. All unit contours received the new dark-edge treatment, but 21 families still require more distinctive hand-painted tier and branch silhouettes, especially lookalike T1 families.
- Sprite asset validator: **333 OK, 81 WARN, 0 FAIL** across 414 files examined. Warnings include unsupported map/icon types handled by other validators and certain proportional frame-size differences; they are not all art failures. See full file-by-file log.
- All King `.ora` sources recomposite to their corresponding master pixels exactly.

## Not yet validated
The full v0.15.1 game build and in-game `art-preview` were **not run** because the supplied project ZIP contains no `node_modules`; `npm run validate` stops on the missing `ajv` dependency. These automated checks are meaningful but **not** a substitute for running the game at phone size.

## Remaining artistic work (deferred)
Twenty-one tower families still fail one or more shape/readability metrics (tier growth, branch outline overlap, or likeness across different families). They need hand-designed geometry and matching animated strips; don't treat the present procedural silhouette variants as the final art direction. Suggested next step: prioritize Pile Driver vs Mortar; Ironbark vs Weepvine; Spitter vs Mandible; Web Spinner vs Resin Nest, then finish the close T3 branches. A designer should also review the three King maps' scenery at phone size, since exact geometry and color measurements do not fully assess visual richness.

## Files
`public/`: individual installable files. `art/masters/maps/`: lossless originals. `art/layers/`: King `.ora` and PNG component layers. `art/masks/`: locked geometry masks. `qa/`: validation logs, per-map checker overlays and pad contact sheets, before/after reviews, map acceptance CSV and SHA-256 manifest.
