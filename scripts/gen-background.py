#!/usr/bin/env python3
"""Extra Terram — scripts/gen-background.py v0.2.0 — forest-moon background matched to the concept art

Paints the home-world background for a map from its JSON tile grid. Tuned to the art pack's
Rootkin look: saturated moss and leaf greens with teal shadow, a warm bark-brown trail with root
edges and pale stepping stones, glowing sap-gold rimmed stumps on the build pads, a gold gate at
the spawn and a cyan-green grove heart at the exit, bioluminescent motes and canopy light.

The grid is a data structure, not a look: nothing here draws tile squares. The engine positions
everything on cells; the renderer only lays sprites over this image.

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
SEED = 11  # deterministic art: re-running produces the same file

rng = np.random.default_rng(SEED)

# Palette from the art pack (sheet 04): moss #3f8f3a, bark #6b4a2b, sap gold #e8c33a, pale leaf #7fd36b
MOSS = np.array([63, 143, 58], dtype=np.float32)
LEAF = np.array([127, 211, 107], dtype=np.float32)
DEEP = np.array([8, 34, 30], dtype=np.float32)  # teal-black shadow, the art's dark ground
TEAL = np.array([14, 70, 62], dtype=np.float32)
BARK = np.array([107, 74, 43], dtype=np.float32)
BARK_DARK = np.array([58, 38, 22], dtype=np.float32)
STONE = np.array([150, 128, 96], dtype=np.float32)
SAP = (232, 195, 58)


def value_noise(w: int, h: int, octaves=((8, 1.0), (16, 0.5), (32, 0.25), (64, 0.125))):
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

    # --- ground: layered moss with teal shadow and leaf-green highlights (the art's saturated greens)
    n1 = value_noise(w, h)
    n2 = value_noise(w, h, octaves=((5, 1.0), (14, 0.6), (40, 0.3)))
    n3 = value_noise(w, h, octaves=((3, 1.0), (7, 0.5)))  # canopy light pools
    ground = lerp(DEEP, MOSS, np.clip(n1 * 1.25 - 0.1, 0, 1)[..., None])
    ground = lerp(ground, TEAL, (np.clip(0.55 - n2, 0, 1) * 1.1)[..., None])  # teal in the hollows
    ground = lerp(ground, LEAF, (np.clip(n3 - 0.62, 0, 1) * 1.6)[..., None])  # sunlit patches
    # moss clumps: small bright speckles
    clump = value_noise(w, h, octaves=((48, 1.0), (96, 0.6)))
    ground = lerp(ground, LEAF * 0.85, (np.clip(clump - 0.7, 0, 1) * 1.4)[..., None])
    img = Image.fromarray(np.clip(ground, 0, 255).astype(np.uint8), "RGB")

    # --- the trail: bark-brown path with ragged root edges and pale stepping stones
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.line(points, fill=255, width=int(TILE * 0.80), joint="curve")
    for x, y in points:
        d.ellipse([x - TILE * 0.40, y - TILE * 0.40, x + TILE * 0.40, y + TILE * 0.40], fill=255)
    mask_blur = mask.filter(ImageFilter.GaussianBlur(TILE * 0.16))
    rough = value_noise(w, h, octaves=((20, 1.0), (80, 0.5)))
    trail = np.asarray(mask_blur, dtype=np.float32) / 255.0
    trail = np.clip((trail - 0.38 + (rough - 0.5) * 0.3) * 3.2, 0, 1)
    core = np.clip((np.asarray(mask.filter(ImageFilter.GaussianBlur(TILE * 0.26)), dtype=np.float32) / 255.0 - 0.58) * 3.2, 0, 1)
    dirt = lerp(BARK_DARK, BARK, core[..., None]) * (0.8 + 0.4 * n1)[..., None]
    # stepping stones along the centre line
    stones = Image.new("L", (w, h), 0)
    sd = ImageDraw.Draw(stones)
    for i in range(len(points) - 1):
        (x0, y0), (x1, y1) = points[i], points[i + 1]
        seg = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
        steps = max(1, int(seg / (TILE * 0.55)))
        for k in range(steps):
            t = (k + 0.5) / steps
            sx = x0 + (x1 - x0) * t + rng.uniform(-6, 6)
            sy = y0 + (y1 - y0) * t + rng.uniform(-6, 6)
            rx, ry = rng.uniform(9, 14), rng.uniform(6, 10)
            sd.ellipse([sx - rx, sy - ry, sx + rx, sy + ry], fill=int(rng.uniform(150, 230)))
    stones_a = np.asarray(stones.filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float32) / 255.0 * trail
    dirt = lerp(dirt, STONE * (0.85 + 0.3 * n1)[..., None], stones_a[..., None] * 0.9)
    base = np.asarray(img, dtype=np.float32)
    base = lerp(base, dirt, trail[..., None])
    # root edges: a darker rim just outside the trail
    rim = np.clip(trail - np.clip((trail - 0.3) * 2.5, 0, 1), 0, 1)
    base = lerp(base, BARK_DARK * 0.7, (rim * 0.75)[..., None])
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB").convert("RGBA")

    # --- build pads: stumps with sap-gold rims and a glowing centre, matching the towers' gold core
    pads = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pads)
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for (c, r), kind in kinds.items():
        if kind != "pad":
            continue
        cx = c * TILE + TILE / 2 + rng.uniform(-2, 2)
        cy = r * TILE + TILE / 2 + rng.uniform(-2, 2)
        rr = TILE * 0.36
        gd.ellipse([cx - rr * 1.5, cy - rr * 1.3, cx + rr * 1.5, cy + rr * 1.5], fill=(232, 195, 58, 60))
        pd.ellipse([cx - rr - 2, cy - rr + 5, cx + rr + 2, cy + rr + 8], fill=(4, 18, 14, 150))  # shadow
        pd.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(78, 54, 30, 255))  # stump
        pd.ellipse([cx - rr * 0.86, cy - rr * 0.86, cx + rr * 0.86, cy + rr * 0.86], fill=(118, 84, 48, 255))
        pd.ellipse([cx - rr * 0.86, cy - rr * 0.86, cx + rr * 0.86, cy + rr * 0.86], outline=(232, 195, 58, 210), width=2)
        for ring in (0.62, 0.4, 0.2):
            pd.ellipse([cx - rr * ring, cy - rr * ring, cx + rr * ring, cy + rr * ring], outline=(70, 46, 24, 170), width=1)
        pd.ellipse([cx - rr * 0.16, cy - rr * 0.16, cx + rr * 0.16, cy + rr * 0.16], fill=(240, 210, 90, 230))
        # moss tufts on the rim
        for k in range(5):
            a = rng.uniform(0, 6.283)
            tx, ty = cx + np.cos(a) * rr * 0.95, cy + np.sin(a) * rr * 0.75
            pd.ellipse([tx - 4, ty - 3, tx + 4, ty + 3], fill=(96, 170, 80, 220))
    glow = glow.filter(ImageFilter.GaussianBlur(TILE * 0.22))
    img = Image.alpha_composite(img, glow)
    img = Image.alpha_composite(img, pads.filter(ImageFilter.GaussianBlur(0.6)))

    # --- spawn gate (gold, scorched) and grove heart (cyan-green bloom)
    marks = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    md = ImageDraw.Draw(marks)
    for (c, r), kind in kinds.items():
        cx, cy = c * TILE + TILE / 2, r * TILE + TILE / 2
        if kind == "spawn":
            md.ellipse([cx - TILE * 0.55, cy - TILE * 0.55, cx + TILE * 0.55, cy + TILE * 0.55], fill=(70, 34, 18, 220))
            md.ellipse([cx - TILE * 0.34, cy - TILE * 0.34, cx + TILE * 0.34, cy + TILE * 0.34], fill=(232, 195, 58, 170))
            md.ellipse([cx - TILE * 0.16, cy - TILE * 0.16, cx + TILE * 0.16, cy + TILE * 0.16], fill=(255, 240, 170, 230))
        if kind == "exit":
            md.ellipse([cx - TILE * 0.6, cy - TILE * 0.6, cx + TILE * 0.6, cy + TILE * 0.6], fill=(40, 150, 110, 150))
            md.ellipse([cx - TILE * 0.36, cy - TILE * 0.36, cx + TILE * 0.36, cy + TILE * 0.36], fill=(140, 240, 190, 210))
            md.ellipse([cx - TILE * 0.14, cy - TILE * 0.14, cx + TILE * 0.14, cy + TILE * 0.14], fill=(240, 255, 240, 240))
    marks = marks.filter(ImageFilter.GaussianBlur(TILE * 0.1))
    img = Image.alpha_composite(img, marks)

    # --- leaf clusters and ferns off the trail (the art's leafy crowns, as ground cover)
    leaves = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ld = ImageDraw.Draw(leaves)
    trail_mask = trail > 0.35
    pad_cells = {k for k, v in kinds.items() if v == "pad"}
    placed = 0
    while placed < 90:
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        if trail_mask[int(y) % h, int(x) % w] or (int(x // TILE), int(y // TILE)) in pad_cells:
            continue
        n = int(rng.integers(3, 6))
        base_a = rng.uniform(0, 6.283)
        for k in range(n):
            a = base_a + k * (6.283 / n)
            lx, ly = x + np.cos(a) * 7, y + np.sin(a) * 5
            col = (int(rng.uniform(80, 130)), int(rng.uniform(170, 215)), int(rng.uniform(70, 110)), 200)
            ld.ellipse([lx - 6, ly - 3, lx + 6, ly + 3], fill=col)
        placed += 1
    leaves = leaves.rotate(0)
    img = Image.alpha_composite(img, leaves.filter(ImageFilter.GaussianBlur(0.4)))

    # --- bioluminescent motes with halos
    motes = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    md = ImageDraw.Draw(motes)
    placed = 0
    while placed < 160:
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        if trail_mask[int(y) % h, int(x) % w]:
            continue
        rad = rng.uniform(1.2, 3.0)
        col = (150, 245, 215, int(rng.uniform(110, 220))) if rng.random() < 0.65 else (232, 215, 110, 170)
        md.ellipse([x - rad, y - rad, x + rad, y + rad], fill=col)
        placed += 1
    img = Image.alpha_composite(img, motes.filter(ImageFilter.GaussianBlur(5)))
    img = Image.alpha_composite(img, motes)

    # --- canopy light shafts and vignette
    shafts = value_noise(w, h, octaves=((2, 1.0), (5, 0.4)))
    arr = np.asarray(img.convert("RGB"), dtype=np.float32)
    arr = arr * (0.9 + 0.25 * shafts)[..., None]
    yy, xx = np.mgrid[0:h, 0:w]
    vx = np.minimum(xx, w - 1 - xx) / (w * 0.5)
    vy = np.minimum(yy, h - 1 - yy) / (h * 0.5)
    vig = np.clip(np.minimum(vx, vy) * 3.5, 0, 1) * 0.4 + 0.6
    arr = arr * vig[..., None]
    out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")

    out_path = ROOT / "public" / "maps" / f"{MAP_ID}.png"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out.save(out_path, optimize=True)
    print(f"wrote {out_path.relative_to(ROOT)} ({w}x{h})")


if __name__ == "__main__":
    main()
