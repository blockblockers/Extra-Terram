# Extra-Terram — Art Handoff: World Intros (2026-10-29, game v0.23.0)

The shareable version: https://claude.ai/artifact/FQ3SkuHmrHiXewBaZhrvVG. This file is the repo copy. Deliveries go through
`scripts/check-sprites.py` as before; the world art has its own small check described at the end.

## What the game does with it

Before a solo level begins, the game shows the home world from orbit for about five seconds (or until a tap):
a starfield, the planet drifting a little closer (a 0.92 → 1.04 zoom over six seconds; none when the player
asks for reduced motion), the world's name, the level's name, one line on what is happening, two or three
sentences of story, the invader's emblem against the player's, and how the player's weapon fares against the
invader's armour. The planet picture is the whole of the art: the stars, the lettering and the badges are the
game's. Today the planets are stand-ins generated from the map paintings (`scripts/gen-planets.py`); this brief
replaces them.

The screen: `src/ui/WorldIntro.tsx`. The planet sits at the top of a phone screen (about 62% of the width, at
most 36% of the height), centred, over the game's own deep-blue space; the text sits under it.

## The story the pictures tell

Four worlds, each under attack by the one race it cannot fight alone. Each race's weapon has an armour it
barely scratches; the invader of a world is exactly that race. That is why the world is losing, and why it
calls for help: any army can answer, and the one whose weapon bites the invader is the right one to bring.
Raiders of a third race follow the invader in on three of the worlds.

| World | Home race | Invader (the home race's weakness) | Raiders | What the invader wants | The line on screen |
| --- | --- | --- | --- | --- | --- |
| Forest moon — Mossbank Hollow | Rootkin (thorn; weak vs carapace) | Chitin Swarm | — | the sap and the heart-tree | The Chitin Swarm has found the grove. |
| Scrap plains — Slag Trench | The Assembly (kinetic; weak vs bark) | Rootkin | Lumenari | the scrap, and the forge's heat | Rootkin growth is splitting the foundry. |
| Hive tunnels — Brood Gallery | Chitin Swarm (acid; weak vs shielded) | Lumenari | The Assembly | the resin and the brood | The Lumenari are burning into the brood gallery. |
| Crystal fields — Prism Span | Lumenari (energy; weak vs plated) | The Assembly | Chitin, Rootkin | the crystal, cut and carried off | The Assembly are mining the span. |

The full lore text is in `src/content/lore.ts`; the map paintings and the race key colours are the palette
(Rootkin green #3f8f3a and bark brown; Assembly gold #e8c33a on iron black; Chitin violet #8a4fc9 with acid
green #9fe84a; Lumenari cyan #4fd8e8 with white).

## Deliverables

**A. The planet from orbit — one still per world (required).** The home world as a globe, seen from space,
with the invasion legible on or around it. Specifically:

- Terrain in the world's palette, from its map painting: the forest moon's canopy and sap-light rivers; the
  scrap plains' slag, pipes and furnace glow; the hive tunnels' resin surface with the galleries showing as
  dark pits and the brood's purple light; the crystal fields' facets catching the sun.
- The invasion, small and readable at phone size: the swarm's drop-pods and a green haze over the grove;
  bark and canopy pushing up through the foundry's plates, cracks of green across the gold; beams of
  Lumenari light driving down into the resin, white against purple; plated mining rigs on the span with
  cut lines across the crystal, dust in the light.
- One sun, from the upper left, slightly in front; a dark side with a few lights (settlements, the hive,
  furnaces, the Prism); an atmosphere rim in the race's colour; limb darkening. No lettering, no badge, no
  frame, no stars (the game draws them).
- Size 2048 × 2048, the globe's diameter about 1720 px centred (84% of the canvas), the atmosphere glow
  within the canvas, transparent background (straight alpha). PNG master; the game ships WebP at 1024
  (`scripts/gen-planets.py --from <file>` converts, or deliver the WebP too).

**B. A short animation per world (welcome, not required).** The same shot alive for the hold: clouds or
haze drifting, the furnace lights pulsing, the beams flickering, the swarm's pods descending. Either a frame
strip (8 to 12 frames at 1024 × 1024, horizontal, PNG with alpha, played at 6 fps and looped: `<world>-strip.png`,
checked like the sprite strips) or a short video (WebM VP9 with alpha and an MP4 HEVC-with-alpha pair for
Safari, 6 seconds, 1024 × 1024, loop-safe). The still is always delivered as well: it is the first frame, the
poster, and the fallback.

**C. Optional: the invader's arrival.** A separate layer on a transparent canvas (1024 × 1024) that the game
can slide in over the planet during the hold: the swarm's cloud, the Rootkin's seed-ships, the Lumenari's
light, the Assembly's mining fleet. Deliver only if A and B are done.

## Style

The key art's own painted look (the title paintings): rich colour, soft painted edges, light that glows. The
planet is the hero and the invasion is the detail, not the other way round; at 240 px wide on a phone it must
still read as a green moon, a gold-black world, a purple hive world and a blue-white crystal world. Keep the
globe round and whole — no crops, no rings unless the world has them (none do), no text.

## Files and checks

```
art/world-intro/<world>.png            the still, 2048 × 2048, straight alpha   (rootkin, assembly, chitin, lumenari)
art/world-intro/<world>-strip.png      optional frames, N × 1024 wide by 1024
art/world-intro/<world>.webm / .mp4    optional video, 1024 × 1024, 6 s, alpha
```

Checks: square; the globe's bounding circle between 80% and 88% of the canvas, centred within 2%; the four
corners fully transparent; the lit side on the upper left (mean luminance of the upper-left quadrant of the
globe above the lower-right's); no lettering (a quick eye); the strip's frame count and frame size; the
video's length and alpha. `scripts/gen-planets.py --check art/world-intro` runs the measurable ones.

## Order of work

1. The forest moon still (the first level everyone sees) — approve the look on it.
2. The other three stills.
3. Animations, if wanted, forest moon first.
