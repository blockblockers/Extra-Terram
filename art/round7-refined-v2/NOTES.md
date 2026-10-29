# Art round 7: towers, creeps, effects and UI, "visual refinement v2" (v0.15.0)

The drop `extra-terram-additional-art-refined-v2.zip` (2026-10-27) answers *Art Handoff: Towers, Creeps,
Effects and UI* and sprite kit v1: batches 1 to 5 in one go, maps excluded. The artist's own notes are
`ARTIST_README.md`; `metadata/` holds their file list and change list (the provenance JSONs and the 5 MB
contact sheet stayed out of the repo).

## What came in

333 files: 243 new, 90 replacing game files.

| Group | Files |
| --- | --- |
| Turret sets | 31 turrets, 28 head-less bodies (Whirlseed, Spirebirch, Mortar, Acid Bloat, Stalker Eye, Nova; Pile Driver; Ironbark's T2 and T3 turrets) |
| Silhouette repaints | Needlespire, Weepvine, Spitter, Mandible, Prism, Lance (4 states each) |
| Re-crops | Chrono Field and Solar Collector T2, T3A, T3B; Resin Nest and Pheromone Node T3A, T3B; Web Spinner T3A (reconstructions: the uncropped sources were not available) |
| Mini-bosses | 4 stills on the 256 canvas, 8 strips |
| Projectiles | Whirlseed, Spirebirch |
| Weapon effects | 4 beams, the Mandible bite, 4 impacts, 4 muzzle flashes, 4 aura fields |
| Passive effects | Rooted, Spin-up, Hive link, Overcharge |
| Strips | 197 in all: idle strips for every tower family, fire strips for the shooters, turret fire strips, walk and die strips for the nine regular creeps that had none |
| Interface | 14 icons in `public/ui/`; the title art re-graded |

## Review

- `scripts/check-sprites.py` on the drop: 333 OK. On the whole game after integration: nothing failing; the
  warnings are all on older files (three Assembly stills with off-centre bases, the Dump Hauler off-centre,
  the Compactor die strip's frame 0 3.4 off its still).
- Every head-less body has its collar on the default pivot (128, 99 / 102 / 107), so no pivot override was
  needed. Composed with their turrets: `qa/turrets-on-bodies.jpg`.
- Seen in motion in the real renderer (`npm run art-preview`) on each race's map: turrets on their bodies,
  aiming and firing; the four mini-bosses on their own art and strips; beams, impacts, the Mandible bite,
  muzzle flashes and fields; and in a phone-size build of the app: the HUD, build bar, tower panel, race
  pickers and the multiplayer mode list with their icons. No console errors, no requests for missing files.

## Changed on integration

| What | Why |
| --- | --- |
| Spirebirch's 4 turrets and 4 turret fire strips: the spire tip above the ring and the trunk below it removed (`fix_spirebirch.py`) | The turret carried the top of the trunk, which would have spun with every shot; the body keeps its own spire |
| Weepvine's 4 fire strips deleted | Old art under the repaint, and an aura tower never fires |
| Ironbark's 4 tier-3 body strips refitted onto their stills (scale 0.82) | Cut before the v0.8.2 footprint fix: frame 0 stood 36 canvas px low and a fifth too big |
| 201 strips reduced to 256 colours | 33.9 MB to 7.6 MB |
| `public/art/title.jpg` re-encoded at quality 86 | 1.28 MB to 0.71 MB, no visible change |
| `art/mounts.json`: emitter points for Railgun, Spitter, Mandible, Prism, Lance and Pulsar | Beams and muzzle flashes start at the crystal, barrel or maw instead of the ground |

Kept as delivered: small specks on six stills that have strips (a stray glow under Lance T2, specks beside
Chrono Field T2 and T3B, Solar Collector T3B, Nova T1 and Resin Nest T3B). Cleaning the still alone would make
the tower jump when its strip starts; `clean-stills.py` now leaves such stills alone and lists them.

## Art notes for the next pass (not blocking)

- **Head-less bodies** are cut with a straight horizontal edge across the top (most visible on Acid Bloat,
  Whirlseed and Nova) and carry a flat painted ring as the collar. A painted top (a socket, a stump, a turntable)
  would hide the cut.
- **Stalker Eye T1** still has its painted eye on the body, beside the collar, so the tower shows two eyes.
- **Spirebirch's turret** was the spire's top with a blade across it; a crown designed as the turning part
  (leaves round a thorn launcher, as the handoff describes) would read better than the trimmed version.
- **Mini-bosses**: Mega-Dozer's hazard-striped plate and Brood Queen's egg disc read as separate flat objects
  next to the painted tank.
- **Aura fields** are thin line work; in the game they are drawn at 75% with a faint wash in the tower's colour
  so the zone reads. A denser painted field would carry it alone.
- **Mandible bite** reads as two crossing bars rather than jaws.
- The eleven re-crops are reconstructions; authentic re-crops from the source sheets are still welcome.
