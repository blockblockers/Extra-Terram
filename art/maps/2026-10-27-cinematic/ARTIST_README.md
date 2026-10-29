# Extra Terram — Cinematic Layered Art Pass (v0.13.0 / Map Kit v2)

## Install these game backgrounds

Copy only `public/maps/*.png` into the corresponding paths of Extra Terram v0.13.0.
Each is **1536 × 2048 RGB PNG**, with no baked UI, crop, margin, or labels.

- `rootkin-forest-01.png` — Mossbank Hollow: 60-cell inward spiral and **30** stump platforms.
- `assembly-scrap-01.png` — Slag Trench: 54-cell W and **22** industrial platforms.
- `chitin-hive-01.png` — Brood Gallery: 46-cell square-wave and **24** wax platforms.
- `lumenari-crystal-01.png` — Prism Span: 30-cell stair route and **14** crystal platforms.

## What changed visually

Environmental scenes have a more saturated, dimensional treatment, selectively transferred detail from generated art references, accent glows beyond the walking lanes, world-specific trail materials, painted terrain lips and distinct platform materials. This is a **geometry-safe hybrid enhancement**, not a promise that one end-to-end AI illustration perfectly obeyed the map layout. No game code was changed. Existing decorative aliens remain integrated into the painted scenery.

## Editable source

`editable/<map>.ora` is an **OpenRaster layered document**. Open it with Krita or GIMP. There are six independently visible and editable layers: painted environment, ambient glow, terrain lip, exact trail, build platforms and start/finish. Each layer is also exported individually under `editable/<map>/layer-*.png`. Three grayscale masks show the protected trail, build pads, and objectives. Keep these mask coordinates fixed when editing scenery.

**Layering note:** The painted environment underneath is built from a prior alignment-checked flattened scenic composite and may retain parts of the original trail/platform colors when visible with the upper layers disabled. The layers are practical art-editing controls, not a fully AI-separated source painting with individually movable tree branches and aliens. Regenerate the final maps from the full visible stack.

## Checks

- v2 `*-layout.json` files were compared to v0.13.0 guides: all four identical.
- Each map is 1536 × 2048 and its exact path mask and pad centers are generated from the matching layout JSON.
- All source pads have at least **20 px** of free ground between platform edge and walkway; numeric minima are in `qa/acceptance-report.json`.
- `scripts/check-map.py` reports **0 weak trail cells and 0 missing platforms** for all four. Reports, gold-magenta alignment overlays, and pad sheets are in `qa/`.
- The checker does not independently determine a reliable straight-run centering band (0 measured segments). The corridor is constructed mathematically around the JSON path centers, with a nominal 113-px width; review overlays to approve fine artwork.
- All editable ORA archives were verified to contain six layers, and their merged images were verified pixel-identical to the shipped flattened map PNGs.
- **Not yet tested in the running game**: the complete npm build and headless placement pass cannot be claimed because the provided project copy has no installed node_modules (Ajv missing). Please preview in game before production approval.

## Art direction limitations

This pass improves brightness, colored accents, surface texture and editable production structure, while keeping routes strictly aligned. The impressive fully generative reference boards could not be transferred wholesale without distorting their paths, platforms or perspective. Further hand-directed environment painting around locked masks may still be needed to match the standalone cinematic concept-art quality. In particular, dense detail should remain at least 40 px away from the path and build platforms and should not create pad-like rings.

## Recommended follow-up

Review the four maps at phone scale with representative towers placed. Edit world ambience and scenery on their ORA layers rather than regenerating the entire map. The geometry, pad counts and objective locations should remain untouched.
