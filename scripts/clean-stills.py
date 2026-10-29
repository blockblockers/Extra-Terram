#!/usr/bin/env python3
"""Extra Terram — scripts/clean-stills.py v0.2.0 — tidy cut-out tower stills from an art drop; stills with strips are left alone

Generated sprite sheets get cropped by other tools with the usual leftovers: label text under the
unit ("T3A"), a sliver of the neighbouring cell, the sheet's grid lines along the crop edge. This pass
removes those without touching the unit, then reports anything it cannot fix (a unit clipped by
the crop). Run it before `npm run art-drop`; it is also part of that script.

  python scripts/clean-stills.py            clean every tower still under public/sprites in place
  python scripts/clean-stills.py --dry-run  report only
  python scripts/clean-stills.py <dir>      clean a folder outside the project (an unpacked drop)

Rules (opaque = alpha > 40; components are 8-connected):
  0. full-span rows or columns (>= 95% opaque across the whole canvas) are the sheet's cell border
     and are cleared first, even when they touch the unit
  1. grid lines: a component spanning >= 200 px in one direction and <= 6 px in the other → removed
  2. slivers: a thin component (<= 12 px thick, >= 40 px long, < 15% of the unit) → removed; these are
     the edge of the neighbouring cell's sprite caught by the crop
  3. labels: a component under 100 px sitting in the bottom 20 px of the unit → removed (the "T3A"
     under a sheet cell lands there); specks under 20 px anywhere → removed
  4. detached parts (floating seeds, shards) are kept: anything else off the edge stays
A still with strips beside it (<state>-idle.png, <state>-fire.png) is reported but never changed: its strips'
frame 0 must stay equal to it, and cleaning the still alone would make the tower jump when a strip starts.
After cleaning, a unit whose own bounding box touches the canvas edge is reported as CLIPPED: the
drop must re-crop it with margin; the game shows it as delivered meanwhile.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
TOWER_STATES = {"t1", "t2", "t3a", "t3b"}
STRUCT = np.ones((3, 3), dtype=bool)


def clean(path: Path, dry: bool) -> tuple[list[str], bool]:
    img = Image.open(path).convert("RGBA")
    arr = np.array(img)
    alpha = arr[:, :, 3]
    h, w = alpha.shape
    opaque = alpha > 40
    removed: list[str] = []
    # 0. border rows/columns of the sheet cell: a unit never fills a whole row of the canvas
    full_rows = np.where(opaque.mean(axis=1) >= 0.95)[0]
    full_cols = np.where(opaque.mean(axis=0) >= 0.95)[0]
    if len(full_rows) or len(full_cols):
        arr[full_rows, :, 3] = 0
        arr[:, full_cols, 3] = 0
        alpha = arr[:, :, 3]
        opaque = alpha > 40
        removed.append(f"border rows {list(map(int, full_rows))} cols {list(map(int, full_cols))}")
    lab, k = ndimage.label(opaque, structure=STRUCT)
    if k == 0:
        return (["empty image"], False)
    objs = ndimage.find_objects(lab)
    sizes = ndimage.sum(opaque, lab, range(1, k + 1))
    main_idx = int(np.argmax(sizes)) + 1
    main_size = int(sizes[main_idx - 1])
    main_bottom = objs[main_idx - 1][0].stop
    kill = np.zeros_like(opaque)
    for i, sl in enumerate(objs, start=1):
        if i == main_idx:
            continue
        size = int(sizes[i - 1])
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        cw, ch = x1 - x0, y1 - y0
        on_edge = x0 == 0 or y0 == 0 or x1 == w or y1 == h
        why = None
        if (cw >= 200 and ch <= 6) or (ch >= 200 and cw <= 6):
            why = "grid line"
        elif min(cw, ch) <= 12 and max(cw, ch) >= 40 and size < 0.15 * main_size:
            why = "sliver" if not on_edge else "edge sliver"
        elif size < 100 and (y0 + y1) / 2 >= main_bottom - 20:
            why = "label"
        elif size < 20:
            why = "speck"
        if why:
            kill |= lab == i
            removed.append(f"{why} {size}px at ({x0},{y0})")
    if removed and not dry:
        arr[kill, 3] = 0
        Image.fromarray(arr, "RGBA").save(path, optimize=True)
    # is the unit itself cut by the crop?
    rest = opaque & ~kill
    ys, xs = np.where(rest)
    edges = []
    if len(xs):
        if xs.min() == 0:
            edges.append("left")
        if ys.min() == 0:
            edges.append("top")
        if xs.max() == w - 1:
            edges.append("right")
        if ys.max() == h - 1:
            edges.append("bottom")
    if edges:
        removed.append("CLIPPED at " + "/".join(edges))
    return (removed, bool(edges))


def main() -> None:
    dry = "--dry-run" in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    base = Path(args[0]).resolve() if args else ROOT / "public" / "sprites"
    cleaned = 0
    clipped_files: list[str] = []
    for png in sorted(base.rglob("*.png")):
        rel = png.relative_to(base).as_posix()
        if png.stem not in TOWER_STATES or rel.startswith("_"):
            continue
        img = Image.open(png)
        if img.size[0] != img.size[1]:
            continue  # a strip
        has_strips = any((png.parent / f"{png.stem}-{a}.png").exists() for a in ("idle", "fire"))
        removed, clipped = clean(png, dry or has_strips)
        if removed and has_strips:
            print(f"{rel:44s} kept (it has strips): {'; '.join(removed)}")
            removed = []
        if removed:
            cleaned += 1
            print(f"{rel:44s} {'would remove' if dry else 'removed'}: {'; '.join(removed)}")
        if clipped:
            clipped_files.append(rel)
    print(f"{cleaned} still(s) {'need' if dry else 'had'} cleaning")
    if clipped_files:
        print("CLIPPED by the crop (re-crop with margin):")
        for f in clipped_files:
            print(f"  {f}")


if __name__ == "__main__":
    main()
