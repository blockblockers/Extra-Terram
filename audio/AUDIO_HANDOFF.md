# Extra-Terram — Audio Handoff: Music and Sound Effects (2026-10-28, game v0.18.0)

The shareable version with the full tables: https://claude.ai/artifact/XwXqMpDzS5jM8jYDc9MHbD. This file is the
repo copy, kept with `loops.json` (the delivery sheet, copied by hand) next to it.

## What the game plays and when

| Scene | Music | Cues over it |
| --- | --- | --- |
| Title, menu, lobbies, login | `menu` theme, looping | interface taps |
| A run on a map | `world-<world>` calm loop; `world-<world>-battle` fades in during a wave, out in the build window | shots, impacts, deaths, leaks, building, wave start, wave cleared, mini-boss, sends |
| Paused | the same music at −10 dB | nothing |
| The run ends | `result-win` / `result-lose` sting over the ducked music, then the menu theme | — |

Worlds are the home planets: `rootkin` (forest moon: Mossbank Hollow, Twin Hollows, Elder Fork), `assembly` (scrap
plains: Slag Trench, Foundry Crown), `chitin` (hive tunnels: Brood Gallery, Four Warrens), `lumenari` (crystal
fields: Prism Span, Three Rivers of Light, Crystal Throne). A run's music is the map's world, whichever race plays.

## Music (11 pieces) — the direction, revised 2026-10-28

**Trip-hop.** Percussive, not synth-led: slow, heavy, swung drums with ghost notes and off-time accents (the
snare displaced, pickups on the e and a, a 7/8 where it fits), dusty breaks, a deep sub bass with space
between the notes, sparse Rhodes / vibes / plucked guitar rather than pads, dub delays and long reverbs, vinyl
grain. Think Massive Attack, Portishead, DJ Shadow, Bonobo's early records: the groove carries the piece, the
melody is a few notes that sit back. Synth pads only as a low bed under the drums, never the lead voice.

The game ships with a set written in this language (`audio/compose/`, generated from code: the table in its
README has each piece's tempo, meter, key and palette). A composed replacement should keep the same ids,
lengths, tempos and stem structure so it drops in, and beat the set on feel: real-sounding drums and
percussion, played grooves, better sounds.

| Id | Character | Tempo, key | Length |
| --- | --- | --- | --- |
| `menu` | the theme: a head-nod break under a vibes melody, Rhodes, a muted funk guitar chucking on the off-16ths, strings in the second half; wide and a little strange | 80–86, D Mixolydian / modal | 120–180 s loop |
| `world-rootkin` | woody: rim instead of snare, congas, woodblock, shaker, a log drum; Rhodes off the beat; a flute line far back | 84–90, D Dorian | 90–150 s loop |
| `world-rootkin-battle` | the full kit comes in over it — snare with ghosts, 16th hats, toms on the fills — with tribal congas and a low string swell; never metal | same, same length | = calm |
| `world-assembly` | half-time and heavy: kick on 1, snare on 3, swung hard; pipe hits and metal as percussion; a distorted sub; dark Rhodes stabs | 90–96, A Phrygian | 90–150 s |
| `world-assembly-battle` | the industrial break: double kicks, snare and clap, an anvil on 3, pipe hits on the 16ths, tom rolls; the bass driven; a low cluster of strings | same | = calm |
| `world-chitin` | in 7/8 (2+2+3): clicks and chitters as the hats, a sub pulse, a drone that breathes; wet and dark | quarter 88–96, F# minor, 7/8 | 90–150 s |
| `world-chitin-battle` | skittering: chitters on every 16th, double kicks, the snare answering across the 3, the drone rising, dissonant strings | same | = calm |
| `world-lumenari` | bells in a dotted-eighth cross-rhythm over a crisp, light break; glassy pad; a vibes motif; the most melodic | 86–92, E Lydian | 90–150 s |
| `world-lumenari-battle` | bells at double speed, a ride, snare ghosts, strings high and bright | same | = calm |
| `result-win` | a drum fill into a crash and a rising vibes line over a major Rhodes chord; no loop | free | 4–8 s |
| `result-lose` | a long low kick, toms falling, the bass stepping down to a minor chord, not cruel | free | 4–8 s |

## Loop and stem rules

1. Both stems of a world are the same length to the sample, same tempo, key and bar structure: the game starts
   them together and only moves their volumes.
2. Seamless at the file's edge (bar-aligned, no fade), or give loop points in seconds in the sheet; a tail after
   the loop end plays only when the music stops.
3. No intro inside the loop.
4. The battle stem must sound right at any mix: it fades in over 1.5 s and may sit at 30%; the calm layer drops
   to 65% under it. Write it as a layer that adds, not a replacement.
5. Headroom for the cues: −18 LUFS integrated calm, −16 battle, −15 menu, stings −14; true peak −1 dBTP.
6. Scenes crossfade over 1.2 s; pause is −10 dB; stings duck the music to −7 dB. No special versions needed.

## Sound effects (31 ids; variations as files `<id>-<n>`)

| Id | When | Character | Length | Var. |
| --- | --- | --- | --- | --- |
| `fire-thorn` | Rootkin shot | woody snap with a whip of air | 0.08–0.25 s | 3 |
| `fire-kinetic` | Assembly gun | dry industrial report, mid-weight | 0.1–0.3 s | 3 |
| `fire-acid` | Chitin spit | wet pressurised spit, short hiss | 0.1–0.3 s | 3 |
| `fire-energy` | Lumenari bolt | bright zap with a glassy edge | 0.1–0.3 s | 3 |
| `fire-splash` | a lobbing tower (any race) | deep launch thump | 0.2–0.5 s | 2 |
| `fire-beam` | a beam held on a target (≤ 3×/s per tower) | soft hum fragment, repeats well | 0.25–0.5 s | 2 |
| `hit-thorn` / `hit-kinetic` / `hit-acid` / `hit-energy` | a shot lands | puncture / clack on armour / sizzle / crystalline tick | 0.04–0.2 s | 3 each |
| `hit-splash` | a shell bursts | round mid-sized explosion, thud over crack | 0.25–0.5 s | 2 |
| `death-bark` / `death-plated` / `death-carapace` / `death-shielded` | a creep dies, by armour | wood and sap / metal collapse / shell crunch / glass into light | 0.2–0.7 s | 3 each |
| `leak` / `leak-boss` | a creep / mini-boss reaches the exit | two falling notes with a knock / heavier, longer | 0.3–1.0 s | 1 |
| `lives-low` | lives ≤ 3 | pulsing warning, not shrill | 0.4–0.8 s | 1 |
| `place` / `upgrade` / `reinforce` / `sell` | building | settle onto the pad / rising three notes / two notes / falling two notes with a coin | 0.15–0.6 s | 2 / 2 / 1 / 1 |
| `income` | an economy tower pays out | a small coin or sap-drip tick | 0.05–0.15 s | 2 |
| `wave-start` / `wave-boss` / `wave-clear` | the wave begins / a boss wave begins / the board is clear | a two-note horn / lower, three notes, a drum / a light three-note resolve | 0.4–1.5 s | 1 |
| `boss-appear` | the mini-boss steps on | low impact with a roar or engine | 0.6–1.2 s | 1 |
| `send` / `incoming` | a send leaves / arrives (multiplayer) | a whoosh away / a three-note alert | 0.25–0.6 s | 1 |
| `ui-tap` / `ui-error` | a button / a refused action | a tiny click / a short dull buzz | 0.02–0.2 s | 1 |

Shots and impacts play hundreds of times a minute: short, on the transient, variations differing in pitch and grain.

## How the mixer plays them (src/audio)

Events are grouped per tick by id; a tick with twelve shots of one kind starts two voices, a touch louder (+3.5 dB
at most). Each id keeps a shortest gap between starts (55 ms shots, 40 impacts, 50 deaths, 120 shells, 320 beams,
1 s horns) and a voice cap (3 shots, 4 impacts/deaths, 2 shells/building, 1 horns/alarms; 24 on the bus); the
oldest voice gives way. Priority when a tick wants more than 8 starts: horns, boss, leaks, building, then deaths,
shells, shots, impacts, coins. Pan ±35% by board position, pitch ±4%. Base gains are the game's (`SFX_RULES` in
src/audio/types.ts); deliver effects peak-normalised. Stings duck music −7 dB; pause −10 dB and no effects.

