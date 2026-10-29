#!/usr/bin/env python3
"""Extra Terram — scripts/gen-planets.py v0.1.0 — placeholder planets for the world intro, from the map paintings

  python scripts/gen-planets.py                      writes the placeholder public/art/worlds/<world>.webp for the four worlds
  python scripts/gen-planets.py --from <folder>      converts a delivery (art/world-intro/<world>.png, 2048²) into the shipped WebP at 1024
  python scripts/gen-planets.py --check <folder>     checks a delivery against art/WORLD_INTRO_HANDOFF.md (square, the globe's size and
                                                     centre, transparent corners, the lit side upper left, strips' frames)

A globe seen from orbit per world: fractal terrain over the sphere coloured from the world's own map
painting (its ground colours, the pale trail left out), cloud bands and lowlands tinted in the race's
colour, lit from the upper left with limb darkening, a few lights on the night side, an atmosphere rim,
and a transparent background so the intro screen puts its own stars behind. These are stand-ins until
the key-art agent paints the real establishing shots (art/WORLD_INTRO_HANDOFF.md).
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "art" / "worlds"
SIZE = 1024
WORLDS = {
    "rootkin": ("rootkin-forest-01", "#3f8f3a", 0.55),
    "assembly": ("assembly-scrap-01", "#e8c33a", 0.4),
    "chitin": ("chitin-hive-01", "#8a4fc9", 0.5),
    "lumenari": ("lumenari-crystal-01", "#4fd8e8", 0.65),
}


def hex_rgb(h: str) -> np.ndarray:
    return np.array([int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)], dtype=np.float64) / 255


def noise3(x: np.ndarray, y: np.ndarray, z: np.ndarray, seed: int) -> np.ndarray:
    """Value noise on a 3-D lattice, trilinear, in [0, 1]."""

    def h(ix, iy, iz):
        v = np.sin(ix * 127.1 + iy * 311.7 + iz * 74.7 + seed * 19.19) * 43758.5453
        return v - np.floor(v)

    x0, y0, z0 = np.floor(x), np.floor(y), np.floor(z)
    fx, fy, fz = x - x0, y - y0, z - z0
    fx, fy, fz = (f * f * (3 - 2 * f) for f in (fx, fy, fz))
    out = np.zeros_like(x)
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (fx if dx else 1 - fx) * (fy if dy else 1 - fy) * (fz if dz else 1 - fz)
                out += w * h(x0 + dx, y0 + dy, z0 + dz)
    return out


def fbm3(x, y, z, seed: int, octaves: int = 5, lac: float = 2.1, gain: float = 0.52) -> np.ndarray:
    out = np.zeros_like(x)
    amp = 1.0
    f = 1.0
    norm = 0.0
    for k in range(octaves):
        out += amp * noise3(x * f, y * f, z * f, seed + k * 7)
        norm += amp
        amp *= gain
        f *= lac
    return out / norm


def palette_from(map_id: str, n: int = 7) -> np.ndarray:
    """The painting's ground colours (the pale trail and the pads left out), darkest to brightest."""
    im = np.asarray(Image.open(ROOT / "public" / "maps" / f"{map_id}.jpg").convert("RGB").resize((256, 256))).astype(np.float64) / 255
    px = im.reshape(-1, 3)
    mx, mn = px.max(axis=1), px.min(axis=1)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    ground = px[~((sat < 0.22) & (mx > 0.5))]  # the trail: pale and unsaturated
    lum = ground @ np.array([0.3, 0.59, 0.11])
    order = np.argsort(lum)
    bins = np.array_split(ground[order], n)
    return np.stack([b.mean(axis=0) for b in bins])


