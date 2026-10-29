# Audio delivery 1 — the first masters (2026-10-28)

The composer's answer to `audio/AUDIO_HANDOFF.md`: every id in one drop (`extra-terram-v0180-complete-audio-masters-and-qa.zip`): eleven music pieces and sixty-one effect files for the thirty-one effect ids, as 48 kHz 24-bit WAV masters with OGG (q6 music / q4 effects) and AAC (192 / 160 kbps) encodes, a delivery sheet, their own validator and its logs. Their notes: `COMPOSER_NOTES.md`; their sheet: `delivery-sheet.csv`; their audit: `composer-technical-audit.csv`.

## What went in

Everything. `public/audio/music/` (22 files, 44 MB: loaded on first play, runtime-cached) and `public/audio/sfx/` (122 files, 1.3 MB, precached). `audio/loops.json` carries the loop points (whole files, as delivered), tempo, meter and bars per loop; `npm run audio` wrote the manifest (11 music ids, 31 effect ids). The music is the composer's synthesised first production candidate, as they say themselves; whether it is *the* music is a listening decision, not one these checks make.

## Against the brief, by the numbers

| Piece | Asked | Delivered |
| --- | --- | --- |
| `menu` | 96–108 bpm, D major/modal, 120–180 s | 104 bpm, D major/modal, 64 bars, 147.7 s |
| `world-rootkin` (+battle) | 84–96, D or G Dorian, 90–150 s | 90 bpm, D Dorian, 48 bars, 128.0 s, the pair sample-matched |
| `world-assembly` (+battle) | 112–124, A minor/Phrygian | 120 bpm, A Phrygian, 56 bars, 112.0 s |
| `world-chitin` (+battle) | 100–112, F# minor, 7/8 or 5/4 welcome | 105 bpm, F# minor, 7/8, 64 bars, 128.0 s |
| `world-lumenari` (+battle) | 96–108, E major/Lydian | 104 bpm, E Lydian, 48 bars, 110.8 s |
| `result-win` / `result-lose` | 4–8 s, no loop | 6.25 s / 6.5 s |

Character, measured on the masters (spectral centroid as brightness, onsets a minute as busyness): the battle stems are brighter and denser than their calm loops in every world (Rootkin 621 → 2313 Hz and 121 → 156 onsets/min; Assembly 571 → 1346 Hz; Chitin 375 → 1441 Hz — the darkest calm loop, as asked; Lumenari 570 → 1864 Hz and 70 → 205 onsets/min — the arpeggios at double speed). Levels sit where the brief put them (calm around −18 LUFS, battle −16, menu −15, stings −14; true peaks under −1 dBTP by their audit). Every effect id has the variation count the brief asked for; lengths are inside the brief's ranges; no head silence.

## Checked with `npm run check-audio`

34 OK, 8 to look at, 0 failing after integration (42 ids). The 8 are all the same thing: **the loops' last beat decays into a dip** — the last 100–300 ms of each world loop and the menu sit 5–9 dB under the loop's head, and `world-assembly-battle`'s last bar has ~75 ms of near silence before its final hit. The composer's "seam fix" (a 28 ms cosine join of the file's edges, `scripts/fix_loop_seams.py` in their drop) makes the sample values meet, which it does (the join is click-free); it does not keep the music going across the bar line. Heard: a short breath at each restart, every two minutes or so. Mild, and left as delivered; the ask back is below.

**Lossy overshoot.** The masters peak at −3 dBFS as the brief asked, but the OGG/AAC encodes of the brightest transients overshoot: `death-carapace` (all three, to +0.4 dBFS OGG / +1.3 AAC), `hit-splash-2`, `hit-acid-3`, `hit-thorn-1` / `-3`, and the AAC of `hit-acid-2` and `boss-appear-1`. On integration those five ids were re-encoded from the WAV masters 3 dB down (same codec settings), and `loops.json` gives them `gain: 1.41` so they sit at the delivered level in the mix; the mixer now has a limiter on the master as well (v0.2.0), so the summed voices cannot clip the output either way.

Not verifiable here: how the AAC files loop on iOS (AAC carries encoder priming; the game trusts the container's edit list to trim it — if a loop lands 44 ms late on an iPhone, that is why, and OGG would be the fix on that platform if Safari ever decodes it).

## To send back

1. **Loop tails.** Let the last notes ring across the bar line: render each loop one bar long, then fold the overhang (the releases and reverb of the last bar) into the first bar before cutting — or keep a sustained element through the seam. The dip is the only seam problem; the sample join is fine.
2. **Encode headroom.** Normalise effects to −4 dBFS before the lossy encode, or check the decoded peaks of the encodes (the game's checker does): five ids overshoot.
3. Nothing else is missing. If a second pass comes, the creative notes from listening go with it — these checks say the delivery matches the brief, not that the music is right.
