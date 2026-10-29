# Extra Terram — map alignment kit

Ten maps (four solo, six versus), one requirement: the painted background must line up with the
game's layout to the pixel, because the game draws creeps on the path centreline and towers on the
pad centres and never adapts to the painting. Everything in this folder exists to make that
checkable rather than claimed.

**Generating with an AI image tool:** follow the *Map Art Spec for AI Image Generation* doc
(https://claude.ai/artifact/7BWmyqVddLtrExqbh9RanQ): master prompt, a style block per world, tool
settings, and why the first Mossbank Hollow painting (2026-10-26) could not be used. In short:
start from `<map>-template@2x`, keep everything where it is, paint straight down, and put the build
pads **beside** the trail, never on it.

The files are regenerated from the map grids by `npm run guides` (`scripts/gen-guides.py`); the set
here matches game content 0.9.0 and later. On 2026-10-26 the four solo layouts were redrawn (a
spiral, a W, a square wave and a staircase, longest trail on the easiest level), and so were the
three King of the Maze maps (a crown, a three-way fork, an H to four corners): older guides and
templates for those seven maps are wrong. The work orders, with each template and a ready-to-paste
prompt: *Art Handoff: The Four Solo Maps* (https://claude.ai/artifact/FLMLz4dBocLreuadW6WHpD) and
*Art Handoff: King of the Maze Maps* (https://claude.ai/artifact/AQGoYuNZZsibt5omqLav2h).

**Check the layout before painting.** The first King paintings delivered on 2026-10-27 were made on the v0.13.0
layouts and could not be used; the second set, on today's layouts, is in the game since v0.15.2, so all ten maps
are painted; v0.15.3 brought painted sockets in each world's material to the King maps. Today's King layouts have these counts (the retired ones had 58 / 66 / 86 trail cells, 32 / 37 / 38
pads, and Crystal Throne was 13 × 20):

| Map | Grid | Size at 2× | Start gate | Bases | Trail cells | Pads |
| --- | --- | --- | --- | --- | --- | --- |
| Foundry Crown | 13 × 16 | 1664 × 2048 | G15 | B0, L0 | 49 | 30 |
| Elder Fork | 13 × 18 | 1664 × 2304 | G0 | A11, M11, G17 | 52 | 31 |
| Crystal Throne | 13 × 19 | 1664 × 2432 | G0 | B0, L0, B18, L18 | 66 | 35 |

The art specs every map follows (value ladder, trail edge, ground, pads, gates, scenery) are in *Extra-Terram —
Art Review, Enhancements and Design Specs* (https://claude.ai/artifact/WY6XpaoSDXrbj1VFoCmKYv).

## Files per map

| File | What it is | Use it for |
| --- | --- | --- |
| `<map>-layout.json` | The numbers: tiles (12 × 16 on the solo maps), 128 px per tile at delivery size (1536 × 2048 on the solo maps; versus maps 1536 × 2304, 1536 × 2560, 1664 × 2048, 1664 × 2304, 1664 × 2432); every path cell in walking order and every pad with its pixel centre; spawn and exit; tolerances | The source of truth. Cells are `[col, row]` from the top-left; columns are also lettered A–L (A–M on the 13-column King maps), so `G7` is col 6, row 7 |
| `<map>-template@2x.png` (`.jpg` for the versus maps) | The current generated background at delivery size, nothing drawn on it; its trail and sockets are already in the right place | The image-to-image starting point: generate the painting *from* this at moderate strength so the structure survives |
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

One file per map at its 2x size (1536 x 2048 for a 12 x 16 map), PNG or JPEG, named after the map:
`rootkin-forest-01`, `assembly-scrap-01`, `chitin-hive-01` and `lumenari-crystal-01` (painted and in
the game since v0.14.1), `lanes-2-hollows`, `lanes-3-prism`, `lanes-4-warrens`, `king-2-foundry`,
`king-3-elderfork`, `king-4-throne`. The game ships every map as `public/maps/<map>.jpg` (quality 85);
the conversion happens on integration. Include the check images you produced and say plainly which
cells, if any, are off and by how much; a flagged map is more useful than a "verified" one that is not.

Things earlier sets needed fixing on integration, so check for them before delivery: nothing socket-like
anywhere but on the pads (rings, domes or platforms left from an older layout read as places to build); no
frame, border or margin at the edges (a white strip along one side shows as a line along the edge of the
board); and nothing trail-like off the trail (bright lines across the ground read as extra paths; Crystal
Throne's were filled in v0.15.2). Deliver the lossless masters too: the game encodes them at quality 85. Painted maps are listed in `art/maps/painted.json`, which
keeps `npm run art` from painting placeholders over them.
