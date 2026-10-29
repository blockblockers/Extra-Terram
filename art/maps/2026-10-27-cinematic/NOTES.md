# Cinematic layered maps: integration notes (v0.14.1)

The four solo maps from the "cinematic layered" drop (2026-10-27), based on map kit v2. The artist's
own notes are `ARTIST_README.md`; their reports are the JSON and text files here. The editable layered
sources (`.ora`, six layers each) are not kept in the repo; the versions updated below are in
`extra-terram-maps-editable-v1.zip`.

## Review

- Layouts: all four match the game's grids (content 0.9.0; the solo grids have not changed since 0.8.0).
- `scripts/check-map.py` on every map: ALIGNED, no weak trail cells, every pad has a visible socket
  (trail contrast medians 69 / 83 / 67 / 92; socket means 64 / 81 / 60 / 91).
- An overlay of the game's own pad and path cells on each painting: every platform and every trail
  cell where the game puts it.
- The layer stack (environment, glow, terrain lip, trail, platforms, start/finish, all normal blending)
  recomposites to the delivered images pixel for pixel, so fixes could go into the environment layer only.

## Fixes made on integration (environment layer only; trail, platforms and objectives untouched)

| Map | Problem | Fix |
| --- | --- | --- |
| Mossbank Hollow (`rootkin-forest-01`) | A white frame strip down the right edge (columns 1524–1535, with a dark line inside it) and a white band across the bottom (rows 2028–2047) | Right strip replaced by the 12 columns beside it, mirrored; bottom band by the 20 rows above it, mirrored, smoothed under the three bottom pads, with a soft shadow along the bottom edge |
| Brood Gallery (`chitin-hive-01`) | A white frame strip down the right edge | Replaced by the 12 columns beside it, mirrored |
| Prism Span (`lumenari-crystal-01`) | Sockets left in the scenery from the old layout: a domed platform at (990, 1276), dark rings at (700, 1410) and (962, 1592), a cyan ring at (1345, 1840) (2x pixels) | Painted out with a texture fill (OpenCV shift-map) that never samples the trail or the platforms, blended into the surroundings |
| Slag Trench (`assembly-scrap-01`) | None | Unchanged |

`patch_maps.py` is the record of those fixes (paths point at the integration session's folders).
Pixels inside the locked trail, pad and objective masks are identical to the delivery.

## Shipping format

`public/maps/<map>.jpg`, 1536 x 2048, JPEG quality 85 with full-resolution colour (no chroma
subsampling), 850–985 KB each (the delivered PNGs were 4.7–5.0 MB). The four maps are listed in
`art/maps/painted.json`, so `npm run art` does not paint placeholders over them.

## Art notes for the next pass (not blocking)

- The trails are flat bands with a cracked-tile texture laid over the scenery. They read clearly at
  phone size, but they look more like a board game than the organic alien-world look in the design
  brief; a pass that roughens the trail edges into the terrain would help.
- Prism Span keeps thin orange conduit lines from the old layout between its platforms; they read as
  decoration, not as paths.
- Decorative aliens (Mossbank's tree spirit, Slag Trench's mech, Prism Span's crystal beings) are part
  of the scenery and do not move.
