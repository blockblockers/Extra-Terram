#!/usr/bin/env python3
"""Extra Terram — scripts/gen-icons.py v0.5.0 — the game icon: the alien world, defended from every land mass

Built only from delivered art:
  - the world: the planet from the key art (public/art/title.jpg) as a full disc with its atmosphere
    glow, floating islands and all;
  - a small defence cannon on every floating island (art/icon/cannon-source.png, the user's cannon
    painting), each firing out into space: the left-hand islands aim up and left (the painting
    mirrored), the right-hand ones up and right, each tilted a little differently. Every cannon gets a
    contact shadow on its island, a light grade toward the scene (a touch less saturated, darker and
    bluer, slightly softened) so it sits in the painting, a muzzle flash, and a glowing bolt with a
    white-hot head flying away from it;
  - a deep-space tile with a few stars.

The cannon is keyed out of its blue background by growing the background in from the edges
(blue-dominant pixels, small steps only), keeping its warm sparks, dropping cold specks, and fading the
painted beam out so it does not end in a hard cut.

Writes (public/icons/ unless noted):
  icon-512.png, icon-192.png        manifest "any" icons: rounded tile, transparent corners
  icon-maskable-512.png             manifest "maskable": full bleed, the planet inside the safe zone
  apple-touch-icon.png (180)        iOS home screen: full-bleed square (iOS rounds it itself; transparent
                                    corners would turn black there)
  favicon-16/32/48.png              browser tabs and search results (Google wants a multiple of 48)
  public/favicon.ico (16, 32, 48)   for anything that asks for /favicon.ico by default

Run: python scripts/gen-icons.py   (also part of `npm run art`). After changing the art, bump the
`?v=` on the icon URLs in index.html and vite.config.ts so browsers drop the cached icons.
Island spots are `SPOTS` below, in planet-disc coordinates (0..1 from the disc's top-left).
"""
from collections import deque
from pathlib import Path

import math

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
KEY_ART = ROOT / "public" / "art" / "title.jpg"
PLANET = (1077, 320, 316)  # centre x, centre y, radius of the planet in the key art (1536 x 2048)
CANNON_SRC = ROOT / "art" / "icon" / "cannon-source.png"
MUZZLE = (405.0, 140.0)  # centre of the barrel mouth in the cannon painting
BEAM_DIR = (0.894, -0.447)  # the beam's direction (unit vector, image coordinates)
OUT = ROOT / "public" / "icons"

# layout, as fractions of the content box
PLANET_CENTRE = (0.50, 0.52)
PLANET_DIAMETER = 0.80
# one cannon per floating island: (x, y of the island's top surface in the disc, cannon width as a
# fraction of the disc, facing +1 right / -1 left, tilt in degrees counter-clockwise)
SPOTS = [
    (0.265, 0.300, 0.10, -1, 0),  # the small ruin island, upper left
    (0.425, 0.385, 0.13, -1, 6),  # the grassy island, left
    (0.655, 0.520, 0.12, 1, 0),  # the castle island
    (0.560, 0.640, 0.14, 1, -4),  # the big lower island
    (0.790, 0.715, 0.12, 1, 8),  # the island on the right
    (0.450, 0.780, 0.10, -1, -6),  # the small lower island
]
BOLT_LENGTH = 0.26  # of the disc


