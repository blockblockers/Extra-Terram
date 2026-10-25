# Extra Terram — map alignment kit

Four maps, one requirement: the painted background must line up with the game's layout to the
pixel, because the game draws creeps on the path centreline and towers on the pad centres and never
adapts to the painting. Everything in this folder exists to make that checkable rather than claimed.

The files are regenerated from the map grids by `npm run guides` (`scripts/gen-guides.py`); the set
here matches project v0.7.2 and later (pads were moved on 2026-10-24 — older guides are wrong).

## Files per map

| File | What it is | Use it for |
| --- | --- | --- |
| `<map>-layout.json` | The numbers: 12 × 16 tiles, 128 px per tile at delivery size (1536 × 2048); every path cell in walking order and every pad with its pixel centre; spawn and exit; tolerances | The source of truth. Cells are `[col, row]` from the top-left; columns are also lettered A–L, so `G7` is col 6, row 7 |
| `<map>-template@2x.png` | The current generated background at delivery size, nothing drawn on it; its trail and sockets are already in the right place | The image-to-image starting point: generate the painting *from* this at moderate strength so the structure survives |
| `<map>-overlay@2x.png` | Transparent layer: trail centreline and band edges (magenta), socket rings with cross-hairs (gold), spawn (orange), exit (cyan), faint tile grid | Composite over the painting at 50% to see what is off; also usable as a control image |
| `<map>-guide@2x.png` | The flat guide at delivery size with column letters and row numbers in the margins | For talking about places: "the socket at D11 is 20 px left" |
| `<map>-guide.png` | The same at 768 × 1024 (64 px tiles) | The game's native size, for reference |

## What "aligned" means

- Delivery size 1536 × 2048 (or exactly 768 × 1024). No margins, frame, text or UI; the whole image
  is the board.
- **Trail:** a continuous painted path about 0.9 tiles wide whose centre runs along the guide
  centreline within 0.15 tile (19 px at 2×) at every cell, including corners. The band in the overlay
  is the area the painted trail must cover.
- **Sockets:** one visible "you can build here" shape centred on each pad within 0.1 tile (13 px),
  about 0.6 tile across (radius 38 px). Nothing socket-like anywhere else.
- **Spawn and exit:** a feature on the marked top and bottom cells; their centres within 0.2 tile.
- Units read on top: mid values and low contrast on the trail and around sockets; detail in between.

## Self-check before delivering

```
python scripts/check-map.py <map-id> <your-painting.png>
```

Needs Python 3 with Pillow and NumPy. It resizes the painting to delivery size and writes
`art/guides/checks/<map>-check.png` (painting + overlay) and `<map>-pads.png` (one crop per pad with
the expected ring), then prints: the trail's contrast against the ground per cell (weak cells
listed by label), the trail's centring on long straights where it can be measured, and whether
each pad has a visible socket. A painting that is right prints `ALIGNED`; anything else lists the
cells to look at. The numbers are advisory and the two pictures are the acceptance evidence: the
magenta band must sit on the painted trail everywhere, and every gold ring must sit on a socket.

## Delivery

`public/maps/rootkin-forest-01.png`, `assembly-scrap-01.png`, `chitin-hive-01.png`,
`lumenari-crystal-01.png` — separate files, PNG or JPEG. Include the check images you produced and
say plainly which cells, if any, are off and by how much; a flagged map is more useful than a
"verified" one that is not.
