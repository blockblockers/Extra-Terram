# Six deliveries of 2026-10-28 (evening): what went in, what did not (integrated in v0.18.0)

The art agent's six packages answering the round-3 brief and the key-art brief. Their own notes are beside this
file as `ARTIST_NOTES_*.md`; the comparison sheets (`compare-*.jpg`: the game's sprite above, the candidate below,
with each at phone scale on the right) are what the decisions were made on; `check-art-v0.18.0.txt` is the art
check after integration.

## In

- **The lettering-free key art** (`extra-terram-v0170-clean-menu-art-and-code`): a re-composed landscape painting
  of the four worlds with no title, plates, HUD or race bar (`public/art/title.jpg`, shipped at 1672 × 941 — the
  delivered 3344 × 1882 is a resample, mean difference 1.9/255 from upscaling the 1× file ourselves, kept as
  `art/key-art/title-round6-landscape@2x.jpg`), and a 3:4 portrait companion for phones
  (`public/art/title-portrait.jpg`, 1536 × 2048). The menu's plates now draw their own frames in CSS and the
  title is live on every screen; see HANDOFF.md v0.18.0. Their code patches were not applied as sent (they were
  written against our v0.17.0 files and reached for the same ends in other ways); the ends were taken.
- **Resin Nest and Pheromone Node T3A / T3B with their idle strips** (`…chitin-rebuilt…`, 8 of its 16 files): the
  clipped right flanks rebuilt from the other side's painted material. At phone scale on Brood Gallery the complete
  domes read better than the cut ones (`chitin-t3-on-brood-gallery.png`); the strict checks got worse (branch
  overlap 0.82 / 0.76, the outer contour lighter, stray pixels) and stay on the round-3 list. T1 / T2 were not
  taken: the delivery rebuilt them from v0.15.1 stills, and the game's T1 / T2 carry later fixes.
- **Solar Collector T3B and its idle strip** (`…outstanding…`): one facet on the rim takes T3 growth from 1.34× to
  1.35×; the family now meets every rule (towers 15 of 28). The strip's frame 0 differs from the still by 8.6
  levels after quantisation, as the old one did; it plays.

## Held back

- **Mortar and Pile Driver resculpts** (`…assembly-silhouette…`, 16 files) and **the nine T3 branch pairs**
  (`…phase4…`, 76 files): digital warps of the existing paintings — Mortar and the T3A bodies squashed flat,
  Pile Driver and the T3B bodies stretched tall. The textures smear with the shape (see `compare-*.jpg`); they
  read as deformed images, which the agent's own notes name as the reason to reject. The silhouettes do differ
  now, but the brief asked for painted bodies, not stretched ones. Phase 4's Salvage Rig T3A also still carries
  the white matte the earlier fix removed.
- **Brood Gallery colour candidate, second version** (`…outstanding…`): built on the v0.15.1 painting again (the
  hard-cornered, cracked trail the game left behind in v0.15.2), with red blotches around the sockets.
- **The follow-up's Salvage Rig T3A / T3B** (`…followup…`): the same matte fix already in the game since v0.16.1
  (pixel-identical where opaque). Its eight review-only Chitin studies were not for installation, as marked.

## Still open from the round-3 brief

Painted (not warped) bodies for Mortar vs Pile Driver and the nine T3 branch pairs; Chitin T1 lookalikes; a
shading pass on the A v3 overpaints; the Resin Nest / Pheromone Node contour and T3 branch difference; Brood
Gallery's hues, done on the current painting; the Elder Fork and Crystal Throne scenery repaint. The agent keeps
asking for the uncropped source sheets and the current project: send both with the next brief.
