#!/usr/bin/env python3
"""Extra Terram — scripts/gen-background.py v0.1.0 — Phase 1 scaffold

Paints a placeholder home-world background for a map from its JSON tile grid, so the board
reads as terrain rather than a game board: layered value-noise ground, a worn trail along the
path with ragged edges, mossy "stumps" on the build pads, and bioluminescent motes.

The grid is a data structure, not a look: nothing here draws tile squares. The engine still
positions everything on cells; the renderer only lays sprites over this image.

Usage:  python scripts/gen-background.py [map-id]      (default: rootkin-forest-01)
Output: public/maps/<map-id>.png at 64 px per tile.
Needs:  numpy, pillow
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

TILE = 64
ROOT = Path(__file__).resolve().parent.parent
MAP_ID = sys.argv[1] if len(sys.argv) > 1 else "rootkin-forest-01"
SEED = 7  # deterministic art: re-running produces the same file

rng = np.random.default_rng(SEED)


def value_noise(w: int, h: int, octaves=((8, 1.0), (16, 0.5), (32, 0.25), (64, 0.125))):
    """Sum of bilinearly-upsampled random grids. Cheap, dependency-free, good enough for moss."""
    acc = np.zeros((h, w), dtype=np.float32)
    total = 0.0
    for cells, weight in octaves:
        small = rng.random((cells + 1, int(cells * w / h) + 2)).astype(np.float32)
        img = Image.fromarray((small * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        acc += np.asarray(img, dtype=np.float32) / 255.0 * weight
        total += weight
    return acc / total


def lerp(a, b, t):
    return a + (b - a) * t


def waypoints_from_grid(grid, legend, cols, rows):
    """Same BFS the engine runs (src/engine/map.ts), so the painted trail is the path creeps walk."""
    kinds = {(c, r): legend[grid[r][c]] for r in range(rows) for c in range(cols)}
    start = next(k for k, v in kinds.items() if v == "spawn")
    goal = next(k for k, v in kinds.items() if v == "exit")
    prev = {start: None}
    queue = [start]
    while queue:
        cur = queue.pop(0)
        if cur == goal:
            break
        c, r = cur
        for n in ((c, r - 1), (c + 1, r), (c, r + 1), (c - 1, r)):
            if n in kinds and n not in prev and kinds[n] in ("path", "spawn", "exit"):
                prev[n] = cur
                queue.append(n)
    path = []
    node = goal
    while node is not None:
        path.append(node)
        node = prev[node]
    path.reverse()
    return [(c * TILE + TILE / 2, r * TILE + TILE / 2) for c, r in path], kinds


def main():
    map_path = ROOT / "src" / "content" / "maps" / f"{MAP_ID}.json"
    m = json.loads(map_path.read_text())
    cols, rows = m["cols"], m["rows"]
    w, h = cols * TILE, rows * TILE
    points, kinds = waypoints_from_grid(m["grid"], m["legend"], cols, rows)

    # --- ground: dark forest floor with moss, canopy shadow and a little warmth
    n1 = value_noise(w, h)
    n2 = value_noise(w, h, octaves=((4, 1.0), (12, 0.6), (48, 0.3)))
    deep = np.array([10, 30, 20], dtype=np.float32)
    moss = np.array([44, 96, 48], dtype=np.float32)
    bright = np.array([86, 140, 62], dtype=np.float32)
    ground = lerp(deep, moss, n1[..., None]) * 0.75 + lerp(deep, bright, n2[..., None]) * 0.25
    # canopy shadow blobs
    shade = value_noise(w, h, octaves=((3, 1.0), (6, 0.5)))
    ground *= (0.72 + 0.4 * shade)[..., None]
    img = Image.fromarray(np.clip(ground, 0, 255).astype(np.uint8), "RGB")

    # --- the trail: a wide soft stroke along the path, edges roughened by noise
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.line(points, fill=255, width=int(TILE * 0.78), joint="curve")
    for x, y in points:
        d.ellipse([x - TILE * 0.39, y - TILE * 0.39, x + TILE * 0.39, y + TILE * 0.39], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(TILE * 0.18))
    rough = value_noise(w, h, octaves=((24, 1.0), (96, 0.5)))
    trail = np.asarray(mask, dtype=np.float32) / 255.0
    trail = np.clip((trail - 0.35 + (rough - 0.5) * 0.35) * 3.0, 0, 1)
    # dirt colours: packed earth in the middle, root-brown at the edges
    dirt_core = np.array([120, 92, 58], dtype=np.float32)
    dirt_edge = np.array([70, 52, 34], dtype=np.float32)
    core = np.clip((np.asarray(mask.filter(ImageFilter.GaussianBlur(TILE * 0.25)), dtype=np.float32) / 255.0 - 0.55) * 3, 0, 1)
    dirt = lerp(dirt_edge, dirt_core, core[..., None]) * (0.85 + 0.3 * n1)[..., None]
    base = np.asarray(img, dtype=np.float32)
    base = lerp(base, dirt, trail[..., None])
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")

    # --- build pads: mossy stumps / clearings, drawn as soft discs with a faint ring
    pads = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pads)
    for (c, r), kind in kinds.items():
        if kind != "pad":
            continue
        cx, cy = c * TILE + TILE / 2, r * TILE + TILE / 2
        jitter = rng.uniform(-3, 3, 2)
        cx += jitter[0]
        cy += jitter[1]
        rr = TILE * 0.36
        pd.ellipse([cx - rr - 2, cy - rr + 4, cx + rr + 2, cy + rr + 6], fill=(5, 14, 8, 110))  # shadow
        pd.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(78, 104, 52, 230))
        pd.ellipse([cx - rr * 0.78, cy - rr * 0.78, cx + rr * 0.78, cy + rr * 0.78], fill=(106, 132, 64, 255))
        pd.ellipse([cx - rr * 0.5, cy - rr * 0.5, cx + rr * 0.5, cy + rr * 0.5], outline=(60, 80, 40, 200), width=2)
        pd.ellipse([cx - rr * 0.22, cy - rr * 0.22, cx + rr * 0.22, cy + rr * 0.22], outline=(60, 80, 40, 160), width=2)
    pads = pads.filter(ImageFilter.GaussianBlur(0.8))
    img = Image.alpha_composite(img.convert("RGBA"), pads)

    # --- spawn and exit: a scorched gate where the crew enters, the grove heart where they must not
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for (c, r), kind in kinds.items():
        cx, cy = c * TILE + TILE / 2, r * TILE + TILE / 2
        if kind == "spawn":
            gd.ellipse([cx - TILE * 0.5, cy - TILE * 0.5, cx + TILE * 0.5, cy + TILE * 0.5], fill=(60, 30, 18, 200))
            gd.ellipse([cx - TILE * 0.3, cy - TILE * 0.3, cx + TILE * 0.3, cy + TILE * 0.3], fill=(232, 195, 58, 120))
        if kind == "exit":
            gd.ellipse([cx - TILE * 0.55, cy - TILE * 0.55, cx + TILE * 0.55, cy + TILE * 0.55], fill=(50, 140, 90, 150))
            gd.ellipse([cx - TILE * 0.32, cy - TILE * 0.32, cx + TILE * 0.32, cy + TILE * 0.32], fill=(160, 240, 190, 220))
    glow = glow.filter(ImageFilter.GaussianBlur(TILE * 0.12))
    img = Image.alpha_composite(img, glow)

    # --- bioluminescent motes scattered off the trail
    motes = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    md = ImageDraw.Draw(motes)
    trail_mask = trail > 0.4
    placed = 0
    while placed < 140:
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        if trail_mask[int(y) % h, int(x) % w]:
            continue
        rad = rng.uniform(1.2, 3.2)
        col = (120, 240, 210, int(rng.uniform(90, 200))) if rng.random() < 0.7 else (200, 240, 120, 150)
        md.ellipse([x - rad, y - rad, x + rad, y + rad], fill=col)
        placed += 1
    halo = motes.filter(ImageFilter.GaussianBlur(4))
    img = Image.alpha_composite(img, halo)
    img = Image.alpha_composite(img, motes)

    # --- vignette so the edges fall away instead of ending at a hard border
    yy, xx = np.mgrid[0:h, 0:w]
    vx = np.minimum(xx, w - 1 - xx) / (w * 0.5)
    vy = np.minimum(yy, h - 1 - yy) / (h * 0.5)
    vig = np.clip(np.minimum(vx, vy) * 4.0, 0, 1) * 0.35 + 0.65
    arr = np.asarray(img.convert("RGB"), dtype=np.float32) * vig[..., None]
    out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")

    out_path = ROOT / "public" / "maps" / f"{MAP_ID}.png"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out.save(out_path, optimize=True)
    print(f"wrote {out_path.relative_to(ROOT)} ({w}x{h})")


if __name__ == "__main__":
    main()
