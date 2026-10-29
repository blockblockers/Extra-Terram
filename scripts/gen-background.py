#!/usr/bin/env python3
"""Extra Terram — scripts/gen-background.py v0.5.0 — skips maps that have a real painting (listed in art/maps/painted.json)

Paints the home-world background for a map from its JSON tile grid. Tuned to the art pack's
Rootkin look: saturated moss and leaf greens with teal shadow, a warm bark-brown trail with root
edges and pale stepping stones, glowing sap-gold rimmed stumps on the build pads, a gold gate at
the spawn and a cyan-green grove heart at the exit, bioluminescent motes and canopy light.

The grid is a data structure, not a look: nothing here draws tile squares. The engine positions
everything on cells; the renderer only lays sprites over this image.

Versus maps (Lanes, King of the Maze) get every route painted, a low ridge between lanes, and a
stronghold at each King base. Their files are JPEGs (the map's `background` says which).

Usage:  python scripts/gen-background.py [map-id ...] [--force]   (default: every map in src/content/maps)
Output: public/maps/<map-id>.png|jpg at 64 px per tile. The map's `world` picks the palette:
        rootkin forest moon, assembly scrap plains, chitin hive tunnels, lumenari crystal fields.
        Maps listed in art/maps/painted.json have their real painting in public/maps and are skipped;
        --force paints the placeholder over it anyway (it does not touch the list).
Needs:  numpy, pillow
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

TILE = 64
ROOT = Path(__file__).resolve().parent.parent
SEED = 11  # deterministic art: re-running produces the same file

rng = np.random.default_rng(SEED)


def C(r, g, b):
    return np.array([r, g, b], dtype=np.float32)


# One palette per home world, from the art pack's faction sheets.
WORLDS = {
    "rootkin": dict(deep=C(8, 34, 30), moss=C(63, 143, 58), leaf=C(127, 211, 107), teal=C(14, 70, 62),
                    bark=C(107, 74, 43), bark_dark=C(58, 38, 22), stone=C(150, 128, 96),
                    pad=((78, 54, 30), (118, 84, 48), (232, 195, 58)), pad_core=(240, 210, 90), tuft=(96, 170, 80),
                    spawn=((70, 34, 18), (232, 195, 58), (255, 240, 170)), exit=((40, 150, 110), (140, 240, 190), (240, 255, 240)),
                    mote=((150, 245, 215), (232, 215, 110)), leaves=(80, 130, 170, 215, 70, 110), glow=(232, 195, 58, 60), vig=0.4),
    "assembly": dict(deep=C(14, 15, 17), moss=C(58, 60, 64), leaf=C(110, 106, 96), teal=C(70, 48, 30),
                     bark=C(122, 116, 104), bark_dark=C(76, 72, 64), stone=C(168, 164, 154),
                     pad=((40, 42, 46), (96, 100, 106), (232, 195, 58)), pad_core=(255, 200, 70), tuft=(196, 122, 30),
                     spawn=((60, 24, 10), (255, 120, 30), (255, 220, 160)), exit=((20, 60, 90), (90, 190, 240), (230, 250, 255)),
                     mote=((255, 190, 80), (120, 125, 130)), leaves=(150, 190, 100, 130, 30, 60), glow=(232, 195, 58, 45), vig=0.45),
    "chitin": dict(deep=C(26, 10, 40), moss=C(80, 40, 120), leaf=C(138, 79, 201), teal=C(50, 20, 70),
                   bark=C(120, 86, 40), bark_dark=C(60, 38, 18), stone=C(190, 140, 50),
                   pad=((60, 30, 90), (110, 60, 160), (159, 232, 74)), pad_core=(180, 250, 100), tuft=(159, 232, 74),
                   spawn=((40, 10, 60), (159, 232, 74), (230, 255, 190)), exit=((90, 40, 140), (200, 140, 255), (250, 230, 255)),
                   mote=((180, 250, 120), (230, 180, 60)), leaves=(120, 170, 60, 110, 160, 220), glow=(159, 232, 74, 50), vig=0.5),
    "lumenari": dict(deep=C(10, 14, 40), moss=C(27, 42, 107), leaf=C(79, 216, 232), teal=C(18, 24, 70),
                     bark=C(120, 200, 230), bark_dark=C(60, 120, 170), stone=C(230, 250, 255),
                     pad=((40, 60, 120), (200, 230, 245), (79, 216, 232)), pad_core=(255, 255, 255), tuft=(168, 241, 255),
                     spawn=((230, 245, 255), (79, 216, 232), (255, 255, 255)), exit=((20, 40, 110), (120, 230, 255), (255, 255, 255)),
                     mote=((168, 241, 255), (255, 255, 255)), leaves=(120, 200, 200, 240, 220, 255), glow=(79, 216, 232, 55), vig=0.35),
}



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


def bfs(kinds, start, goal, allowed):
    prev = {start: None}
    queue = [start]
    while queue:
        cur = queue.pop(0)
        if cur == goal:
            break
        c, r = cur
        for n in ((c, r - 1), (c + 1, r), (c, r + 1), (c - 1, r)):
            if n in kinds and n not in prev and kinds[n] in ("path", "spawn", "exit") and allowed(n):
                prev[n] = cur
                queue.append(n)
    path = []
    node = goal
    while node is not None:
        path.append(node)
        node = prev[node]
    path.reverse()
    return path


def routes_from_map(m):
    """Same BFS the engine runs (src/engine/map.ts), so the painted trails are the paths creeps walk.
    Returns cell routes (one per lane or fork; one on a solo map), the tile kinds and the zone per cell."""
    grid, legend, cols, rows = m["grid"], m["legend"], m["cols"], m["rows"]
    kinds = {(c, r): legend[grid[r][c]] for r in range(rows) for c in range(cols)}
    zones = {}
    for r in range(rows):
        for c in range(cols):
            ch = m["zones"][r][c] if m.get("zones") else "."
            zones[(c, r)] = int(ch) if ch.isdigit() else -1
    spawns = [k for k, v in kinds.items() if v == "spawn"]
    exits = [k for k, v in kinds.items() if v == "exit"]
    mode = m.get("mode")
    if not mode:
        return [bfs(kinds, spawns[0], exits[0], lambda n: True)], kinds, zones
    routes = []
    for s in range(m["slots"]):
        goal = next(k for k in exits if zones[k] == s)
        if mode == "lanes":
            start = next(k for k in spawns if zones[k] == s)
            allowed = lambda n, s=s: zones[n] == s
        else:
            start = next(k for k in spawns if zones[k] == -1)
            allowed = lambda n, s=s: zones[n] in (-1, s)
        routes.append(bfs(kinds, start, goal, allowed))
    return routes, kinds, zones


def to_px(cells):
    return [(c * TILE + TILE / 2, r * TILE + TILE / 2) for c, r in cells]


def paint(map_id: str):
    global rng
    rng = np.random.default_rng(SEED)
    map_path = ROOT / "src" / "content" / "maps" / f"{map_id}.json"
    m = json.loads(map_path.read_text())
    W = WORLDS[m["world"]]
    DEEP, MOSS, LEAF, TEAL, BARK, BARK_DARK, STONE = W["deep"], W["moss"], W["leaf"], W["teal"], W["bark"], W["bark_dark"], W["stone"]
    cols, rows = m["cols"], m["rows"]
    w, h = cols * TILE, rows * TILE
    routes, kinds, zones = routes_from_map(m)
    polylines = [to_px(cells) for cells in routes]
    # each trail cell once, for the stepping stones (King routes share their trunk)
    segments, seen_seg = [], set()
    for cells in routes:
        for a, b in zip(cells, cells[1:]):
            key = tuple(sorted((a, b)))
            if key not in seen_seg:
                seen_seg.add(key)
                segments.append(key)

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
    for points in polylines:
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
    for (ca, cb) in segments:
        (x0, y0), (x1, y1) = to_px([ca, cb])
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
        p_outer, p_inner, p_rim = W["pad"]
        gd.ellipse([cx - rr * 1.5, cy - rr * 1.3, cx + rr * 1.5, cy + rr * 1.5], fill=W["glow"])
        pd.ellipse([cx - rr - 2, cy - rr + 5, cx + rr + 2, cy + rr + 8], fill=(4, 8, 14, 150))  # shadow
        pd.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(*p_outer, 255))
        pd.ellipse([cx - rr * 0.86, cy - rr * 0.86, cx + rr * 0.86, cy + rr * 0.86], fill=(*p_inner, 255))
        pd.ellipse([cx - rr * 0.86, cy - rr * 0.86, cx + rr * 0.86, cy + rr * 0.86], outline=(*p_rim, 210), width=2)
        for ring in (0.62, 0.4, 0.2):
            pd.ellipse([cx - rr * ring, cy - rr * ring, cx + rr * ring, cy + rr * ring], outline=(*p_outer, 170), width=1)
        pd.ellipse([cx - rr * 0.16, cy - rr * 0.16, cx + rr * 0.16, cy + rr * 0.16], fill=(*W["pad_core"], 230))
        # tufts (moss, rust, resin, frost) on the rim
        for k in range(5):
            a = rng.uniform(0, 6.283)
            tx, ty = cx + np.cos(a) * rr * 0.95, cy + np.sin(a) * rr * 0.75
            pd.ellipse([tx - 4, ty - 3, tx + 4, ty + 3], fill=(*W["tuft"], 220))
    glow = glow.filter(ImageFilter.GaussianBlur(TILE * 0.22))
    img = Image.alpha_composite(img, glow)
    img = Image.alpha_composite(img, pads.filter(ImageFilter.GaussianBlur(0.6)))

    # --- versus: a low ridge between lanes (rock, scrap, chitin or crystal by world)
    if m.get("mode") == "lanes":
        bands = []
        for s in range(m["slots"]):
            rows_s = [r for (c, r), z in zones.items() if z == s]
            bands.append((min(rows_s), max(rows_s)))
        ridge = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        rd = ImageDraw.Draw(ridge)
        for (top0, bot0), (top1, bot1) in zip(bands, bands[1:]):
            y = (bot0 + 1 + top1) / 2 * TILE
            pts = []
            for x in range(0, w + 16, 16):
                pts.append((x, y + float(np.sin(x / 37.0)) * 3 + rng.uniform(-2, 2)))
            dark = tuple(int(v) for v in (BARK_DARK * 0.6))
            light = tuple(int(min(255, v)) for v in (STONE * 0.9))
            rd.line(pts, fill=(*dark, 235), width=15, joint="curve")
            rd.line([(x, yy - 5) for x, yy in pts], fill=(*light, 140), width=3, joint="curve")
            for x, yy in pts[::2]:
                rr = rng.uniform(3, 6)
                rd.ellipse([x - rr, yy - rr, x + rr, yy + rr], fill=(*light, 150))
        img = Image.alpha_composite(img, ridge.filter(ImageFilter.GaussianBlur(1.2)))

    # --- spawn gate (gold, scorched) and grove heart (cyan-green bloom); King bases are strongholds
    marks = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    md = ImageDraw.Draw(marks)
    king = m.get("mode") == "king"
    for (c, r), kind in kinds.items():
        cx, cy = c * TILE + TILE / 2, r * TILE + TILE / 2
        if kind == "exit" and king:
            # a walled ring with a bright heart: the base this fork defends
            e0, e1, e2 = W["exit"]
            md.ellipse([cx - TILE * 0.62, cy - TILE * 0.62, cx + TILE * 0.62, cy + TILE * 0.62], fill=(*BARK_DARK.astype(int), 235))
            md.ellipse([cx - TILE * 0.52, cy - TILE * 0.52, cx + TILE * 0.52, cy + TILE * 0.52], outline=(*STONE.astype(int), 240), width=5)
            for k in range(8):
                a = k * 6.283 / 8
                bx, by = cx + np.cos(a) * TILE * 0.52, cy + np.sin(a) * TILE * 0.52
                md.rectangle([bx - 4, by - 4, bx + 4, by + 4], fill=(*STONE.astype(int), 255))
            md.ellipse([cx - TILE * 0.3, cy - TILE * 0.3, cx + TILE * 0.3, cy + TILE * 0.3], fill=(*e1, 230))
            md.ellipse([cx - TILE * 0.13, cy - TILE * 0.13, cx + TILE * 0.13, cy + TILE * 0.13], fill=(*e2, 250))
            continue
        if kind == "spawn":
            s0, s1, s2 = W["spawn"]
            md.ellipse([cx - TILE * 0.55, cy - TILE * 0.55, cx + TILE * 0.55, cy + TILE * 0.55], fill=(*s0, 220))
            md.ellipse([cx - TILE * 0.34, cy - TILE * 0.34, cx + TILE * 0.34, cy + TILE * 0.34], fill=(*s1, 170))
            md.ellipse([cx - TILE * 0.16, cy - TILE * 0.16, cx + TILE * 0.16, cy + TILE * 0.16], fill=(*s2, 230))
        if kind == "exit":
            e0, e1, e2 = W["exit"]
            md.ellipse([cx - TILE * 0.6, cy - TILE * 0.6, cx + TILE * 0.6, cy + TILE * 0.6], fill=(*e0, 150))
            md.ellipse([cx - TILE * 0.36, cy - TILE * 0.36, cx + TILE * 0.36, cy + TILE * 0.36], fill=(*e1, 210))
            md.ellipse([cx - TILE * 0.14, cy - TILE * 0.14, cx + TILE * 0.14, cy + TILE * 0.14], fill=(*e2, 240))
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
            lr0, lr1, lg0, lg1, lb0, lb1 = W["leaves"]
            col = (int(rng.uniform(lr0, lr1)), int(rng.uniform(lg0, lg1)), int(rng.uniform(lb0, lb1)), 200)
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
        m0, m1 = W["mote"]
        col = (*m0, int(rng.uniform(110, 220))) if rng.random() < 0.65 else (*m1, 170)
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
    vig = np.clip(np.minimum(vx, vy) * 3.5, 0, 1) * W["vig"] + (1 - W["vig"])
    arr = arr * vig[..., None]
    out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")

    out_path = ROOT / "public" / m["background"].lstrip("/")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.suffix == ".jpg":
        out.save(out_path, quality=86, optimize=True, progressive=True)
    else:
        out.save(out_path, optimize=True)
    print(f"wrote {out_path.relative_to(ROOT)} ({w}x{h}, {m['world']})")


def painted_maps() -> set:
    """Map ids whose background is a delivered painting (art/maps/painted.json), not a placeholder."""
    f = ROOT / "art" / "maps" / "painted.json"
    if not f.exists():
        return set()
    return set(json.loads(f.read_text()).get("maps", {}))


def main():
    force = "--force" in sys.argv
    ids = [a for a in sys.argv[1:] if not a.startswith("--")] or sorted(p.stem for p in (ROOT / "src" / "content" / "maps").glob("*.json"))
    painted = painted_maps()
    for map_id in ids:
        if map_id in painted and not force:
            print(f"skip {map_id}: painted background (art/maps/painted.json); --force to paint the placeholder over it")
            continue
        paint(map_id)


if __name__ == "__main__":
    main()
