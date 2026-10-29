# Extra Terram — Round 3 outstanding artwork: targeted candidates

**Source limitation:** Latest editable project available was v0.15.1. The Oct 28 Round 3 handoff says v0.15.3 is live. These files are **development-branch candidates**, not an all-clear for production. Never overlay the rejected Batch B graphics.

## NEW / CHANGED ASSETS (root file paths in this package)

1. `public/maps/chitin-hive-01.jpg`: reduces pink/magenta intensity around actual pads, adjusts nearby Chitin ground toward cooler purple while preserving the live route coordinates from the available guide. Explicitly review against the current v0.15.3 master before applying; the source map may have changed after v0.15.1.
2. `public/sprites/lumenari/solar-collector/t3b.png`: keeps the accepted Batch A v3 Solar Collector T3B and adds *one* crystalline facet to the outer rim (rather than generic Tier-B appendages). Computed silhouette area at game's tier scale changes 1.343× to 1.353× of T1 (requirement >=1.35).
3. `public/sprites/lumenari/solar-collector/t3b-idle.png`: matching six-frame idle animation; its first frame matches the still **pixel for pixel**.

## TEST RESULTS
- Map checker (on exported JPEG): **ALIGNED**; 46 cells, 0 weak; 24 pads, 0 missing. Centre-line estimator says 0 measurable long-straight cells, so visually inspect the included `qa/chitin-hive-01-check.png`.
- Original trail-mask pixels: unchanged before JPEG encoding (JPEG lossy compression can change numeric RGB values globally).
- Sprite validator: 2 OK, **0 warnings, 0 failures**, frame 0 matches still.
- Solar Collector new T3B growth 1.353× against >=1.35, no new width or crop warnings (bbox x21..234).
- Phone-scale preview of both changes included, with Chitin towers on the actual pad positions.
- Game build / true v0.15.3 art-preview **NOT RUN**: current code project wasn't provided.

## PREVIOUS WORK NOT RE-SENT AS 'NEW'
The earlier Oct 28 package already contains approved-origin high-DPI title art and a React patch to anchor the backdrop to viewport, plus a Salvage Rig matte repair. The full review archive includes them in `previously-prepared-version-sensitive/` only as a convenience. Those were not redone here, and their React changes must be merged against v0.15.3, not used as full-file replacement.

## ART NOT READY — DO NOT INSTALL THE EXPERIMENTS
- The four Resin Nest / Pheromone Node T3 crops are cut *inside* the underlying sprite source. The clipped original art cannot be recovered by resizing or a mirrored-edge trick; that looks visibly duplicated. Repaint right-edge shell/antenna anatomy from the uncropped source sheet or regenerate each affected still, then rebuild the four idle strips.
- Real shape differentiation is still needed for Mortar and Pile Driver at T1 (overlap 0.91 vs target <=0.70), nine T3A/T3B branch families, and Chitin Web Spinner/Acid Bloat/Pheromone Node against Resin Nest. Reject unrelated floating discs, fins, hoses or pasted-on silhouette blades.
- Flat-looking overpaints on Ironbark, Spirebirch, Stalker Eye, Mandible still need material-matched painting. Minor automated shading looked too subtle at phone scale; **not delivered**.
- Elder Fork and Crystal Throne need eventual continuous scenery paintings, but this was explicitly a later priority.
- The three-source race artwork should remain visually authoritative. No current-production assets other than those explicitly listed above are modified.

## INSTALL / REVIEW
Unzip the small `install-candidates.zip` into a development checkout (with backup). Run `npm run check-sprites -- <drop>`, `npm run check-art -- all --drop <drop>` and in-game `npm run art-preview`; verify the Solar Collector on Prism Span and Brood Gallery in 390px mobile view. Do not merge without current-code visual approval.
