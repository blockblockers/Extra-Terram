#!/usr/bin/env python3
"""Extra Terram — scripts/cut-strip.py v0.1.0 — turn a keyframe lineup into an animation strip

A lineup is one image with the same unit drawn N times in a row (what an image generator produces
from the Art Round 2 prompts). This script:
  1. removes the background (checkerboard, flat colour or pale shadow) to true alpha, as cut-sheets does,
  2. finds the N frames by splitting the row evenly (or by the gaps between blobs with --auto),
  3. trims each frame to the shared footprint and checks they agree within 6%,
  4. writes a strip of N square frames, one after another, at the canvas size the unit uses.

Usage:
  python scripts/cut-strip.py <lineup.png> <frames> <out-strip.png> [--size 256] [--auto]
  e.g. python scripts/cut-strip.py inbox/needlespire-t1-idle.png 6 public/sprites/rootkin/needlespire/t1-idle.png
  Creeps use --size 128. Towers anchor their footprint at 66% down the canvas; creeps centre.
Needs numpy, pillow. Shares the cut-out code with cut-sheets.py.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cut_sheets_lib import despeckle, remove_checker  # noqa: E402


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 3:
        raise SystemExit(__doc__)
    src, n, out = Path(args[0]), int(args[1]), Path(args[2])
    size = 256
    if "--size" in sys.argv:
        size = int(sys.argv[sys.argv.index("--size") + 1])
    auto = "--auto" in sys.argv
    tower = size >= 200

    img = Image.open(src).convert("RGB")
    cut = remove_checker(img)
    alpha = np.asarray(cut.getchannel("A")) > 40
    cols_with_ink = alpha.any(axis=0)

    if auto:
        # split on the empty columns between blobs
        runs = []
        start = None
        for x, ink in enumerate(cols_with_ink):
            if ink and start is None:
                start = x
            if not ink and start is not None:
                runs.append((start, x))
                start = None
        if start is not None:
            runs.append((start, len(cols_with_ink)))
        runs = [r for r in runs if r[1] - r[0] > 8]
        if len(runs) != n:
            raise SystemExit(f"--auto found {len(runs)} blobs, expected {n}; try without --auto")
        boxes = [(x0, 0, x1, cut.height) for x0, x1 in runs]
    else:
        fw = cut.width / n
        boxes = [(round(i * fw), 0, round((i + 1) * fw), cut.height) for i in range(n)]

    frames = []
    for b in boxes:
        f = despeckle(cut.crop(b))
        bb = f.getbbox()
        if not bb:
            raise SystemExit(f"frame {len(frames) + 1} is empty")
        frames.append(f.crop(bb))

    # all frames must share a footprint, or the unit will jitter: compare sizes to the first
    w0, h0 = frames[0].size
    for i, f in enumerate(frames):
        dw = abs(f.width - w0) / w0
        dh = abs(f.height - h0) / h0
        if dw > 0.06 or dh > 0.06:
            raise SystemExit(f"frame {i + 1} is {f.width}x{f.height}, frame 1 is {w0}x{h0}: more than 6% apart, the unit moved between frames")

    ratio = 0.70 if tower else 0.72
    target = size * ratio
    scale = target / max(w0, h0)
    strip = Image.new("RGBA", (size * n, size), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        f = f.resize((max(1, round(f.width * scale)), max(1, round(f.height * scale))), Image.LANCZOS)
        if tower:
            x = round(size * 0.5 - f.width / 2)
            y = round(size * (168 / 256) - f.height * 0.92)
        else:
            x = round(size * 0.5 - f.width / 2)
            y = round(size * 0.5 - f.height / 2)
        strip.alpha_composite(f, (i * size + max(0, min(size - f.width, x)), max(0, min(size - f.height, y))))
    out.parent.mkdir(parents=True, exist_ok=True)
    strip.save(out, optimize=True)
    print(f"wrote {out} ({n} frames of {size}px)")


if __name__ == "__main__":
    main()