def planet(map_id: str, atmo_hex: str, atmo_strength: float, seed: int) -> Image.Image:
    pal = palette_from(map_id)
    atmo = hex_rgb(atmo_hex)
    n = SIZE
    yy, xx = np.mgrid[0:n, 0:n]
    cx = cy = (n - 1) / 2
    r = n * 0.42
    x = (xx - cx) / r
    y = (yy - cy) / r
    d2 = x * x + y * y
    inside = d2 <= 1.0
    z = np.sqrt(np.clip(1 - d2, 0, 1))
    # the surface: fractal noise over the sphere -> a height field -> the painting's ground palette;
    # ridged detail for the terrain's grain, a second field for the cloud bands
    sx, sy, sz = x * 2.6 + seed * 3.1, y * 2.6, z * 2.6
    height = fbm3(sx, sy, sz, seed * 11, octaves=6)
    ridge = 1 - np.abs(fbm3(sx * 2.3 + 9, sy * 2.3, sz * 2.3, seed * 13, octaves=4) * 2 - 1)
    height = np.clip(height * 0.75 + ridge * 0.35 - 0.1, 0, 1)
    height = np.clip((height - 0.5) * 1.6 + 0.5, 0, 1)  # more contrast: continents and lowlands, not one tone
    hv = height * (len(pal) - 1)
    i0 = np.clip(np.floor(hv).astype(int), 0, len(pal) - 2)
    t = (hv - i0)[..., None]
    surf = (pal[i0] * (1 - t) + pal[i0 + 1] * t) * (0.72 + 0.56 * height)[..., None]
    # a little of the atmosphere colour in the lowlands (seas, resin, slag, light)
    low = np.clip((0.35 - height) / 0.35, 0, 1)
    surf = surf * (1 - 0.3 * low[..., None]) + (atmo * 0.5 + pal[0] * 0.5)[None, None, :] * (0.3 * low)[..., None]
    clouds = fbm3(sx * 1.6 + 40, sy * 1.6 + 7 + np.sin(y * 9) * 0.25, sz * 1.6, seed * 17, octaves=5)
    clouds = np.clip((clouds - 0.52) * 3.2, 0, 1) * (0.6 + 0.4 * np.cos(y * 3.2))
    cloud_col = np.clip(atmo * 0.35 + 0.65, 0, 1)
    surf = surf * (1 - 0.55 * clouds[..., None]) + cloud_col[None, None, :] * (0.55 * clouds)[..., None]

    # lighting: a sun from the upper left and slightly in front; lambert plus a soft wrap, limb darkening
    L = np.array([-0.55, -0.45, 0.7])
    L /= np.linalg.norm(L)
    N = np.stack([x, y, z], axis=-1)
    ndl = np.clip((N @ L), -1, 1)
    light = np.clip(0.16 + 0.84 * np.clip(ndl, 0, 1) + 0.12 * np.clip(ndl + 0.35, 0, 1), 0, 1.15)
    limb = 0.55 + 0.45 * z**0.6
    rgb = surf * (light * limb)[..., None]
    haze = np.clip((1 - z) ** 2.2, 0, 1) * 0.55
    rgb = rgb * (1 - haze[..., None]) + atmo[None, None, :] * (haze * light)[..., None]
    night = np.clip(-ndl, 0, 1)
    rgb = rgb + (np.array([0.05, 0.08, 0.12]) * surf.mean(axis=-1, keepdims=True) * night[..., None]) * 0.9
    # the night side's lights: a few warm points on the dark half (settlements, lava, the hive's glow)
    g = np.random.default_rng(seed + 5)
    pts = fbm3(sx * 7 + 3, sy * 7, sz * 7, seed * 23, octaves=2)
    lights = np.clip((pts - 0.66) * 7, 0, 1) * np.clip(night - 0.02, 0, 1) * (height > 0.4)
    rgb = rgb + (atmo * 0.6 + 0.4)[None, None, :] * lights[..., None] * 1.4
    _ = g
    alpha = inside.astype(np.float64)
    edge = np.clip((1.0 - d2) * r * 0.9, 0, 1)
    alpha = alpha * edge

    # atmosphere glow outside the disc, brighter on the lit side
    dr = np.sqrt(d2) - 1.0
    glow = np.clip(np.exp(-np.clip(dr, 0, None) * 9.0) * (dr > 0), 0, 1) * atmo_strength
    lit_side = np.clip(((-x * 0.55 - y * 0.45) / 0.71) * 0.5 + 0.6, 0.25, 1.1)
    glow = glow * lit_side
    out_rgb = rgb * alpha[..., None] + atmo[None, None, :] * (glow * (1 - alpha))[..., None]
    out_a = np.clip(alpha + glow * (1 - alpha), 0, 1)
    img = np.concatenate([np.clip(out_rgb, 0, 1), out_a[..., None]], axis=-1)
    a = np.maximum(img[..., 3:4], 1e-4)
    img[..., :3] = np.clip(img[..., :3] / a, 0, 1)
    return Image.fromarray((img * 255).round().astype(np.uint8), "RGBA")


