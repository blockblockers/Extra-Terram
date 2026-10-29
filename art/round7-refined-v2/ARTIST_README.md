# Extra Terram — Towers, Creeps, Effects and UI · Visual Refinement v2

**Download scope:** Full replacement draft covering **333 art files**, matched to `Art Handoff Towers, Creeps, Effects and UI.pdf`, Sprite Kit v1, and Extra Terram project v0.13.0. Maps are **not** included; they have a separate handoff.

## Visual work completed

- **178 existing draft assets revised** (including **4 mini-boss paintings, 31 turret sprites, 24 repainted tower silhouettes, 21 FX images, 14 icons, 1 retouched title, and 83 synchronized strips**); **155 kept unchanged** after review.
- Mini-bosses now use original race tank paintings plus more specific armor, foliage, industrial blades, egg sacs or crystal plates; old blocky shapes have been reduced.
- Turrets use corresponding tower artwork to give materials, lights and more complex surface texture instead of plain vector glyphs.
- Six silhouette families now read more like their stated weapon roles. Upgraded stills have corresponding fire/idle strips regenerated around them.
- Rooted, Spin-up, Hive link and Overcharge effects have more complex organic or illuminated shapes. All optional weapons FX have added material and lighting detail; UI motifs remain readable at 16–40 px.
- The existing title was color-graded, sharpened and darkened at the bottom for menu panels; this is **not** newly painted native-resolution key art.

## Structural QA

**Sprite Kit checker: 333 OK, 0 warnings, 0 failures**; run with:

`python check-sprites.py <art-drop> --project <v0.13.0-project>`

All size/transparency requirements, game pivots and animation frame-zero equality passed the provided checks. `sprite-check.png` is included, plus `qa/` comparisons. The checker cannot grade aesthetics or visual accuracy of head/body combinations inside the real game. **In-game build has not passed or been completed**, since the supplied project has no installed npm dependencies (`npm run validate` cannot import `ajv`).

## Remaining artistic and technical limitations

- **Art-directed procedural composite, not 333 individually hand-painted sprites.** Some turrets and silhouette add-ons still benefit from professional finishing, though their painterly source textures and outlines are better than v1.
- Eleven crop repairs **remain provisional reconstructions**, because the original uncropped source sheets were not provided. They are carried forward unchanged; authentic re-cropping would be preferable.
- Existing regular-creep animations not tied to changed stills and most unchanged animation families are retained from v1, not completely reanimated.
- The four mini-bosses are adapted from existing painted tanks; they are not wholly regenerated native-resolution paintings.
- The 17 optional weapon FX and 14 UI icons need renderer wiring. Turret sets require engineering for headless-body refit and Spirebirch's higher pivot. Mini-boss sprite switching needs game code. See original handoff.
- Retired/replaced stills can invalidate legacy motion strips if stale files are left in the game; apply in a branch and run `npm run art-drop` after the engineering fixes, not blindly into production.

## Included

`public/sprites/` — game-format towers, turret heads, bosses, projectiles, strips, FX;
`public/ui/` — 14 icons;
`public/art/title.jpg` — title;
`metadata/` — complete new SHA256 inventory and 178-file change list; historical draft provenance clearly marked as baseline;
`qa/` — before-after comparisons and a curated review sheet;
`sprite-check.png` — sprite-kit checker contact sheet.

Install **to a test branch**, test all eight rotating towers including state-specific heads, all four bosses and their strips, the 6 replaced tower families through both T3 branches, and icons at mobile size prior to approval. Do not use the QA illustrations or old visual concept posters as shipped sprite assets.
