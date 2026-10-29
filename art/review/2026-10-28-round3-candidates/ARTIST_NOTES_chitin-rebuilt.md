# Extra Terram — Round 3: Chitin T3 Body Reconstruction (v1)

**Release category: Visual-review candidate, not approved v0.15.3 production art.**

## Why this pack exists
The v0.15.3 Round 3 handoff identifies Resin Nest and Pheromone Node T3A/T3B as already clipped on the right in their source images. Previous recrops did not restore missing anatomy. This pass rebuilds the outer flank from the opposite side's **existing painted chitin material** using a tapered, alpha-aware blend. That restores a curved chitin/sac silhouette instead of extending the crop's straight vertical border. These are **source-derived digital reconstructions**, not new hand-painted originals.

## Game-path files (16 PNGs)
- `public/sprites/chitin/resin-nest/{t1,t2,t3a,t3b}.png` and matching `-idle.png`
- `public/sprites/chitin/pheromone-node/{t1,t2,t3a,t3b}.png` and matching `-idle.png`

**Painting sources:** existing v0.15.1 tower stills; T1/T2 unchanged except Pheromone Node T1 shifted 20px left to re-center its base. T3A/T3B outer contours reconstructed with opposite-side shell/membrane details; T3A sides narrowed inside the 85% width limit. All eight idle strips regenerated from the corresponding still, with 6 distinct closed-loop frames and identical frame 0. No turret sprites or pivots changed. These two towers are passive/support tower families and do not require body fire strips.

## Checks run
1. `python scripts/check-sprites.py <drop> --project <v0.15.1>` — **16 OK; 0 warnings; 0 failures**.
2. `python scripts/check-art.py strips --drop <drop> --race chitin` — **8 of 8 delivered idle strips pass motion and loop continuity.** Other Chitin assets in the baseline were not replaced.
3. `python scripts/check-art.py towers --drop <drop> --race chitin` — **strict family checks not fully passed**. Resin Nest has excessive T3 branch silhouette overlap (0.79 vs <=0.75), still resembles Web Spinner at T1, and needs exterior contour darkening. Pheromone Node still resembles Resin Nest at T1 and needs exterior contour darkening. These are substantive visual rework items and are not addressed by a crop reconstruction.
4. Disposable-project `npm run art-drop` — **passed**. All eight still PNGs stayed byte-equivalent after refitting; idle strips quantized successfully, their frame-0 average channel difference from still was ~1.4-2.9 levels, and all eight idle strips continued to pass the motion checker.
5. Phone-size preview is a simulated view on the **older** Brood Gallery map at 89px per tile. The new v0.15.3 project was not supplied; no claim is made for an actual build or game-session pass.

## Artistic limitations / approval needs
- The reconstructed sides use locally mirrored painted anatomy, which should be reviewed for unwanted bilateral repetition at full size. They are more complete than the clipped candidates but are not equal to a hand-painted replacement with genuinely new right-side features.
- Existing T1 resemblance to other families and T3A/T3B branch similarity remain for a separate bespoke redesign pass. Do not optimize shapes numerically by gluing on panels or bright discs.
- All stills retain 256x256 RGBA and idle strips 1536x256 RGBA. The game's art-drop may palette-quantize them on integration.
- Test on a development branch against the **actual v0.15.3+ project**, since validation was possible only with the provided v0.15.1 project. Do not merge automatically.

## QA files
- `qa/two-family-full-tier-contact.jpg` — all eight stills
- `qa/four-t3-before-after.jpg` — before/after stills and mid-cycle animation
- `qa/phone-scale-before-after.jpg` — composite on Brood Gallery, 89px/tile
- `qa/geometric-measurements.json` — cutoff and canvas measurements
- `qa/check-sprites.txt`, `qa/check-art-towers.txt`, `qa/check-art-strips.txt`, `qa/post-art-drop-motion.txt` — raw validator output
- `scripts/rebuild-chitin.py` — reproducible reconstruction, depends on input v0.15.1 path in script; paths can be edited for another source version

## Next work
Remaining Round 3 priorities after this patch: visual approval in v0.15.3, genuine T3 branch repaints for nine named families, Chitin T1 lookalikes, and close-up King map scenery refinements. The separately delivered Mortar/Pile Driver repaint candidates are not reissued here.
