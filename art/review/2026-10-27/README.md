# Art review, 2026-10-27 (v0.15.1)

The review of all the game's art and the design specs that came out of it live in the doc
*Extra-Terram — Art Review, Enhancements and Design Specs* (https://claude.ai/artifact/WY6XpaoSDXrbj1VFoCmKYv):
one look for the whole game (light, value ladder, contour and rim, race palettes, phone scale), then maps,
towers, creeps, effects, interface and animation, a spec sheet of every file, and the next art round in five
batches with their acceptance checks.

`scripts/check-art.py` measures the art against those specs (`npm run check-art`, or
`python scripts/check-art.py all --drop <delivery>` for a delivery before it goes in).
`check-art-baseline-v0.15.1.txt` is its report on the game as of v0.15.1, the starting point for the next
round: towers 0 of 28 meet the specs, creeps 0 of 16, painted maps 0 of 7, strips 28 of 212. Every tower and
creep fails the contour rule first.

The rework that answered this review, and what of it went into v0.15.2: `../2026-10-27-rework/`.
