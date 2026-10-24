#!/usr/bin/env python3
"""Extra Terram — scripts/gen-guides.py v0.1.0 — layout guides for painting map backgrounds

For every map in src/content/maps, writes art/guides/<map>-guide.png: a flat 64 px-per-tile image
with the creeps' trail in brown, each build pad as a gold ring, the spawn in orange and the exit in
cyan, on a mid-grey ground. Painters (or an image generator with the guide as a low-strength
reference) keep the trail and pads exactly where the game needs them. See the Art Round 2 handoff.
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw

TILE = 64
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "art" / "guides"


def path_points(grid, legend, cols, rows):
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
    OUT.mkdir(parents=True, exist_ok=True)
    for map_path in sorted((ROOT / "src" / "content" / "maps").glob("*.json")):
        m = json.loads(map_path.read_text())
        cols, rows = m["cols"], m["rows"]
        w, h = cols * TILE, rows * TILE
        points, kinds = path_points(m["grid"], m["legend"], cols, rows)
        img = Image.new("RGB", (w, h), (112, 112, 112))
        d = ImageDraw.Draw(img)
        # faint tile grid, for alignment only
        for x in range(0, w, TILE):
            d.line([(x, 0), (x, h)], fill=(122, 122, 122))
        for y in range(0, h, TILE):
            d.line([(0, y), (w, y)], fill=(122, 122, 122))
        d.line(points, fill=(120, 84, 48), width=int(TILE * 0.8), joint="curve")
        for x, y in points:
            d.ellipse([x - TILE * 0.4, y - TILE * 0.4, x + TILE * 0.4, y + TILE * 0.4], fill=(120, 84, 48))
        for (c, r), kind in kinds.items():
            cx, cy = c * TILE + TILE / 2, r * TILE + TILE / 2
            if kind == "pad":
                d.ellipse([cx - TILE * 0.35, cy - TILE * 0.35, cx + TILE * 0.35, cy + TILE * 0.35], outline=(232, 195, 58), width=6)
            if kind == "spawn":
                d.ellipse([cx - TILE * 0.45, cy - TILE * 0.45, cx + TILE * 0.45, cy + TILE * 0.45], fill=(255, 120, 30))
            if kind == "exit":
                d.ellipse([cx - TILE * 0.45, cy - TILE * 0.45, cx + TILE * 0.45, cy + TILE * 0.45], fill=(79, 216, 232))
        d.text((8, 8), f"{m['id']} · {m['name']} · {cols}x{rows} tiles @ {TILE}px · world {m['world']}", fill=(20, 20, 20))
        out = OUT / f"{m['id']}-guide.png"
        img.save(out, optimize=True)
        print(f"wrote {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
