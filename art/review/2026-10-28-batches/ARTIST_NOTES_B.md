# Extra Terram — Batch B: Silhouettes and Upgrade Differentiation

**Status: review-ready digital overpainting, not final artist-approved repaint.**

## Baseline
The latest fully supplied project archive was **v0.15.1**. To compare against the later handoff,
validation staged the previously accepted v0.15.1 art-rework files for unaffected families,
and the separate **Batch A v3 candidate** for its ten families. This reconstructs the visual
baseline used for comparative QA; it is **not an actual checked-out v0.15.2 or v0.15.3 build**.
Apply Batch A v3 first if its changes are desired, then overlay this Batch B drop. No turret
assets, mounts, map layouts, or code files are modified by Batch B.

## Install contents
The `public/sprites/` directory holds exactly **74 individual replacement PNGs**:
- **36** repainted tower-body stills (256 × 256 RGBA)
- **36** matched idle-animation strips (1536 × 256, six 256 × 256 frames)
- **2** body-fire strips for Railgun T3A/T3B (1024 × 256, four frames)

Factions/families touched: Rootkin — Weepvine, Sapwell, Elderwood, Whirlseed;
Assembly — Pile Driver, Mortar, Tar Sprayer, Railgun, Salvage Rig;
Chitin — Web Spinner, Resin Nest, Acid Bloat, Pheromone Node;
Lumenari — Solar Collector T3B. **14 families total.**

New shapes were individually constructed as shaded, race-material digital overpaints on the
existing approved sprites. They are not full hand-painted replacements; some mechanical
appendages may need manual cleanup before artistic signoff. Towers preserve original scale,
base, turret files and all turret pivots.

## Major visual changes
- **Pile Driver vs Mortar T1:** tall hydraulic hammer stabilizers vs a squat low tripod foundation.
- **Rootkin:** Weepvine's hanging willow tendrils, Sapwell's mushroom umbrellas and sacs,
  Elderwood's asymmetric boughs, and Whirlseed's distinct Seed Storm / Burning Husk crowns.
- **Assembly:** differentiated Pile Driver and Mortar T3 branches, railgun fins, a longer Salvage
  Rig crane and forge, and wider Tar Sprayer reservoirs.
- **Chitin:** spindly Web Spinner, low broad Resin Nest, acid sacs on Acid Bloat, tall pheromone
  transmitters; alternate resin-nest branch accents.
- **Lumenari:** added small luminous sail facets to Solar Collector T3B to meet tier growth.

## Validation (staged comparison)
- `check-art towers`: **12/28 → 25/28** families meeting all rules with A v3 staged.
- The 14 Batch B families: **13/14** meet all available strict checks (Salvage Rig still has
  T3A/T3B silhouette IoU 0.80, above its 0.75 target despite clearly different crane/forge art).
- `check-art strips`: **211/212** across the staged project; **all 38 delivered strips pass**.
  The single failure is an unchanged Stalker Eye T1 idle strip from earlier Batch A artwork.
- `check-sprites` on the 74-file drop: **0 FAIL**, **12 WARN**, all 12 identical to issues
  already present in the corresponding source images (see `qa/warning-audit.json`).
- `npm run art-drop` equivalent pipeline tested in a disposable project copy: **0 stills
  refitted**, **0 mismatched strips**, and all 38 new strips successfully palette-optimized.
- Verified every still and strip's dimensions and palette-tolerant frame-0 continuity.
- **Solar Collector T3B idle strip** is delivered full-color to preserve exact frame 0.
  The tested `art-drop` palette optimization produced one additional nonblocking
  `check-sprites` frame-0 colour warning (MAE ~3.2, threshold 3.0) on that strip.
  The base still was unchanged, but this should be visually reviewed post-install.

### Remaining acceptance gaps
- **Salvage Rig T3A vs T3B:** silhouette overlap remains 0.80 rather than ≤0.75. Needs
  bespoke manual silhouette painting, not cosmetic scaling or copying of components.
- **Ironbark** and **Stalker Eye** continue to fail the older checker due to flat-top / stray-alpha
  conditions inherited from previous Batch A art. The updated v0.15.2 handoff says the
  Ironbark front-mounted turret should not be judged by the obsolete flat-top rule.
- The twelve sprite WARN labels are inherited: various source base/footprint alignment
  and 85%-width flags. No new warning was introduced. See warning audit.
- The *actual* v0.15.2+ source and real renderer were not supplied for this pass; in-game
  artistic acceptance and UI-scale placement remain unverified.

## Handoff instructions
1. Use a **development branch**. Keep backup copies of installed sprites.
2. If using Batch A v3, apply it first. Unzip this package into the project root.
3. Run `npm run art-drop` in the full Node 22 project; it updates manifests and quantizes strips.
4. Run `npm run check-sprites -- <drop>` and `npm run check-art -- towers --drop <drop>` as appropriate.
5. Use `npm run art-preview` at phone size with all affected towers and compare before
   merging into production; verify mounts and firing animation in the actual renderer.

## Package structure
`public/sprites/**` are the install files; `qa/**` holds original-vs-new contact sheets,
source/after reports, warning audit, checksums and validation notes. To install only changed
assets, copy **only `public/sprites/`**.
