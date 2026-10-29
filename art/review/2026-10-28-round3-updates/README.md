# Round 3 targeted updates + title backdrop (delivered 2026-10-28, integrated in v0.16.1)

The outside art agent's drop `extra-terram-round3-title-and-art-updates-review.zip` (25 files, 13 MB): the key art
reprocessed, a 2× companion, the Salvage Rig T3 crane fix, a Brood Gallery colour candidate, and two code patches.
Their own notes: `ARTIST_NOTES.md`. The checker's report on the drop: `check-sprites-drop.txt`.

## In

- **`public/art/title.jpg`** — the same round-4 painting (the delivered "original@2x" is byte-identical to
  `art/key-art/title-round4@2x.jpg`), cleaned up: the dither that textured the v0.16.0 file is gone (edge energy
  2442 → 402 on the painting), lines are crisper, the ground stays lit down to the painting's cut. As delivered the
  painting stops on a hard row (1484 of 2048) over a near-black fill that was not the chrome's colour; on integration
  the last 94 rows above the cut are blended into grove-950 (#07131a) and the fill set to it, so the painting melts
  into the panels and the app background on every screen. The delivered file is kept here as `title-delivered.jpg`;
  re-encode: progressive JPEG, quality 92, 621 KB (was 708 KB).
- **Salvage Rig T3A, T3B and their idle strips** — the white / checkerboard matte between the crane supports is gone
  (near-white opaque pixels 4114 → 575 on T3A, 1137 → 163 on T3B); bodies and material unchanged; frame 0 of each
  strip matches its still. `npm run art-drop` quantised the strips (238 KB → 57 KB each); manifest and mounts
  unchanged. The two WARNs (T3A base centred on x = 92; T3B's straight 32-px left edge) are the ones the v0.15.x files
  already carried.
- **The title component patch**, in substance: the painting is pinned to the viewport at one scale instead of growing
  with the page (`src/ui/Title.tsx` v0.7.0, `.et-backdrop` in `src/styles/index.css`). Not applied as sent: the patch
  was written against v0.15.1 and switched the backdrop to the 2× file; see below for why not, and `HANDOFF.md`
  v0.16.1 for what the menu does with the room the fix gives it.

## Held back

- **`public/art/title@2x.jpg`** (3072 × 4096, 2.2 MB). It carries no detail the 1× file lacks: against the 1× file
  upscaled 2× with Lanczos its mean difference is 1.09 / 255 (99th percentile 5). It would add 2.2 MB to every first
  load and to the offline download for nothing visible. The `check-sprites.py` patch that teaches the checker about it
  is therefore not applied either; the checker's "the game does not look for a file with this name" on it is right.
- **`version-sensitive-review/public/maps/chitin-hive-01.jpg`** (the Brood Gallery colour candidate). Built on the
  v0.15.1 painting, as its notes say: the hard-cornered, crack-textured trail of v0.15.1, where the game has carried
  the v0.15.2 rounded trail since. The hue shift also left orange-red blotches on the socket rims and in patches of
  ground (see `qa/chitin-before-after.jpg` in the drop at full size). The cooler, less saturated ground is the right
  direction for the round-3 brief ("Brood Gallery's ground and socket hues") and should be done on the current
  painting, from `public/maps/chitin-hive-01.jpg` of this build, with the hue change painted rather than shifted.

## Still open from the round-3 brief (the agent's own list agrees)

Pile Driver vs Mortar T1 (similarity 0.91 against 0.70), the nine T3 branch pairs, Chitin T1 silhouettes, a shading
pass on the A v3 overpaints, Solar Collector T3B (1.34× against 1.35), the clipped Resin Nest / Pheromone Node T3
crops, Brood Gallery's hues (above), and the Elder Fork and Crystal Throne scenery repaint. The agent asks for the
original uncropped source sheets for the crop fixes.