def cut_cannon() -> Image.Image:
    im = np.asarray(Image.open(CANNON_SRC).convert("RGB")).astype(np.float32)
    h, w, _ = im.shape
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    white = (r > 235) & (g > 235) & (b > 235)  # the painting's rounded corners
    blueish = (b >= r + 25) & (b >= g - 8) & ~white
    bg = np.zeros((h, w), bool)
    q: deque[tuple[int, int]] = deque()
    edge = [(y, x) for y in range(h) for x in (0, 1, w - 2, w - 1)] + [(y, x) for x in range(w) for y in (0, 1, h - 2, h - 1)]
    for y, x in edge:
        if not bg[y, x] and (white[y, x] or blueish[y, x]):
            bg[y, x] = True
            q.append((y, x))
    while q:
        y, x = q.popleft()
        c = im[y, x]
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and not bg[ny, nx]:
                if (white[ny, nx] and white[y, x]) or (blueish[ny, nx] and np.abs(im[ny, nx] - c).max() < 14):
                    bg[ny, nx] = True
                    q.append((ny, nx))
    fg = ~bg
    # components: the cannon (largest) and warm sparks stay; cold specks of background go
    lab = np.zeros((h, w), np.int32)
    sizes: list[int] = []
    warm: list[bool] = []
    for y0 in range(h):
        for x0 in range(w):
            if fg[y0, x0] and lab[y0, x0] == 0:
                n = len(sizes) + 1
                stack = [(y0, x0)]
                lab[y0, x0] = n
                count = 0
                acc = np.zeros(3)
                while stack:
                    y, x = stack.pop()
                    count += 1
                    acc += im[y, x]
                    for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                        if 0 <= ny < h and 0 <= nx < w and fg[ny, nx] and lab[ny, nx] == 0:
                            lab[ny, nx] = n
                            stack.append((ny, nx))
                mean = acc / count
                sizes.append(count)
                warm.append(bool(mean[0] > mean[2] + 30))
    keep = np.zeros(len(sizes) + 1, bool)
    keep[int(np.argmax(sizes)) + 1] = True
    for i, (n, hot) in enumerate(zip(sizes, warm)):
        if hot and n >= 6:
            keep[i + 1] = True
    fg = keep[lab] & fg
    alpha = np.asarray(Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))).astype(np.float32) / 255
    # fade the beam out before the painting's edge (and its ragged halo with it)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    t = (xx - MUZZLE[0]) * BEAM_DIR[0] + (yy - MUZZLE[1]) * BEAM_DIR[1]
    perp = np.abs((xx - MUZZLE[0]) * -BEAM_DIR[1] + (yy - MUZZLE[1]) * BEAM_DIR[0])
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    cone = (t > 20) & (perp < 120)
    fade = np.clip(1 - (t - 50) / 62, 0, 1)
    dim = np.clip((lum - 120) / 80, 0, 1)
    alpha = np.where(cone, alpha * fade * np.where(t > 45, dim, 1), alpha)
    cut = Image.fromarray(np.dstack([im, alpha * 255]).astype(np.uint8), "RGBA")
    return cut.crop(cut.getbbox())


class Cannon:
    """The cut-out cannon with its muzzle and the middle of its base, in its own pixels."""

    def __init__(self) -> None:
        full = cut_cannon()
        self.image = full
        # cut_cannon crops to the opaque box; find that box's origin in the painting to place the muzzle
        im = np.asarray(Image.open(CANNON_SRC).convert("RGB")).astype(np.float32)
        a = np.asarray(full.getchannel("A")) > 250
        ref = np.asarray(full.convert("RGB")).astype(np.float32)[a]
        best = (1e9, 0, 0)
        for oy in range(0, im.shape[0] - full.height + 1):
            for ox in range(0, im.shape[1] - full.width + 1):
                diff = float(np.abs(im[oy : oy + full.height, ox : ox + full.width][a] - ref).mean())
                if diff < best[0]:
                    best = (diff, ox, oy)
                if diff == 0:
                    break
            if best[0] == 0:
                break
        self.muzzle = (MUZZLE[0] - best[1], MUZZLE[1] - best[2])
        alpha = np.asarray(full.getchannel("A"))
        bottom = int(np.where(alpha.max(axis=1) > 200)[0][-1])
        xs = np.where(alpha[bottom - 6] > 200)[0]
        self.base = ((xs[0] + xs[-1]) / 2, bottom)

    def sprite(self, width: float, facing: int, tilt: float):
        """Scaled, mirrored, graded and tilted; returns (image, base point, muzzle point, aim unit vector)."""
        k = width / self.image.width
        im = self.image.resize((max(1, int(self.image.width * k)), max(1, int(self.image.height * k))), Image.LANCZOS)
        bx, by = self.base[0] * k, self.base[1] * k
        mx, my = self.muzzle[0] * k, self.muzzle[1] * k
        if facing < 0:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
            bx, mx = im.width - bx, im.width - mx
        # sit it in the painting: less saturated, a touch darker and bluer, slightly softened
        im = ImageEnhance.Color(im).enhance(0.85)
        im = ImageEnhance.Brightness(im).enhance(0.92)
        r, g, b, a = im.split()
        im = Image.merge("RGBA", (r.point(lambda v: int(v * 0.94)), g.point(lambda v: int(v * 0.98)), b, a))
        im = im.filter(ImageFilter.GaussianBlur(max(0.3, width * 0.004)))
        pad = max(im.width, im.height)
        canvas = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
        canvas.alpha_composite(im, (pad, pad))
        cx, cy = bx + pad, by + pad
        rot = canvas.rotate(tilt, resample=Image.BICUBIC, center=(cx, cy))
        t = math.radians(tilt)  # PIL turns counter-clockwise for a positive angle; y points down
        dx, dy = mx + pad - cx, my + pad - cy
        muzzle = (cx + dx * math.cos(t) + dy * math.sin(t), cy - dx * math.sin(t) + dy * math.cos(t))
        ax, ay = BEAM_DIR[0] * facing, BEAM_DIR[1]
        aim = (ax * math.cos(t) + ay * math.sin(t), -ax * math.sin(t) + ay * math.cos(t))
        return rot, (cx, cy), muzzle, aim


