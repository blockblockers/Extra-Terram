# The landscape key art (received 2026-10-28, integrated in v0.17.0)

A 1672 × 941 (16:9) painting of the four worlds — the Rootkin tree, the Assembly cannon, Chitin creeps on
the trail, the Lumenari crystal spire — with a menu painted into it: the title top left ("EXTRA-TERRAM™ /
TOWER DEFENSE"), six plates under it (PLAY, VERSUS, TOWERS, RESEARCH, COLLECTION, SETTINGS), a player HUD top
right ("Commander Lv. 24 · 3,420") and a race bar along the bottom (ROOTKIN Living growth · ASSEMBLY
Industrial might · CHITIN Bio-adaptive · LUMENARI Crystal tech). The file as received:
`art/key-art/title-round5-mockup.png`.

## What went in (`public/art/title.jpg`, 548 KB, progressive JPEG q90)

- The **HUD was painted out**: the sky behind it rebuilt from the sky beside it (its per-row colour, a
  slow nebula variation and a sprinkle of stars), feathered 18 px into the painting, the moon's rim kept.
  Result kept as `art/key-art/title-round5-clean.jpg`.
- The **bottom band** (rows 838 on) is a plain dark strip now: its lettering and dividers would otherwise
  show through on screens that do not cover it (the portrait intro, the lobby). The game's race bar sits
  on it in landscape, the quick bar in portrait.
- The **title and the six plates stay painted** and the menu is built on them (`src/ui/Menu.tsx` v0.17.0,
  `src/styles/index.css` v0.6.0): the painting is scaled by height and anchored to its left corner on
  landscape screens, so 1 painting px = 100/941 lvh, and the real buttons fill the insides of the painted
  frames (Play 9.6–49.6 × 26.9–33.5 lvh; the five below from 36.2 lvh at a pitch of 8.07, each
  38.5 × 5.75 lvh) with the same dark teal, hiding the painted icons and words and carrying ours. The
  painted frames, bevels and glow are what the player sees. The game's races bar covers the painted one.
- Portrait screens cannot show the corner without the painted lettering, so they show the painting from
  89 lvh in: the trail, the creeps, the ridge tower, the ring station and the moons.

## For the next version of this painting

The spec stands: **no lettering, no interface in the art.** The game draws the title, the plates, the HUD and
the race bar live, so they stay crisp at any size, change with the player's race and language, and never
show a word the game does not have (there is no Research or Collection; the player HUD does not exist).
Please deliver:

1. **The same painting without the title, the plates, the HUD and the bottom band** — the tree, the
   ground and the sky continuous where they were. If the composition should keep room for a menu column
   on the left, keep that area calm (trunk, leaves, mushrooms), not empty.
2. **At 2×**: 3344 × 1882, same framing, so 4K screens and 3× phones are served; the game will downsample.
3. **A portrait companion** (3:4, 1536 × 2048 or 3072 × 4096) of the same world for phones: the four
   factions in one frame, sky in the top third for the title, the lower quarter calm or dark for the
   quick bar. Until it comes, phones show the middle of the landscape painting.
4. Keep the plates' frame look (dark teal plate, gold bevel, cyan for the primary) as a reference: the
   game's plates copy it in CSS.

The check: `npm run check-sprites -- <drop>` accepts `public/art/title.jpg` at 16:9, 1672 × 941 or a whole
multiple, and warns when the bottom 11% is not dark.
