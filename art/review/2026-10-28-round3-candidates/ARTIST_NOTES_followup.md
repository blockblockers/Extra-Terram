# Extra Terram — Round 3 follow-up: verified repairs and source audit

This is an incremental development handoff based on the latest available editable project **v0.15.1** and the **Round 3 / v0.15.3** handoff PDFs. The v0.15.3 source tree was not attached, so these files have **not** been tested in that live version.

## Install candidates (4 PNGs only)
- `public/sprites/assembly/salvage-rig/t3a.png`
- `public/sprites/assembly/salvage-rig/t3a-idle.png`
- `public/sprites/assembly/salvage-rig/t3b.png`
- `public/sprites/assembly/salvage-rig/t3b-idle.png`

These were regenerated from the older **accepted-source Salvage Rig stills**, removing only achromatic white/grey fake transparency inside the crane's void. **None of the rejected Batch B appendages** (hoses, fins, reservoirs) were added. All 6-frame idle strips start on the corresponding revised still, exactly. No turret pivots or game logic changed.

**QA:** `check-sprites.py` reports 4 files examined, 2 OK, 2 WARN, 0 FAIL. The *exact same two warnings* appear on the unmodified source: T3A body center x=92, and T3B's 32-pixel straight LEFT edge. These are pre-existing issues not resolved by matte removal. QA logs and contact sheet are included. Current-production art-preview and build were not run.

**Install:** Back up the target files and overlay only `install-candidates/public/sprites/` into a development branch. Run your current v0.15.3+ `npm run check-sprites -- <drop>`, `npm run check-art -- all --drop <drop>`, `npm run art-drop`, and `npm run art-preview` on Slag Trench. Do not use the `review-only/` directory as a game drop.

## Chitin restoration research (review-only, 8 PNGs)
- Resin Nest T3A/T3B and Pheromone Node T3A/T3B + corresponding idle strips.
- Repositioned real Round 5 A3 source painting to match the game's tower footprint/canvas; **the source itself contains long vertical clipped edges.** The missing right-side shell/antennal anatomy CANNOT be recovered by recropping, image scaling, or mirroring. These are diagnostic studies only; their existing right-edge cuts are *not* artistically repaired. They should NOT be installed.
- See `qa/chitin-unrecovered-cut-source.jpg` and `qa/measurement-report.json` for explicit visual proof and cut run measurements.

## Mortar and Pile Driver / missing silhouette redesigns
- `qa/mortar-pile-driver-body-direction.jpg` compares current T1 paintings with the new **shape-mass** target (Mortar squat round drum; Pile Driver tall narrow hammer frame), while marking the existing T1 pivot. **This is an instruction/paint-region guide, not a replacement sprite.** Do not substitute it as art.
- T3 branches still need true repainting with different *body mass*, not pasted discs, hoses, blades or antennae. Open items: Weepvine, Whirlseed, Sapwell, Elderwood, Pile Driver, Mortar, Railgun, Salvage Rig, Resin Nest, plus lookalike Chitin T1s (Web Spinner, Acid Bloat, Pheromone Node). The three Rootkin economy trees are lower priority, per the Round 3 brief.
- The A-v3 overpaint material mismatch (Ironbark T2–T3B, Spirebirch T3, Stalker Eye T3, Mandible T3A) also needs bespoke painting. Stronger digital shading tests were visually insufficient, so **no false production replacements** are included.
- Elder Fork and Crystal Throne are accepted at phone size, with continuous-scene repaints postponed by the handoff.

## Already delivered previously (not duplicated as new)
- Brood Gallery magenta-contrast candidate and Solar Collector T3B growth/idle correction: see `extra-terram-round3-targeted-install-candidates.zip` from the preceding turn.
- High-DPI title and viewport-fixed menu patch: see `extra-terram-round3-title-and-art-updates-review.zip`. Source patch must be merged and tested on v0.15.3 code, not blindly used as a full file replacement.

## Acceptance criteria
The Round 3 handoff prioritizes appearance at 412×915 / 89px per tile over a checker score. Use exact 256×256 RGBA canvas, base centered x128 with y182, first strip frame identical to still, correct turret overlay, no extra visual objects, and no modified game geometry. Never claim “completed” for missing paint hidden behind a crop or for a cosmetic numerical improvement that still looks pasted on.