## Delivery

- Masters WAV 48 kHz 24-bit; for the game both OGG Vorbis (q6 music, q4 effects) and AAC M4A (160–192 kbps). No MP3.
- Music at the LUFS above, true peak −1 dBTP; effects peak-normalised to −3 dBFS (−6 for the two UI sounds); no
  silence at an effect's head.
- Paths under `public/audio/`: `music/<id>.ogg|m4a`; `sfx/<id>-<n>.ogg|m4a` (one variation is still `-1`).
- The sheet: per music file its loop points if not the file's edge, tempo, key, bars; any trim per effect → we
  copy it into `audio/loops.json`; `npm run audio` writes `public/audio/manifest.json`.
- `npm run check-audio -- <folder>`: ids, encodings, 48 kHz, lengths, loudness or peak, head silence, loop seam.
- Until a file arrives its id plays a placeholder made in code; files replace placeholders one id at a time.

## Order of work

1. One world end to end (~20 files): `menu`, `world-rootkin` + battle, the two stings, `wave-start`, `wave-clear`,
   `leak`, `place`, `upgrade`, `sell`, `fire-thorn`, `hit-thorn`, `death-bark` (3 each), `ui-tap`.
2. The other three worlds: their pairs and their weapon, impact and death sets; `fire-splash`, `hit-splash`, `fire-beam`.
3. The rest: `wave-boss`, `boss-appear`, `leak-boss`, `lives-low`, `income`, `reinforce`, `send`, `incoming`, `ui-error`.

## Status — delivery 1 (2026-10-28, game v0.20.0)

Every id arrived in one drop (eleven music pieces, sixty-one effect files): review in the repo at
`audio/review/2026-10-28-first-masters/README.md`. **The effects are in the game.** The music matched the brief by
the numbers but not by ear (synth-led, not percussive); the direction above replaces the old music section, and
the game now plays a trip-hop set generated in the repo (`audio/compose/`) until a composed one beats it. Two
things to send back with the new direction:

1. **Loop tails** — the last beat of every loop decays into a 5–9 dB dip (the seam join itself is click-free), so
   each restart breathes. Fold the last bar's releases and reverb into the first bar before cutting, or keep a
   sustained element across the bar line.
2. **Encode headroom** — the lossy encodes of the brightest effects (`death-carapace`, `hit-splash`, `hit-acid`,
   `hit-thorn`, `boss-appear`) overshoot 0 dBFS from −3 dBFS masters; normalise to −4 dBFS before encoding, or
   check the decoded peaks. (Those five were re-encoded 3 dB down on integration and trimmed back up in the mix.)

Whether the music is right for the game is a listening decision still to make; these checks only say it matches
the brief.
