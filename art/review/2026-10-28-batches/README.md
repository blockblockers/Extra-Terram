# Art batches A–D, 2026-10-28 (in v0.15.3)

Four deliveries answering *Extra-Terram — Art Rework Review (v0.15.2)*. The review of them, with pictures, is the
doc *Extra-Terram — Art Handoff: Round 3* (link in HANDOFF.md, v0.15.3). The delivery's own notes are the
`ARTIST_NOTES_*.md` files here; `check-art-batch-*.txt` is check-art run on each delivery against the v0.15.2 game,
`check-art-v0.15.3.txt` on the game after integration.

| Batch | What it is | In v0.15.3 | Held back |
| --- | --- | --- | --- |
| A (v3) | The ten families held back in v0.15.2, repainted on the v0.15.1 bodies: 39 stills, 39 idle strips, 16 fire strips | All 94 files | — |
| B | Silhouette and tier/branch differentiation for 14 families: 36 stills, 36 idle strips, 2 fire strips | — | All 74 files: the differentiation is copied pale appendages (blades, discs, antennae, hoses) pasted on, which read as debris at phone size |
| C | Cleanup: Salvage Rig matte, Tar Sprayer T3B, Railgun T3B barrel, Pheromone Node and Resin Nest T3 crops, Lumenari creep holes, Elder Rootwalker specks, a dark tar field | The tar field, Tar Sprayer T3B (+ idle), the four Lumenari creeps and the Elder Rootwalker with their strips (18 files) | Salvage Rig T3A/T3B, Railgun T3B, Pheromone Node T3A/T3B, Resin Nest T3A/T3B (15 files): the Salvage Rig and Railgun files carry batch B's appendages; the Chitin crops only recolour the clipped edge |
| D | Four maps: King sockets in each world's material, seams softened, Prism Span's gold lines painted out | All four, encoded from the lossless masters at quality 85; Crystal Throne's own gold lines (still in the master) filled on integration as in v0.15.2 | — |

Why B is out whole: every family in it gets its tier growth and branch difference from the same pasted parts
(pale blades on Weepvine, Sapwell and Elderwood, grey hoses and wedges on Pile Driver and Mortar, green discs on
Acid Bloat, antennae on Pheromone Node and Web Spinner). They pass the outline numbers (check-art 14 → 25 families
with B) and fail the eye: at phone size they are pale sticks around an unchanged tower. A tower that gains sticks at
T3 reads worse than the v0.15.2 tower, so the families keep their v0.15.2 art and the differentiation goes back
to the artist as a painting task.

## Checks, v0.15.2 → v0.15.3

- Towers meeting every check-art rule: 5 → 14 of 28 (A's ten families now all pass except Solar Collector,
  T3 growth 1.34× against 1.35).
- Creeps 16 of 16, painted maps 10 of 10, strips 169 → 212 of 212.
- check-sprites: 0 failing, 80 warnings (older composition notes), no socket warning.
- All ten maps `check-map` ALIGNED, no weak trail cell.