def measure(path: Path) -> list[str]:
    """The measurable rules of the handoff for one still; a list of problems (empty = OK)."""
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    msgs = []
    if w != h:
        msgs.append(f"not square: {w} x {h}")
    a = np.asarray(im)[..., 3].astype(np.float64) / 255
    rgb = np.asarray(im)[..., :3].astype(np.float64) / 255
    for name, corner in (("top-left", a[:16, :16]), ("top-right", a[:16, -16:]), ("bottom-left", a[-16:, :16]), ("bottom-right", a[-16:, -16:])):
        if corner.mean() > 0.02:
            msgs.append(f"{name} corner is not transparent ({corner.mean():.2f})")
    solid = a > 0.9
    if not solid.any():
        return msgs + ["no opaque globe found"]
    ys, xs = np.nonzero(solid)
    bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
    frac = max(bw, bh) / w
    if not 0.78 <= frac <= 0.9:
        msgs.append(f"the globe spans {frac * 100:.0f}% of the canvas, expected 80-88%")
    cx, cy = (xs.min() + xs.max()) / 2 / w, (ys.min() + ys.max()) / 2 / h
    if abs(cx - 0.5) > 0.02 or abs(cy - 0.5) > 0.02:
        msgs.append(f"the globe is off centre ({cx:.2f}, {cy:.2f})")
    lum = rgb @ np.array([0.3, 0.59, 0.11])
    half = w // 2
    ul = lum[:half, :half][solid[:half, :half]].mean() if solid[:half, :half].any() else 0
    lr = lum[half:, half:][solid[half:, half:]].mean() if solid[half:, half:].any() else 0
    if ul <= lr:
        msgs.append(f"the lit side is not upper left (upper-left {ul:.2f} vs lower-right {lr:.2f})")
    return msgs


def check(folder: Path) -> int:
    bad = 0
    for world in WORLDS:
        still = folder / f"{world}.png"
        if not still.exists():
            print(f"MISSING {still.name}")
            bad += 1
            continue
        msgs = measure(still)
        im = Image.open(still)
        if im.size[0] < 2048:
            msgs.append(f"{im.size[0]} px wide; the handoff asks for 2048")
        strip = folder / f"{world}-strip.png"
        if strip.exists():
            sw, sh = Image.open(strip).size
            if sh != 1024 or sw % 1024 or not 8 <= sw // 1024 <= 12:
                msgs.append(f"strip is {sw} x {sh}; expected 8-12 frames of 1024 x 1024")
            else:
                msgs.append(f"strip: {sw // 1024} frames (ok)")
        print(("WARN " if any(not m.endswith("(ok)") for m in msgs) else "OK   ") + still.name + ("" if not msgs else "\n      " + "\n      ".join(msgs)))
        bad += int(any(not m.endswith("(ok)") for m in msgs))
    return bad


def convert(folder: Path) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for world in WORLDS:
        src = folder / f"{world}.png"
        if not src.exists():
            print(f"skip {world}: no {src.name}")
            continue
        im = Image.open(src).convert("RGBA").resize((1024, 1024), Image.LANCZOS)
        im.save(OUT / f"{world}.webp", "WEBP", quality=88, method=6)
        print(f"wrote {OUT / f'{world}.webp'} from {src}")


def main() -> None:
    import sys

    if "--check" in sys.argv:
        raise SystemExit(1 if check(Path(sys.argv[sys.argv.index("--check") + 1])) else 0)
    if "--from" in sys.argv:
        convert(Path(sys.argv[sys.argv.index("--from") + 1]))
        return
    OUT.mkdir(parents=True, exist_ok=True)
    report = {}
    for i, (world, (map_id, atmo, strength)) in enumerate(WORLDS.items()):
        im = planet(map_id, atmo, strength, i)
        im.save(OUT / f"{world}.webp", "WEBP", quality=86, method=6)
        report[world] = {"webp_kb": round((OUT / f"{world}.webp").stat().st_size / 1024), "problems": measure(OUT / f"{world}.webp")}
        print(world, report[world])
    (OUT / "README.md").write_text(
        "# Placeholder planets\n\nGenerated by `scripts/gen-planets.py` from the solo maps' paintings: a globe seen from orbit for the world intro\n"
        "(`src/ui/WorldIntro.tsx`). The real establishing shots are specified in `art/WORLD_INTRO_HANDOFF.md`; when they\n"
        "arrive they replace these files under the same names (`<world>.webp`, 1024 x 1024, transparent background).\n"
    )
    _ = json


if __name__ == "__main__":
    main()
