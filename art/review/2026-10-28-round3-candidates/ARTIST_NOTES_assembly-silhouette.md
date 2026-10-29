# Extra-Terram — Round 3 Assembly silhouette pass (REVIEW CANDIDATES)

Source version: v0.15.1 original Assembly artwork; informed by the October 28, 2026 Round 3 handoff for v0.15.3. **The actual v0.15.3 project was not supplied.**

## Scope
- 8 individual 256 x 256 transparent PNGs: Mortar T1/T2/T3A/T3B and Pile Driver T1/T2/T3A/T3B.
- 8 matching 1536 x 256 idle strips, six frames each, first frame exactly equal to the still.
- Turret sprites, fire strips, mount metadata, other towers, maps, and code are UNCHANGED.

## Visual changes
- Mortar: broad, low gun-cradle body with heavier horizontal mass; wide T3A and vertically deeper T3B.
- Pile Driver: taller, narrower hammer housing; tall T3A, wider heavy-base T3B.
- Painted Assembly metal details come from the approved source sprites, spatially reshaped and corrected, rather than unrelated pasted-on geometry.
- Exterior dark contour only. Painted turret sockets were restored at their original position after reshaping so that no duplicated rings remain.
- New idle strips use structural mass movement and engine glow; they are not just a shifted frame.

## Verification on the available v0.15.1 project
- check-sprites: **16 OK / 0 WARN / 0 FAIL**.
- check-art (tower metrics): **both targeted Assembly families pass**. Mortar T2/T3A/T3B growth 1.17/1.36/1.41, T3 branch IoU 0.68, nearest T1 relative 0.55. Pile Driver growth 1.26/1.58/1.83, T3 branch IoU 0.49, nearest T1 relative 0.55. Contour median L* is about 6.
- check-art (motion): **all 8 new idle strips pass**; other preexisting strips are outside this delivery.
- Turret compositing illustrated at a REPRESENTATIVE pivot y=96; not an assertion of v0.15.3 pivot coordinates.

## IMPORTANT: Artistic acceptance and installation
This is a **source-preserving digital resculpt and review candidate**, NOT a fully hand-painted, visually approved replacement. Earlier Batch B was rejected for apparent add-ons and incompatible material, so visual approval at phone size has priority over numerical scores. Do not promote by score alone. The actual current game should be checked with its live pivot metadata and at real phone size. No acceptance claim is made for other 26 tower families.

Recommended staging: on a development branch, overlay `public/sprites/assembly` only, run `npm run check-sprites -- <drop>`, `npm run check-art -- all --drop <drop>`, and `npm run art-preview` on Slag Trench with both heads installed, using the v0.15.3+ project. If the new bodies still read as deformed source paintings, reject these candidates and commission true fresh paintings.

## Remaining work (not included)
1. Recover full uncropped Resin Nest/Pheromone Node T3 source art. Older Round 5 source also contains clipped right-side anatomy; stretching or mirroring it isn't a valid fix.
2. Nine T3 branch-pair full paintings (Weepvine, Whirlseed, Sapwell, Elderwood, Pile Driver, Mortar, Railgun, Salvage Rig, Resin Nest) as one source family per set; this pack addresses only Mortar and Pile Driver shape geometry.
3. Four Chitin T1 lookalike families and additional A v3 material-matching paint are still open.
4. Larger continuous repaints for Elder Fork and Crystal Throne scenery remain deferred.
