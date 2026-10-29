# The music, as code

The game's eleven music pieces are generated here — a trip-hop set: slow swung drums with ghost notes, dusty
breaks, a deep sub, sparse Rhodes and vibes, dub delays, vinyl grain — with a percussion palette per world.
Regenerate them after a change with

    python3 audio/compose/compose.py            # renders the masters (WAV) to audio/compose/out/masters (git-ignored)
    python3 audio/compose/master.py             # loudness to the brief's targets, -1 dBTP, OGG + AAC into public/audio/music
    npm run audio                               # the manifest

Needs numpy, scipy and ffmpeg. `engine.py` is the instrument and sequencer kit: drums (kick, snare, rim,
clap, hats, shaker, congas, woodblock, metal, clicks and chitters, ride, toms, crash), a sub bass, a Rhodes,
vibes, bells, a Karplus-Strong pluck, pads, strings and a flute; a 16th-note sequencer with swing, humanised
timing and velocities; a dub delay and a reverb that run *circularly* on a loop, so tails wrap to the start
and the seam is the music carrying on; a sidechain from the kicks; a dusty drum bus; a true-peak limiter.
`compose.py` holds the pieces: tempo, key, the chord cycles, the patterns per section, the fills, the battle
stems (additive layers on the same grid as their calm loop). `master.py` measures with ffmpeg's ebur128 and
trims each piece to its target (-15 LUFS menu, -18 calm, -16 battle, -14 stings).

| Piece | Tempo, meter | Key | Bars | Palette |
| --- | --- | --- | --- | --- |
| `menu` | 82, 4/4 | D Mixolydian | 48 | head-nod break, vibes theme, Rhodes, muted guitar chucks, strings in the B |
| `world-rootkin` | 86, 4/4 | D Dorian | 48 | rim and woody percussion (congas, woodblock, shaker), Rhodes off the beat, flute motif |
| `world-assembly` | 92, 4/4 half-time | A Phrygian | 48 | heavy kick, snare on 3, pipe hits, distorted sub, dark Rhodes stabs |
| `world-chitin` | 92 (quarter), 7/8 | F# minor | 56 | clicks and chitters as hats, 2+2+3 pulse, breathing drone, sub pulses |
| `world-lumenari` | 88, 4/4 | E Lydian | 48 | bells in a dotted-eighth cross-rhythm, crisp snare, glassy pad, vibes motif |

Every world's battle stem adds the full kit (snare with ghosts, 16th hats, toms on the fills), its own
percussion layer (tribal congas / anvil and pipes / skittering chitters / ride and double-time bells), a
driven octave bass and a low string swell. The calm loops each have a four-bar break at bar 32 where the drums
drop out, and fills at the end of every eight bars.
