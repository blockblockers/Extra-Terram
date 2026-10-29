# Six multiplayer maps, layered: integration notes (v0.15.1)

The drop `extra-terram-six-multiplayer-maps-layered.zip` (2026-10-27): six versus maps, each a JPEG, a PNG
master and a seven-layer OpenRaster source with locked trail and platform masks. The artist's notes are
`ARTIST_README.md`; their reports are `art-qa-report.json`, `geometry.json` and `six-map-preview.jpg`. The
editable sources are not kept in the repo.

## What went in

| Map | File | Size | Shipped as |
| --- | --- | --- | --- |
| Twin Hollows | `public/maps/lanes-2-hollows.jpg` | 1536 x 2048 | JPEG 85, full colour resolution, progressive: 724 KB (PNG master 4.7 MB) |
| Three Rivers of Light | `public/maps/lanes-3-prism.jpg` | 1536 x 2304 | 848 KB (5.4 MB) |
| Four Warrens | `public/maps/lanes-4-warrens.jpg` | 1536 x 2560 | 883 KB (5.7 MB) |

All three are listed in `art/maps/painted.json`, so `npm run art` leaves them alone.

## Review

- **Layouts:** the three Lanes maps match the game's grids (content 0.9.0) cell for cell.
- **check-map:** ALIGNED on all three; trail contrast medians 68.0 / 83.9 / 62.2 with no weak cell; socket
  means 65.4 / 92.1 / 65.2 with a socket on every pad (`check-map-today.txt`).
- **Layers:** the seven layers recomposite to the delivered PNGs exactly, so a later fix can go into one layer.
- **In the game:** `npm run art-preview` with `?level=<map>&all=1` (new in v0.15.1: versus maps, every seat
  filled): towers on every lane's pads, creeps walking the painted trails, gates at the trail ends, at phone
  size and full size; no console errors, no failed requests.

## Held back: the three King of the Maze maps

Foundry Crown, Elder Fork and Crystal Throne were painted on the King layouts of project v0.13.0 (the artist's
source, per `art-qa-report.json`). Those layouts were redrawn in v0.14.0. Against today's guides `check-map`
finds 14 of 49, 12 of 52 and 15 of 66 trail cells weak and 5, 4 and 7 pads without a socket; Crystal Throne
is 1664 x 2560 (13 x 20) where the game's is 1664 x 2432 (13 x 19). `king-layouts-mismatch.jpg` draws today's
routes and pads over the paintings.

Re-routing them in code was not possible: the environment layer carries the old route as a smeared band, so a
moved trail would leave a ghost of the old one. The game keeps its King placeholders. The repaint brief is in
*Extra-Terram — Art Review, Enhancements and Design Specs* (https://claude.ai/artifact/WY6XpaoSDXrbj1VFoCmKYv)
and `extra-terram-king-repaint-kit.zip` (today's guides, templates and overlays for the three maps, the
checker, and a table of trail cells and pads to compare against).

## Art notes for the next pass (not blocking)

- **Trails** are one flat tone with a soft rounded edge: clear at phone size, but they read as a vector stroke
  over a painting. The review's map specs ask for an irregular bank, a darker lip and the world's material.
- **Ground between the trails** is calmed with softened tiles whose hard rectangular edges show.
- **Saturation:** the ground beside the trail is C* 47-61, above the units standing on it; Three Rivers of
  Light's trail is near white (L* 79), where additive beams and flashes clip.
- **Four Warrens:** orange egg clusters and violet shards crowd 8 of its 32 pads.
- **Lane barriers** are flat dark bands, and each lane repeats the same strip with a hard seam.
