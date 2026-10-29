# Extra Terram — Round 3 / Phase 4: Nine T3 Branch-Pair Art Candidates

**Status: review candidates, NOT artist-approved production replacements.**

This package advances the nine T3A/T3B branch pairs specified in the October 28, 2026 Round 3 handoff. It **does not** claim to complete every outstanding tower silhouette or to have been tested against the live v0.15.3 project, which was not supplied as an editable project. The available baseline was v0.15.1 plus staged accepted/candidate art from the previous phases. Do not combine it with the *rejected* Batch B silhouette files.

## Contents

- `public/sprites/`: **76 individual PNG files** at their existing game paths: 9 families × 4 tower stills (36), 9 × 4 six-frame idle strips (36), and four Railgun fire strips.
- `editable-sources/`: **18 OpenRaster comparison masters** (`.ora` for the nine T3A and nine T3B states), each with a visible candidate layer and hidden original source. Can be opened in Krita or GIMP. These are editable comparisons, not separately painted anatomical layers.
- `editable-sources/scripts/`: the image-warp and repaint processing scripts for reproducibility.
- `qa/`: metrics, before/after, full family tiers, turret composites, phone-scale home-map previews, animation frame samples, sprite checks, and art-drop logs.
- `manifest.csv`: SHA-256, dimensions, image mode, and individual installation paths.

## Visual design changes

| Family | T3A body direction | T3B body direction |
| --- | --- | --- |
| Rootkin / Weepvine | Wider, hanging canopy mass | Taller, tighter vine column |
| Rootkin / Whirlseed | Broader root-and-seed body | More upright rooted body |
| Rootkin / Sapwell | Wider fungus reservoir and lower growth | Taller fungal stalk silhouette |
| Rootkin / Elderwood | Sprawling heavy canopy | Tall trunk and luminous vertical bough mass |
| Assembly / Pile Driver | Tall hammer-frame body | Broad reinforced machinery chassis |
| Assembly / Mortar | Squat, wide launch cradle | Raised enclosed mortar housing |
| Assembly / Railgun | Wider, lower weapon frame | Taller chamber and long, narrowed beam housing |
| Assembly / Salvage Rig | Broad sorting machinery footprint | Tall enclosed salvage furnace mass |
| Chitin / Resin Nest | Broad, low growth dome | Tall hive mound with raised core |

Designs reshape the **existing painted body mass** with continuous, locally deformed materials, rather than pasting on loose blades, hoses, discs or antennas. The original surface color and shading provide the foundation; this is a **digitally processed paint-preserving candidate**, not a bespoke hand-painted replacement. T1 and T2 stills retain the source paintings.

## Acceptance results

- All **9 of 9** T3 branch-pair silhouette overlap measurements now meet **<= 0.75** using the available checker. See `qa/branch-metrics.csv`.
- **76 PNG files:** **0 hard failures** on the sprite validator; **4 existing advisory warnings** (Railgun T1/T2/T3B and Salvage Rig T2, about their inherited off-centre bases).
- **36 of 36** idle strips meet the motion checker; all 36 have exact still/frame-0 matches before quantization. **4 of 4** Railgun fire strips meet the fire motion checker and have exact first/last still frames.
- A disposable copy of v0.15.1 passed the `clean-stills`, `sprites --refit`, `optimize-strips`, and manifest pipeline; **zero revised stills refitted**. Its 40 candidate strips quantized without introducing failing motion checks; 36 idle frame-0 matches remained within quantization tolerance.
- Gameplay art at approx. **89 px per map tile** is shown in `qa/phone-scale-on-home-maps.jpg`, including original artwork side by side on the **actual home-map terrains**.

## Important remaining issues

This pack **does not** pass every strict *family* rule. Baseline T1 similarity is still high for some Rootkin economy trees and Resin Nest, and inherited growth/contour/stray-pixel rules still fail for some families. Whirlseed and Sapwell need genuine extra body painting to make their tier growth convincing at phone scale. Original Railgun T2 is still undersized, and original Pile Driver/Mortar turrets were not repainted. As the latest production project was not available, the real v0.15.3 turret mount pivots, renderer and animation loading are **not** independently verified here.

**Use on a development branch only.** Prefer reviewing each family as a whole four-state set, not cherry-picking upgrades. Run the current v0.15.3 scripts: `npm install`, `npm run check-sprites -- <drop>`, `npm run check-art -- all --drop <drop>`, `npm run art-preview` on each home map and test the tower/turret joins with current pivots. Keep existing production sprites unless a family passes the visual test.

## Files and integrity

The installer ZIP contains only `public/sprites` plus README and manifest. The full ZIP additionally contains editable comparison files, scripts and QA. Every file is at its exact repository-relative location. No changes to `art/mounts.json` or game code are included.
