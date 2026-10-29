# Art rework, 2026-10-27 (in v0.15.2)

The outside art agent's answer to the art review (`../2026-10-27/`): contours and rim light on every unit, tier
growth and branch edits on the towers, motion in every strip, new impacts, muzzle flashes, aura fields and the
Mandible bite, 14 interface icons, favicons, the title's lower gradient, the seven painted maps re-valued and the
three King of the Maze maps painted on today's layouts. The review of it, with pictures of every decision, is the
doc *Extra-Terram — Art Rework Review (v0.15.2)* (https://claude.ai/artifact/T5PEHzM159fCeXbHKokNpq).

## What went in

| Part | In v0.15.2 | Kept from v0.15.1 |
| --- | --- | --- |
| Maps | All ten, encoded from the delivery's lossless masters at quality 85, 4:4:4 (6.9 MB; delivered at quality 94, 11 MB). Crystal Throne: gold path-like lines in the open ground filled with the ground colour | — |
| Creeps | All 16 stills with their walk and death strips | — |
| Tower bodies (+ idle and fire strips) | Needlespire, Weepvine, Whirlseed, Sapwell, Elderwood; Nailgun, Pile Driver, Tar Sprayer, Mortar, Railgun, Salvage Rig, Relay Mast; Web Spinner, Acid Bloat, Resin Nest, Pheromone Node; Prism, Lance; Stalker Eye T1 (its leftover painted eye removed) | Ironbark, Spirebirch, Spitter, Mandible, Stalker Eye T2–T3B, Chrono Field, Nova, Pulsar, Solar Collector, Resonator |
| Turrets | All 32 stills and fire strips (the contour touched their outer ring only) | — |
| Effects | Impacts, muzzle flashes, aura fields, the Mandible bite | — |
| Interface | 14 icons, favicon 16/32/48, title art | `public/icons/apple-touch-icon.png` (the iPhone home-screen icon stays the painted planet, like the Android icons) |

Why the ten families were held back: the automatic pass broke at least one tier of each. Ironbark got a black
socket carved into its canopy top; Spirebirch and Stalker Eye got doubled socket rings (Stalker Eye also a black
crater); Spitter T3A got a second eye pasted on and T3B a flat ring over its eyes; Mandible T3A/T3B got the core
copied with a hard seam; on Chrono Field, Nova, Pulsar, Solar Collector and Resonator the glow and see-through parts
were traced in dark ink and broke into blocks. A family whose look changes between tiers reads worse than one that
waits for its repaint, so each family is in or out whole (Stalker Eye T1 is the one exception: it fixes a bug).

## Fixed on integration

- Turret pivots (`art/mounts.json`): Mortar T2/T3A/T3B 94/99/91, Pile Driver 94/99/99, Acid Bloat 94/95/99,
  Whirlseed 94/91/99. Their T2/T3 bodies grew taller with a socket at the new top; at the default pivot
  (102/107/107) the socket showed behind the turret.
- `art/maps/painted.json` lists all ten maps.
- `scripts/check-sprites.py` v0.2.0: every tower state with a turret is drawn with it on the game's pivot onto the
  contact sheet, with a warning when a dark socket shows beside it (on this delivery: Ironbark T1–T3B, Stalker Eye
  T2–T3B).
- `scripts/check-art.py` v0.1.2: the flat-top rule only measures head-less bodies (top within 24 px above the
  pivot); measured on Ironbark's canopy, it is what invited the carved socket.

## Files here

- `ARTIST_NOTES.md`: the delivery's own notes (scope, its check results, what it could not test).
- `artist-*.txt`, `artist-map-acceptance-summary.csv`: the delivery's QA logs.
- `check-art-delivery.txt`: check-art on the delivery as delivered (towers 7/28, creeps 16/16, maps 10/10, strips 212/212).
- `check-art-v0.15.2.txt`: check-art on the game after integration (towers 5/28, creeps 16/16, maps 10/10, strips
  169/212; the 43 failing strips are the held-back families' v0.15.1 strips).

The delivery itself (lossless map masters, the King maps' layered `.ora` sources and masks, the full QA folder) is
kept with the art drops, not in the repo.