def bolt(layer: Image.Image, flash: Image.Image, x0: float, y0: float, ux: float, uy: float, length: float, width: float) -> None:
    """A shot flying away from a cannon: a tapered streak, white-hot head far out, tail fading toward the muzzle."""
    d = ImageDraw.Draw(layer)
    px, py = -uy, ux
    n = 48
    t_start = length * 0.18
    for i in range(n):
        f0, f1 = i / n, (i + 1) / n
        t0 = t_start + (length - t_start) * f0
        t1 = t_start + (length - t_start) * f1
        w0, w1 = width * (0.15 + 0.85 * f0), width * (0.15 + 0.85 * f1)
        colour = (255, int(150 + 90 * f1), int(40 + 150 * f1**3), int(255 * f1**1.4))
        d.polygon(
            [
                (x0 + ux * t0 + px * w0 / 2, y0 + uy * t0 + py * w0 / 2),
                (x0 + ux * t1 + px * w1 / 2, y0 + uy * t1 + py * w1 / 2),
                (x0 + ux * t1 - px * w1 / 2, y0 + uy * t1 - py * w1 / 2),
                (x0 + ux * t0 - px * w0 / 2, y0 + uy * t0 - py * w0 / 2),
            ],
            fill=colour,
        )
    hx, hy = x0 + ux * length, y0 + uy * length
    r = width * 0.75
    d.ellipse([hx - r * 1.3, hy - r * 1.3, hx + r * 1.3, hy + r * 1.3], fill=(255, 250, 225, 255))
    fr = width * 1.1
    ImageDraw.Draw(flash).ellipse([x0 - fr, y0 - fr, x0 + fr, y0 + fr], fill=(255, 200, 110, 190))


def planet_disc(d: int) -> Image.Image:
    im = Image.open(KEY_ART).convert("RGBA")
    cx, cy, r = PLANET
    disc = im.crop((cx - r, cy - r, cx + r, cy + r)).resize((d, d), Image.LANCZOS)
    mask = Image.new("L", (d * 2, d * 2), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, d * 2 - 1, d * 2 - 1], fill=255)
    disc.putalpha(mask.resize((d, d), Image.LANCZOS))
    return disc


