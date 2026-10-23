#!/usr/bin/env python3
"""Extra Terram — scripts/cut-sheets.py v0.1.0 — cut game sprites out of the concept sheets

The art pack (art/concept-sheets/*.png) is four labelled sheets on fake-transparency checkerboards,
not individual sprites. This script knows where each usable unit sits on those sheets, cuts it out,
removes the checkerboard to true alpha, rotates projectiles to point right, and drops the result in
public/sprites/_inbox/ for `python scripts/sprites.py --fit` to place and list.

Mapping decided on 2026-10-23 (swap folders if you prefer a different one):
  sheet 01, Rootkin column 1 (broad, stout, wide caps)  -> ironbark   t1 / t2 / t3a / t3b
  sheet 01, Rootkin column 2 (drooping vines)            -> weepvine   t1 / t2 / t3a / t3b
  sheet 01, Rootkin column 3 (narrow, pointed tops)      -> needlespire t1 / t2 / t3a / t3b
  sheet 01, Rootkin turret row, right-pointing cannon    -> ironbark   turret-t1 … turret-t3b
  sheet 02, Assembly creep row (facing right)            -> compactor, dump-hauler, dozer
  sheet 02, Rootkin projectiles (pointing up-right)      -> needlespire and ironbark projectile

Usage: python scripts/cut-sheets.py   then   python scripts/sprites.py --fit
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SHEETS = ROOT / "art" / "concept-sheets"
INBOX = ROOT / "public" / "sprites" / "_inbox"

S01 = SHEETS / "01_sprite_atlas_overview.png"
S02 = SHEETS / "02_four_faction_asset_sheet.png"

# (sheet, crop box, destination relative to _inbox, rotation degrees counter-clockwise)
CUTS = [
    # Ironbark: column 1
    (S01, (196, 84, 294, 182), "rootkin/ironbark/t1.png", 0),
    (S01, (196, 184, 294, 284), "rootkin/ironbark/t2.png", 0),
    (S01, (196, 288, 294, 392), "rootkin/ironbark/t3a.png", 0),
    (S01, (196, 396, 294, 498), "rootkin/ironbark/t3b.png", 0),
    # Weepvine: column 2
    (S01, (300, 84, 400, 182), "rootkin/weepvine/t1.png", 0),
    (S01, (300, 184, 400, 284), "rootkin/weepvine/t2.png", 0),
    (S01, (300, 288, 400, 392), "rootkin/weepvine/t3a.png", 0),
    (S01, (300, 396, 400, 498), "rootkin/weepvine/t3b.png", 0),
    # Needlespire: column 3
    (S01, (404, 84, 502, 182), "rootkin/needlespire/t1.png", 0),
    (S01, (404, 184, 502, 284), "rootkin/needlespire/t2.png", 0),
    (S01, (404, 288, 502, 392), "rootkin/needlespire/t3a.png", 0),
    (S01, (404, 396, 502, 498), "rootkin/needlespire/t3b.png", 0),
    # Ironbark pod cannon (sheet 02, labelled IRONBARK): points down-left on the sheet, rotated to point right.
    # The same image serves every tier for now.
    (S02, (700, 92, 822, 178), "rootkin/ironbark/turret-t1.png", 135),
    (S02, (700, 92, 822, 178), "rootkin/ironbark/turret-t2.png", 135),
    (S02, (700, 92, 822, 178), "rootkin/ironbark/turret-t3a.png", 135),
    (S02, (700, 92, 822, 178), "rootkin/ironbark/turret-t3b.png", 135),
    # Assembly creeps, facing right. The row label sits just above the first two; ERASE clears it.
    (S02, (432, 944, 492, 1012), "assembly/creeps/compactor.png", 0),
    (S02, (498, 930, 600, 1012), "assembly/creeps/dump-hauler.png", 0),
    (S02, (612, 930, 724, 1012), "assembly/creeps/dozer.png", 0),
    # Projectiles point up-right on the sheet; rotate to point right
    (S02, (1158, 92, 1228, 142), "rootkin/needlespire/projectile.png", -45),
    (S02, (1082, 92, 1140, 142), "rootkin/ironbark/projectile.png", -45),
]

# Sheet regions to blank out before cutting (labels that overlap a crop), in sheet coordinates.
ERASE = {S02: [(430, 920, 526, 944)]}

CHECKER = np.array([[253, 253, 253], [234, 234, 234]], dtype=np.float32)  # the two checker tones


def remove_checker(img: Image.Image) -> Image.Image:
    """Flood-fill the checkerboard from the crop's border and turn it into alpha, with soft edges."""
    rgb = np.asarray(img.convert("RGB"), dtype=np.float32)
    h, w, _ = rgb.shape
    # distance of every pixel to the nearest checker tone
    d = np.min(np.max(np.abs(rgb[:, :, None, :] - CHECKER[None, None, :, :]), axis=3), axis=2)
    # checker tones, plus the pale low-saturation greys of the baked ground shadows some units carry
    grey = (rgb.min(axis=2) > 186) & ((rgb.max(axis=2) - rgb.min(axis=2)) < 16)
    bg_like = (d < 26) | grey
    # flood fill from the border over bg-like pixels (4-neighbourhood)
    mask = np.zeros((h, w), dtype=bool)
    stack = [(y, x) for x in range(w) for y in (0, h - 1) if bg_like[y, x]] + [(y, x) for y in range(h) for x in (0, w - 1) if bg_like[y, x]]
    for y, x in stack:
        mask[y, x] = True
    while stack:
        y, x = stack.pop()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and not mask[ny, nx] and bg_like[ny, nx]:
                mask[ny, nx] = True
                stack.append((ny, nx))
    # enclosed pale blobs the fill cannot reach (a baked ground shadow between a creep's legs):
    # any background-like region of 30+ px that is not part of the unit's own small highlights
    enclosed = bg_like & ~mask
    seen = np.zeros_like(enclosed)
    for y0 in range(h):
        for x0 in range(w):
            if enclosed[y0, x0] and not seen[y0, x0]:
                blob = [(y0, x0)]
                seen[y0, x0] = True
                members = []
                while blob:
                    cy, cx = blob.pop()
                    members.append((cy, cx))
                    for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                        if 0 <= ny < h and 0 <= nx < w and enclosed[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            blob.append((ny, nx))
                if len(members) >= 30:
                    for cy, cx in members:
                        mask[cy, cx] = True
    alpha = np.where(mask, 0.0, 1.0)
    # soften: foreground pixels next to the background that still look checker-ish fade out
    near = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
    near = np.asarray(near) > 0
    soft = np.clip((d - 12) / 48, 0, 1)
    alpha = np.where(near & ~mask, np.minimum(alpha, np.maximum(soft, 0.15)), alpha)
    out = np.dstack([rgb, alpha[:, :, None] * 255]).astype(np.uint8)
    result = Image.fromarray(out, "RGBA")
    # a hair of blur on the alpha only, to kill jaggies from the hard fill
    a = result.getchannel("A").filter(ImageFilter.GaussianBlur(0.6))
    result.putalpha(a)
    return result


def despeckle(img: Image.Image, keep_ratio: float = 0.12) -> Image.Image:
    """Drop stray fragments (a neighbour's leg, a label remnant): keep the largest opaque blob and
    any blob at least keep_ratio of its area."""
    a = np.asarray(img.getchannel("A")) > 40
    h, w = a.shape
    labels = np.zeros((h, w), dtype=np.int32)
    sizes = []
    for y in range(h):
        for x in range(w):
            if a[y, x] and labels[y, x] == 0:
                idx = len(sizes) + 1
                stack = [(y, x)]
                labels[y, x] = idx
                n = 0
                while stack:
                    cy, cx = stack.pop()
                    n += 1
                    for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1), (cy - 1, cx - 1), (cy + 1, cx + 1), (cy - 1, cx + 1), (cy + 1, cx - 1)):
                        if 0 <= ny < h and 0 <= nx < w and a[ny, nx] and labels[ny, nx] == 0:
                            labels[ny, nx] = idx
                            stack.append((ny, nx))
                sizes.append(n)
    if not sizes:
        return img
    biggest = max(sizes)
    keep = {i + 1 for i, n in enumerate(sizes) if n >= biggest * keep_ratio}
    mask = np.isin(labels, list(keep))
    out = np.asarray(img).copy()
    out[:, :, 3] = np.where(mask | (labels == 0), out[:, :, 3], 0)
    # also clear the faint alpha skirt around dropped blobs
    out[:, :, 3] = np.where(np.isin(labels, [i + 1 for i in range(len(sizes)) if (i + 1) not in keep]), 0, out[:, :, 3])
    return Image.fromarray(out, "RGBA")


def main() -> None:
    if not S01.exists() or not S02.exists():
        raise SystemExit(f"concept sheets not found under {SHEETS}")
    sheets = {S01: Image.open(S01).convert("RGB"), S02: Image.open(S02).convert("RGB")}
    for sheet, boxes in ERASE.items():
        for b in boxes:
            sheets[sheet].paste((253, 253, 253), b)
    for sheet, box, rel, rot in CUTS:
        crop = sheets[sheet].crop(box)
        sprite = despeckle(remove_checker(crop))
        if rot:
            sprite = sprite.rotate(rot, resample=Image.BICUBIC, expand=True)
        bbox = sprite.getbbox()
        if bbox:
            sprite = sprite.crop(bbox)
        dst = INBOX / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        sprite.save(dst, optimize=True)
        print(f"cut {rel}: {sprite.width}x{sprite.height}")


if __name__ == "__main__":
    main()
