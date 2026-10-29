# Extra-Terram v0.18.0 — Original Audio Pack

Created 2026-10-28 from the supplied **Audio Handoff: Music and Sound Effects**.

## What's included

- **11 original synthesized music pieces** (menu, four calm world loops, four additive battle stems, win and loss stings).
- **31 sound-effect IDs / 61 variation files**, numbered `<id>-1`, `<id>-2`, etc.
- 48 kHz, stereo, 24-bit WAV masters (`masters/music/`, `masters/sfx/`).
- 48 kHz OGG Vorbis (`q6` music; `q4` SFX) and AAC/M4A (192 kbps music; 160 kbps SFX).
- All world music loops start at file sample 0 and end at the exact file's end. The paired calm/battle streams match **to the sample**.
- `audio/delivery-sheet.csv` includes exact timing, tempo, meter, key and every effect variation.
- `reference/loops-proposed.json` is *illustrative metadata*, **not verified as the current game's schema**.
- `qa/preview-reel.ogg` provides short excerpts and the full independent technical audit is in `qa/`.

## Install into game v0.18.0

1. Extract **Game Drop** archive into the game's repository root, retaining `public/audio/music/` and `public/audio/sfx/` paths.
2. In the **actual v0.18.0 project**, run `npm run audio` to create `public/audio/manifest.json` from the game's code. Do not overwrite its existing `audio/loops.json` with the reference JSON blindly: copy appropriate loop metadata from `audio/delivery-sheet.csv` using the project's expected fields. All loops use full-file boundaries, so no extra trim is intended.
3. Run `npm run check-audio -- <folder>` on the game-drop folder according to its actual CLI; preview menu, four maps, results, building, and many-shots mixer operation. The actual v0.18.0 source was **not supplied**, so this tool could not be run here.
4. Map world determines the soundtrack, not the faction chosen by the player. The game starts both world stems synchronously and crossfades their gains.

## Mixing notes

- Menu −15 LUFS; calm layers −18 LUFS; additive battle layers −16 LUFS; stings −14 LUFS. True peaks ≤ −1 dBTP.
- Effects peak-normalized to −3 dBFS; UI sounds to −6 dBFS, with no intentional head silence.
- The game owns voice caps, ducking, fades, event coalescing, pitch changes and stereo pan. **Do not** add duplicate effects/limiting in these files.
- Music is synthesized/composed original work made for this request. It is a **first production candidate**, not a live-orchestra or recorded Foley replacement; creative listening approval is still advised. Its sounds do not use any external copyrighted compositions or samples.

## Validation performed

The independent `scripts/validate_audio.py` checks file IDs and variation counts, lengths, 48-kHz stereo encoding, WAV depth, peak targets, integrated LUFS, ffmpeg ebur128 true-peak measurements, seamless PCM loop boundary, paired stem sample lengths, onset and OGG/AAC durations. **It passed with zero errors and warnings.**

The handoff-specific game's `npm run check-audio` and actual in-game mixer tests remain outstanding because v0.18.0 project code was not attached. The latest project available in the conversation is v0.17.0, which predates the audio pipeline.
