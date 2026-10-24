#!/usr/bin/env python3
"""Extra Terram — scripts/cut_sheets_lib.py v0.1.0 — shared cut-out helpers (checker removal, despeckle)"""
import numpy as np
from PIL import Image, ImageFilter

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