def compose(s: int, safe: float, rounded: bool, cannon: Cannon) -> Image.Image:
    """The icon at s x s. `safe` insets the content box (maskable icons keep it inside the safe zone)."""
    # sky: deep space, a few stars (fixed seed: the icon never changes by itself)
    ys = np.linspace(0, 1, s, dtype=np.float32)[:, None]
    top = np.array([14, 38, 64], np.float32)
    bottom = np.array([6, 15, 21], np.float32)
    g = (top * (1 - ys) + bottom * ys)[:, None, :].repeat(s, axis=1)
    img = Image.fromarray(np.clip(g, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    rng = np.random.default_rng(7)
    draw = ImageDraw.Draw(img)
    for _ in range(int(s * 0.12)):
        x, y = rng.uniform(0, s), rng.uniform(0, s)
        rr = rng.uniform(0.4, 1.3) * s / 512
        draw.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(220, 235, 255, int(rng.uniform(80, 220))))
    box = s * (1 - 2 * safe)
    ox = oy = s * safe

    # the planet with its atmosphere glow
    pd = int(box * PLANET_DIAMETER)
    pcx, pcy = ox + box * PLANET_CENTRE[0], oy + box * PLANET_CENTRE[1]
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gr = pd * 0.56
    ImageDraw.Draw(glow).ellipse([pcx - gr, pcy - gr, pcx + gr, pcy + gr], fill=(90, 170, 255, 170))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(pd * 0.06)))
    px0, py0 = pcx - pd / 2, pcy - pd / 2
    big = Image.new("RGBA", (s * 3, s * 3), (0, 0, 0, 0))
    big.alpha_composite(planet_disc(pd), (int(px0) + s, int(py0) + s))
    img = Image.alpha_composite(img, big.crop((s, s, 2 * s, 2 * s)))

    # a cannon on every island, each firing out into space
    bolts = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    flashes = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    for fx, fy, fw, facing, tilt in SPOTS:
        w = pd * fw
        spr, (bx, by), (mx, my), (ux, uy) = cannon.sprite(w, facing, tilt)
        X, Y = px0 + fx * pd, py0 + fy * pd
        shadow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        ImageDraw.Draw(shadow).ellipse([X - w * 0.42, Y - w * 0.06, X + w * 0.42, Y + w * 0.07], fill=(10, 20, 10, 150))
        img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(max(1, w * 0.04))))
        img.alpha_composite(spr, (int(X - bx), int(Y - by)))
        bolt(bolts, flashes, X - bx + mx, Y - by + my, ux, uy, pd * BOLT_LENGTH, max(1.5, pd * 0.016))
    img = Image.alpha_composite(img, flashes.filter(ImageFilter.GaussianBlur(max(1, s * 0.008))))
    halo = bolts.filter(ImageFilter.GaussianBlur(max(1, s * 0.008)))
    img = Image.alpha_composite(Image.alpha_composite(img, halo), halo)
    img = Image.alpha_composite(img, bolts)

    if rounded:
        mask = Image.new("L", (s * 4, s * 4), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, s * 4 - 1, s * 4 - 1], radius=int(s * 4 * 0.22), fill=255)
        out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask.resize((s, s), Image.LANCZOS))
        ImageDraw.Draw(out).rounded_rectangle([1, 1, s - 2, s - 2], radius=int(s * 0.22), outline=(120, 190, 255, 90), width=max(1, s // 170))
        return out
    return img.convert("RGB").convert("RGBA")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cannon = Cannon()
    big = compose(1024, 0.03, True, cannon)  # drawn large, scaled down: crisper small sizes
    sizes = {"icon-512.png": 512, "icon-192.png": 192, "favicon-48.png": 48, "favicon-32.png": 32, "favicon-16.png": 16}
    for name, size in sizes.items():
        big.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)
    compose(1024, 0.03, False, cannon).resize((180, 180), Image.LANCZOS).convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)
    compose(1024, 0.13, False, cannon).resize((512, 512), Image.LANCZOS).convert("RGB").save(OUT / "icon-maskable-512.png", optimize=True)
    big.resize((48, 48), Image.LANCZOS).save(ROOT / "public" / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"wrote {OUT.relative_to(ROOT)}: {', '.join(sizes)}, apple-touch-icon.png, icon-maskable-512.png; public/favicon.ico")


if __name__ == "__main__":
    main()
