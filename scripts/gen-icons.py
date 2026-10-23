#!/usr/bin/env python3
"""Extra Terram — scripts/gen-icons.py v0.2.0 — PWA icons cut from the concept art

Takes the Rootkin tier-2 tower from art/concept-sheets/03_tower_tier_reference.png (the largest
clean rendering of the slice's hero tower), keys out the sheet's navy background, and sets it on a
deep teal-navy rounded tile with a sap-gold glow, matching the art pack's palette.

Writes: public/icons/icon-512.png, icon-192.png, apple-touch-icon.png (180), favicon-32.png,
        and icon-maskable-512.png (same art, safe-zone inset) for the manifest's maskable entry.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "art" / "concept-sheets" / "03_tower_tier_reference.png"
OUT = ROOT / "public" / "icons"
CELL = (486, 62, 704, 276)  # Rootkin, tier 2, inside the sheet's grid lines
BG = np.array([9, 19, 24], dtype=np.float32)
TOL = 22


def cut_tower() -> Image.Image:
    rgb = np.asarray(Image.open(SHEET).convert("RGB").crop(CELL), dtype=np.float32)
    h, w, _ = rgb.shape
    d = np.max(np.abs(rgb - BG), axis=2)
    bg_like = d < TOL
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
    near = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
    soft = np.clip((d - 8) / 40, 0, 1)
    alpha = np.where(mask, 0.0, np.where(near, np.maximum(soft, 0.1), 1.0))
    # keep only the largest opaque blob: drops any grid-line remnant
    solid = alpha > 0.3
    labels = np.zeros((h, w), dtype=np.int32)
    sizes = []
    for y0 in range(h):
        for x0 in range(w):
            if solid[y0, x0] and labels[y0, x0] == 0:
                idx = len(sizes) + 1
                stack2 = [(y0, x0)]
                labels[y0, x0] = idx
                n = 0
                while stack2:
                    cy, cx = stack2.pop()
                    n += 1
                    for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                        if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and labels[ny, nx] == 0:
                            labels[ny, nx] = idx
                            stack2.append((ny, nx))
                sizes.append(n)
    if sizes:
        keep = int(np.argmax(sizes)) + 1
        alpha = np.where((labels == keep) | (labels == 0), alpha, 0.0)
        alpha = np.where((labels == 0) & ~solid & (np.asarray(Image.fromarray((labels == keep).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(3))) > 0), alpha, np.where(labels == 0, 0.0, alpha))
    out = Image.fromarray(np.dstack([rgb, alpha[:, :, None] * 255]).astype(np.uint8), "RGBA")
    out.putalpha(out.getchannel("A").filter(ImageFilter.GaussianBlur(0.6)))
    return out.crop(out.getbbox())


def compose(size: int, inset: float, radius_ratio: float) -> Image.Image:
    s = size
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # tile: deep teal-navy with a subtle vertical gradient
    tile = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    grad = np.linspace(0, 1, s, dtype=np.float32)[:, None]
    top = np.array([16, 44, 50], dtype=np.float32)
    bottom = np.array([6, 16, 22], dtype=np.float32)
    g = (top * (1 - grad) + bottom * grad)[:, None, :].repeat(s, axis=1)
    tile_rgb = Image.fromarray(np.clip(g, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * radius_ratio), fill=255)
    tile.paste(tile_rgb, (0, 0), mask)
    img = Image.alpha_composite(img, tile)
    # gold glow behind the tower
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([s * 0.2, s * 0.28, s * 0.8, s * 0.88], fill=(232, 195, 58, 150))
    glow = glow.filter(ImageFilter.GaussianBlur(s * 0.09))
    glow.putalpha(Image.composite(glow.getchannel("A"), Image.new("L", (s, s), 0), mask))
    img = Image.alpha_composite(img, glow)
    # moss ground ellipse
    ground = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(ground).ellipse([s * 0.22, s * 0.72, s * 0.78, s * 0.9], fill=(50, 110, 50, 200))
    ground = ground.filter(ImageFilter.GaussianBlur(s * 0.02))
    img = Image.alpha_composite(img, ground)
    # the tower
    tower = cut_tower()
    target_h = int(s * (1 - 2 * inset) * 0.84)
    scale = target_h / tower.height
    tower = tower.resize((max(1, int(tower.width * scale)), target_h), Image.LANCZOS)
    x = (s - tower.width) // 2
    y = int(s * (inset + 0.06))
    img.alpha_composite(tower, (x, y))
    d = ImageDraw.Draw(img)
    # thin gold rim on the tile edge
    d.rounded_rectangle([1, 1, s - 2, s - 2], radius=int(s * radius_ratio), outline=(232, 195, 58, 110), width=max(1, s // 128))
    return img


OUT.mkdir(parents=True, exist_ok=True)
base = compose(512, 0.04, 0.22)
base.save(OUT / "icon-512.png", optimize=True)
base.resize((192, 192), Image.LANCZOS).save(OUT / "icon-192.png", optimize=True)
base.resize((180, 180), Image.LANCZOS).save(OUT / "apple-touch-icon.png", optimize=True)
base.resize((32, 32), Image.LANCZOS).save(OUT / "favicon-32.png", optimize=True)
# maskable: the OS crops to a circle/squircle, so keep the art inside the central 80%
maskable = compose(512, 0.14, 0.0)
maskable.save(OUT / "icon-maskable-512.png", optimize=True)
print(f"wrote {OUT.relative_to(ROOT)}: icon-512, icon-192, apple-touch-icon, favicon-32, icon-maskable-512")
