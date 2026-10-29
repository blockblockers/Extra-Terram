# Extra Terram — Batch D: Map quality refinements (review candidate)

## Scope
Updated four map backgrounds only, each individually at its exact game path:
- `public/maps/king-2-foundry.jpg` — Foundry Crown, 1664×2048, 30 pads
- `public/maps/king-3-elderfork.jpg` — Elder Fork, 1664×2304, 31 pads
- `public/maps/king-4-throne.jpg` — Crystal Throne, 1664×2432, 35 pads
- `public/maps/lumenari-crystal-01.jpg` — Prism Span, 1536×2048, 14 pads
`art/maps/painted.json` is carried over from the approved art drop (all ten maps registered).

## Changes
1. Replaced the generic grey King-pad discs with painted source-material sockets borrowed from the approved matching solo maps: Assembly metal plates, Rootkin wood-stump rings, and Lumenari cyan crystal sockets. Pad centres and counts remain exactly as in the v0.15.1 King repaint-kit layouts.
2. Softened hard, tile-aligned seams and refined environmental transitions in the King scenery under locked route/pad/gate layers; kept existing authored environmental features. The result is an incremental digital refinement, not a complete bespoke repaint of the three worlds.
3. Improved local trail/ground contrast where the original automated alignment checker flagged cells. King path centreline and band shape are retained from existing locked trail layers; the trail surface colors alone changed in Foundry Crown and Crystal Throne.
4. Removed the prominent warm gold false-path conduit markings from Prism Span's scenery while retaining original gameplay-band, pad and gate pixels.
5. Exported full-size lossless PNG masters and game JPGs (quality 85, RGB 4:4:4). Three King-map OpenRaster files and individual editable layers supplied in this full QA package. Full-resolution PNG for Prism Span and removal masks are included.

## Validation
`python scripts/check-map.py <map-id> <public/maps/map-id.jpg> --out qa/` was run against the v0.15.1 current-layout files and overlays. All four report 0 weak cells and 0 missing pads, verdict ALIGNED by checker metrics. The checker did not obtain a measurable straight-run band (0 measured), so direct pixel overlay and locked-route provenance remain important for centering verification. This automated test cannot establish artistic quality or full game compatibility.

Map-id / cells / pads / checker result:
- king-2-foundry / 49 / 30 / ALIGNED
- king-3-elderfork / 52 / 31 / ALIGNED
- king-4-throne / 66 / 35 / ALIGNED
- lumenari-crystal-01 / 30 / 14 / ALIGNED

## Caveats and recommended review
- These are concrete geometry-safe quality refinements built from prior accepted maps. They are not completely new hand-painted continuous environments; some older patch softness remains, especially on Elder Fork and Crystal Throne. Avoid calling that issue fully closed until art direction approves full-resolution close-ups.
- The most recent project ZIP supplied for editing was v0.15.1. The v0.15.2 review corroborates the three King dimensions and pad counts, but an actual v0.15.2 source build was not provided and no full game build was run.
- Image generation was used for exploratory art direction, **not** as evidence of game-ready output; the provided art assets were constructed from the actual project maps, locked layers, and exact pixel-space masks.
- Install over a test branch; run check-map and art-preview in the current game and inspect pad/socket joins at phone size. No code changes intended.

## Package structure
- `public/maps/` four game JPEGs
- `art/maps/painted.json` map registration
- `art/masters/maps/` PNG masters (QA package only)
- `art/layers/` 3 editable `.ora` files plus individually editable layer PNGs (QA package only)
- `qa/` checker overlays, socket contact sheets, before-after and validation JSON
- `reference/current-layouts/` exact JSON source layouts (QA package only)
