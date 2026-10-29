#!/usr/bin/env python3
"""Extra Terram — scripts/gen-planets.py v0.2.0 — world intro import, validation, and optional placeholder generation

  python scripts/gen-planets.py                      writes the placeholder public/art/worlds/<world>.webp for the four worlds
  python scripts/gen-planets.py --from <folder>      converts full-size <world>.png still + <world>-strip.png (8-12 frames),
                                                     or legacy <world>-sheet.png / numbered frames, to shipped WebPs
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
    if not 0.78 <= frac <= 0.95:
        msgs.append(f"the globe spans {frac * 100:.0f}% of the canvas, expected 80-88% (up to 94% passes)")
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
        got = load_frames(folder, world)
        if not got:
            print(f"MISSING {world}: no {world}-sheet.png, {world}-<n>.png or {world}.png")
            bad += 1
            continue
        frames, source = got
        msgs = []
        f0 = frames[0]
        if f0.width < 1024:
            msgs.append(f"frames are {f0.width} px; the handoff asks for 1024 frames")
        still = folder / f"{world}.png"
        if still.exists():
            with Image.open(still) as master:
                if master.size != (2048, 2048):
                    msgs.append(f"master still is {master.size}, expected 2048 x 2048")
            msgs += measure(still)
        else:
            tmp = folder / f".{world}-f0.png"
            f0.save(tmp)
            msgs += measure(tmp)
            tmp.unlink()
        if (folder / f"{world}-strip.png").exists() and still.exists():
            from PIL import ImageChops
            base = Image.open(still).convert("RGBA").resize((1024, 1024), Image.Resampling.LANCZOS)
            if ImageChops.difference(f0, base).getbbox() is not None:
                msgs.append("frame 0 does not match the downsampled 2048 still")
        if len(frames) > 1:
            sizes = {f.size for f in frames}
            if len(sizes) > 1:
                msgs.append(f"frames differ in size: {sorted(sizes)}")
            msgs.append(f"{len(frames)} frames from {source} (ok)")
        warn = any(not m.endswith("(ok)") for m in msgs)
        print(("WARN " if warn else "OK   ") + world + ("" if not msgs else "\n      " + "\n      ".join(msgs)))
        bad += int(warn)
    return bad


def load_frames(folder: Path, world: str) -> tuple[list[Image.Image], str] | None:
    """A world's delivered frames: a `<world>-strip.png` horizontal strip, `<world>-sheet.png` grid, several
    `<world>-<n>.png`, or the single `<world>.png` still. Returns the frames and where they came from."""
    strip = folder / f"{world}-strip.png"
    if strip.exists():
        im = Image.open(strip).convert("RGBA")
        w, h = im.size
        if h == 0 or w % h or not (8 <= w // h <= 12):
            raise ValueError(f"{strip}: expected horizontal 8-12 square frames, got {w} x {h}")
        n = w // h
        return [im.crop((i * h, 0, (i + 1) * h, h)) for i in range(n)], f"{strip.name} ({n} frames of {h} px)"
    sheet = folder / f"{world}-sheet.png"
    if sheet.exists():
        im = Image.open(sheet).convert("RGBA")
        w, h = im.size
        # the cells are square: the grid is whatever divides the sheet into squares
        cols, rows = (1, 1)
        for c in range(1, 13):
            for r in range(1, 13):
                if c * r in (1, 2, 4, 6, 8, 9, 10, 12, 16) and abs(w / c - h / r) <= 2 and c * r > cols * rows:
                    cols, rows = c, r
        cw, ch = w // cols, h // rows
        frames = [im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)) for r in range(rows) for c in range(cols)]
        return frames, f"{sheet.name} ({cols} x {rows} grid, cells {cw} x {ch})"
    numbered = sorted(folder.glob(f"{world}-[0-9]*.png"), key=lambda p: int(p.stem.rsplit("-", 1)[1]))
    if numbered:
        return [Image.open(p).convert("RGBA") for p in numbered], f"{len(numbered)} numbered frames"
    still = folder / f"{world}.png"
    if still.exists():
        return [Image.open(still).convert("RGBA")], still.name
    return None


def normalise(frames: list[Image.Image], size: int) -> list[Image.Image]:
    """Every frame on a square canvas of `size`, the globe centred and scaled to one common diameter (painted
    frames drift and breathe a little from one to the next; this keeps the planet still under the animation)."""
    boxes = []
    for f in frames:
        a = np.asarray(f)[..., 3]
        ys, xs = np.nonzero(a > 128)
        boxes.append((xs.min(), ys.min(), xs.max(), ys.max()))
    diam = int(np.median([max(x1 - x0, y1 - y0) + 1 for x0, y0, x1, y1 in boxes]))
    target = size * 0.86  # the handoff's globe: 84-88% of the canvas
    out = []
    for f, (x0, y0, x1, y1) in zip(frames, boxes):
        d = max(x1 - x0, y1 - y0) + 1
        scale = target / d
        cx, cy = (x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2
        nw, nh = int(round(f.width * scale)), int(round(f.height * scale))
        g = f.resize((nw, nh), Image.LANCZOS)
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        canvas.alpha_composite(g, (int(round(size / 2 - cx * scale)), int(round(size / 2 - cy * scale))))
        out.append(canvas)
    _ = diam
    return out


def convert(folder: Path) -> None:
    """Install author-provided masters and animations as runtime WebPs.

    When an exact 1024 frame strip and 2048 master exist together, frame zero is kept
    pixel-aligned with the downsampled still; do not re-fit their geometry. For old
    undersized concept sheets, normalise painted frames as before.
    """
    OUT.mkdir(parents=True, exist_ok=True)
    for world in WORLDS:
        got = load_frames(folder, world)
        if not got:
            print(f"skip {world}: nothing delivered")
            continue
        frames, source = got
        master_path = folder / f"{world}.png"
        has_native_strip = (folder / f"{world}-strip.png").exists()
        if has_native_strip:
            if not master_path.exists():
                raise ValueError(f"{world}: full-res strip requires matching <world>.png still")
            master = Image.open(master_path).convert("RGBA")
            if master.size != (2048, 2048):
                raise ValueError(f"{world}: expected 2048x2048 still, got {master.size}")
            if any(f.size != (1024, 1024) for f in frames):
                raise ValueError(f"{world}: every frame of the authored strip must be 1024x1024")
            poster = master.resize((1024, 1024), Image.Resampling.LANCZOS)
            # Strong compatibility guarantee: still and first animated frame cannot flash when loading.
            from PIL import ImageChops
            if ImageChops.difference(frames[0], poster).getbbox() is not None:
                raise ValueError(f"{world}: the animation's first frame differs from its still")
        else:
            size = min(1024, frames[0].width)
            frames = normalise(frames, size)
            poster = frames[0]
        poster.save(OUT / f"{world}.webp", "WEBP", quality=90, method=3)
        line = f"{world}: still 1024 px from {master_path.name if has_native_strip else source}"
        if len(frames) > 1:
            size = frames[0].width
            strip = Image.new("RGBA", (size * len(frames), size), (0, 0, 0, 0))
            for i, f in enumerate(frames):
                strip.paste(f, (i * size, 0))
            strip.save(OUT / f"{world}-frames.webp", "WEBP", quality=86, method=2)
            line += f"; {len(frames)} frames -> {world}-frames.webp ({(OUT / f'{world}-frames.webp').stat().st_size // 1024} KB)"
        else:
            (OUT / f"{world}-frames.webp").unlink(missing_ok=True)
        print(line)


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
