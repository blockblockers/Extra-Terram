# Extra Terram — Batch A v3 | Focused visual-acceptance revisions

**Status:** new review candidate. Not a claim of final v0.15.2 art approval.

This package upgrades the 10 Batch A families while preserving existing tower pivots and turret sprites. The original game artwork is retained as the base, with redesigned race-specific overpaints and updated matching idle and body-fire strips.

## What changed in v3
- **Ironbark:** broader mature natural canopy at T1, defensive foliage at T2/T3A and lower armored seed-pod boughs at T3B; no black canopy socket cut.
- **Spitter:** now reads more distinctly as a single-spout acid mound at T1 and a broader dual-spout organism at T3B, not a duplicate eye pasted over the old one.
- **Mandible:** much stronger raised opposing pincers at T1, with distinctly heavy, serrated crushing-jaw plates for T3A.
- **Stalker Eye:** T3A higher hood and T3B lower venom-gland morphology; T1 deliberately unchanged (already accepted by v0.15.2).
- **Solar Collector:** expanded physical collector fins and sails, with brighter crystalline internals rather than heavy ink through the facets.
- **Lumenari family contours:** darker true unit boundary, clear interior glow, and orphaned semitransparent flecks cleaned without recoloring the actual luminous faces.
- Adjusted individual extremities to preserve safe margins, without resizing complete tower paintings or changing anchor positions.
- Rebuilt corresponding animation strips with frame 0 pixel-identical to the revised stills.

## Validation
- v0.15.1 `scripts/check-sprites.py <drop>`: **94 OK, 0 warnings, 0 failures**.
- 55 delivered idle/fire strips verified: **55 frame-0 exact matches** and **55 valid canvas sizes**; all 16 fire strips end exactly on the still.
- The **available v0.15.1** `check-art.py towers --drop` reports **7 of these 10 families fully passing its old numeric criteria**. Exact per-family output is in `qa/tower-check-v3.txt`.
- This is not a current v0.15.2 repo checker. Its *flat-top* rule flags Ironbark's natural canopy and the front-mounted Stalker Eye mount; the v0.15.2 review explicitly warns the flat-top rule is outdated for front-mounted turrets. Stalker Eye also retains **107 stray-alpha pixels from the already-approved T1**, which this drop deliberately does not touch.
- Solar Collector T3B's measured tier-growth ratio remains **1.34× vs target 1.35×**, a borderline numeric miss. This artwork has not received human art-director approval at 25% size on actual v0.15.2 game boards.

### Important differences from the prior review
- Ironbark, Spitter and Mandible T1 overlaps against their closest within-race tower now meet the <= 0.70 objective on the older checker. Their final visual quality still needs review.
- The v3 patches are deliberate digital overpaints. They are not fully bespoke human hand-painted original assets.

## Contents
- `public/sprites/`: 94 precise-path game replacement PNGs — 39 tower stills, 39 idle strips, 16 body-fire strips. Does **not** overwrite Stalker Eye T1, turrets, mounts.json, maps, or code.
- `editable-layers/`: 30 PNG overlay layers for 15 individually reworked states; earlier v2 editable layers are in the previous package.
- `qa/`: before-and-after, all-state, 64-px and turret-composite contact sheets, checker logs, and SHA-256 manifest.

## Installation
Apply to a development branch running v0.15.2 or later. Do not install an unapproved review candidate onto production. From the project root:
```
npm install
npm run check-sprites -- <path-to-unzipped-drop>
npm run check-art -- towers --drop <path-to-unzipped-drop>
npm run art-preview
```
Verify all 4 states of each family with the actual v0.15.2 mounts and backgrounds, especially Ironbark and Stalker Eye.
