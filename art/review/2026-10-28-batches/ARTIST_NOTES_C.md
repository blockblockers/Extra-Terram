# Extra Terram — Batch C: Cleanup and Effects (review candidate)

## Contents
- 33 replacement PNG files at exact `public/sprites/...` paths.
- Assembly: salvage rig T3A/T3B matte repairs and idle strips; Tar Sprayer T3B original painted structure and corrected idle; a dark, oil-like Tar Sprayer field (512 x 512 RGBA); Railgun T3B restored painted straight barrel and matching idle/fire strips.
- Chitin: Pheromone Node and Resin Nest T3A/T3B, cleaned pasted additions and right-edge clipping; idle strips follow new stills.
- Lumenari: three creeps plus Prism Colossus with translucent-hole rims repaired; walk/die strips updated to preserve exact first frame.
- Rootkin: Elder Rootwalker dark specks recolored/cleaned; walk/die strips matched.

## Important source-version note
This package was prepared using the latest available project ZIP, v0.15.1, with the earlier art-rework drop and Batch B artwork where applicable. The v0.15.2 integration project is **not supplied**. Therefore it is **not** an authoritative overwrite of the v0.15.2 live game: compare changed files and test on a development branch.

## Verification
- 33 images checked for dimensions and RGBA format.
- Sprite checker: 27 OK, 6 inherited advisory warnings, 0 hard failures; no new warnings vs baseline, two fewer than baseline.
- All updated walk, death, idle and fire strips: exact pixel-identical frame 0 vs the supplied still. Fire strips end on the still.
- Visual before/after sheet is in `qa/before-after.jpg`.
- No game code or map backgrounds are modified.
- The old art checker emits quality warnings for many untouched game files when run against the supplied v0.15.1 baseline; do not interpret those as Batch C failures.

## Outstanding concerns
- The six existing advisory warnings concern Railgun T3B centering, Salvage Rig T3A centering and T3B width, Tar Sprayer T3B width, Lumenari Bastion fill (89% vs 88% range), and Elder Rootwalker walk-frame variation. They existed in source art.
- Some Chitin re-crop improvements are local geometry edits, not newly painted source-sheet replacements; visually approve at phone scale before merging.
- Tar field was created as a transparent dark oil field rather than the prior pale wash; confirm the renderer's opacity/blend mode makes it darken the map as intended.

## Installation
Overlay `public/sprites` onto a **development copy** of Extra Terram. Run `npm run art-drop`, `npm run check-sprites -- <drop>`, `npm run check-art -- all --drop <drop>` and review in the art preview at phone size. Keep previous production assets available for rollback.
