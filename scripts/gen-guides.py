#!/usr/bin/env python3
"""Extra Terram — scripts/gen-guides.py v0.2.0 — the map alignment kit for painted backgrounds

For every map in src/content/maps, writes into art/guides/:
  <map>-guide.png         64 px per tile (768 × 1024): trail, pads, spawn, exit on grey — the classic guide
  <map>-guide@2x.png      128 px per tile (1536 × 2048), the delivery resolution, with column letters
                          and row numbers in the margin strip of each edge tile
  <map>-overlay@2x.png    transparent: trail centreline and edges, pad rings, spawn/exit, faint grid —
                          composite it over a painting at 50% to see whether it lines up
  <map>-template@2x.png   the current generated background at 2× with nothing drawn on it: the
                          image-to-image starting point whose trail and sockets are already right
  <map>-layout.json       the numbers: tile size, path cells in walking order, pad cells, spawn, exit,
                          all with pixel centres at 2×, plus the tolerances the check script applies
A painting is checked with scripts/check-map.py. See art/guides/MAP_KIT_README.md.
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw

TILE = 64
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "art" / "guides"
COLS_LETTERS = "ABCDEFGHIJKLMNOP"


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


def path_cells(m):
    """Spawn → exit cell lists by the same BFS the engine runs (one per lane or King base on a versus
    map), plus the kind of every cell."""
    grid, legend, cols, rows = m["grid"], m["legend"], m["cols"], m["rows"]
    kinds = {(c, r): legend[grid[r][c]] for r in range(rows) for c in range(cols)}
    zone = {(c, r): (int(m["zones"][r][c]) if m.get("zones") and m["zones"][r][c].isdigit() else -1) for r in range(rows) for c in range(cols)}
    spawns = [k for k, v in kinds.items() if v == "spawn"]
    exits = [k for k, v in kinds.items() if v == "exit"]
    if not m.get("mode"):
        return [bfs(kinds, spawns[0], exits[0], lambda n: True)], kinds
    paths = []
    for s in range(m["slots"]):
        goal = next(k for k in exits if zone[k] == s)
        if m["mode"] == "lanes":
            start = next(k for k in spawns if zone[k] == s)
            paths.append(bfs(kinds, start, goal, lambda n, s=s: zone[n] == s))
        else:
            start = next(k for k in spawns if zone[k] == -1)
            paths.append(bfs(kinds, start, goal, lambda n, s=s: zone[n] in (-1, s)))
    return paths, kinds


def centre(cell, tile):
    c, r = cell
    return (c * tile + tile / 2, r * tile + tile / 2)


def draw_guide(m, paths, kinds, tile, labels):
    cols, rows = m["cols"], m["rows"]
    w, h = cols * tile, rows * tile
    img = Image.new("RGB", (w, h), (112, 112, 112))
    d = ImageDraw.Draw(img)
    for x in range(0, w, tile):
        d.line([(x, 0), (x, h)], fill=(122, 122, 122))
    for y in range(0, h, tile):
        d.line([(0, y), (w, y)], fill=(122, 122, 122))
    for path in paths:
        points = [centre(p, tile) for p in path]
        d.line(points, fill=(120, 84, 48), width=int(tile * 0.8), joint="curve")
        for x, y in points:
            d.ellipse([x - tile * 0.4, y - tile * 0.4, x + tile * 0.4, y + tile * 0.4], fill=(120, 84, 48))
    for cell, kind in kinds.items():
        cx, cy = centre(cell, tile)
        if kind == "pad":
            d.ellipse([cx - tile * 0.35, cy - tile * 0.35, cx + tile * 0.35, cy + tile * 0.35], outline=(232, 195, 58), width=max(3, tile // 10))
        if kind == "spawn":
            d.ellipse([cx - tile * 0.45, cy - tile * 0.45, cx + tile * 0.45, cy + tile * 0.45], fill=(255, 120, 30))
        if kind == "exit":
            d.ellipse([cx - tile * 0.45, cy - tile * 0.45, cx + tile * 0.45, cy + tile * 0.45], fill=(79, 216, 232))
    if labels:
        for c in range(cols):
            d.text((c * tile + 4, 2), COLS_LETTERS[c], fill=(30, 30, 30))
            d.text((c * tile + 4, h - 14), COLS_LETTERS[c], fill=(30, 30, 30))
        for r in range(rows):
            d.text((2, r * tile + 4), str(r), fill=(30, 30, 30))
            d.text((w - 14, r * tile + 4), str(r), fill=(30, 30, 30))
    d.text((8, 18 if labels else 8), f"{m['id']} · {m['name']} · {cols}x{rows} tiles @ {tile}px · world {m['world']}", fill=(20, 20, 20))
    return img


def draw_overlay(m, paths, kinds, tile):
    cols, rows = m["cols"], m["rows"]
    w, h = cols * tile, rows * tile
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for x in range(0, w + 1, tile):
        d.line([(x, 0), (x, h)], fill=(255, 255, 255, 40))
    for y in range(0, h + 1, tile):
        d.line([(0, y), (w, y)], fill=(255, 255, 255, 40))
    # trail edges: the band the painted path must cover (±0.5 tile), as an outline
    edge = Image.new("L", (w, h), 0)
    ed = ImageDraw.Draw(edge)
    inner = Image.new("L", (w, h), 0)
    idr = ImageDraw.Draw(inner)
    for path in paths:
        points = [centre(p, tile) for p in path]
        ed.line(points, fill=255, width=tile, joint="curve")
        for x, y in points:
            ed.ellipse([x - tile / 2, y - tile / 2, x + tile / 2, y + tile / 2], fill=255)
        idr.line(points, fill=255, width=tile - 6, joint="curve")
        for x, y in points:
            idr.ellipse([x - tile / 2 + 3, y - tile / 2 + 3, x + tile / 2 - 3, y + tile / 2 - 3], fill=255)
    ring = Image.eval(Image.composite(Image.new("L", (w, h), 0), edge, inner), lambda v: v)
    img.paste(Image.new("RGBA", (w, h), (255, 0, 255, 170)), (0, 0), ring)
    for path in paths:
        d.line([centre(p, tile) for p in path], fill=(255, 0, 255, 220), width=max(2, tile // 32), joint="curve")
    for cell, kind in kinds.items():
        cx, cy = centre(cell, tile)
        if kind == "pad":
            d.ellipse([cx - tile * 0.3, cy - tile * 0.3, cx + tile * 0.3, cy + tile * 0.3], outline=(232, 195, 58, 230), width=max(2, tile // 32))
            d.line([(cx - 6, cy), (cx + 6, cy)], fill=(232, 195, 58, 230), width=2)
            d.line([(cx, cy - 6), (cx, cy + 6)], fill=(232, 195, 58, 230), width=2)
        if kind == "spawn":
            d.ellipse([cx - tile * 0.4, cy - tile * 0.4, cx + tile * 0.4, cy + tile * 0.4], outline=(255, 120, 30, 230), width=4)
            d.text((cx - 4, cy - 6), "S", fill=(255, 120, 30, 255))
        if kind == "exit":
            d.ellipse([cx - tile * 0.4, cy - tile * 0.4, cx + tile * 0.4, cy + tile * 0.4], outline=(79, 216, 232, 230), width=4)
            d.text((cx - 4, cy - 6), "E", fill=(79, 216, 232, 255))
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for map_path in sorted((ROOT / "src" / "content" / "maps").glob("*.json")):
        m = json.loads(map_path.read_text())
        cols, rows = m["cols"], m["rows"]
        paths, kinds = path_cells(m)
        path = paths[0]
        t2 = TILE * 2
        draw_guide(m, paths, kinds, TILE, labels=False).save(OUT / f"{m['id']}-guide.png", optimize=True)
        draw_guide(m, paths, kinds, t2, labels=True).save(OUT / f"{m['id']}-guide@2x.png", optimize=True)
        draw_overlay(m, paths, kinds, t2).save(OUT / f"{m['id']}-overlay@2x.png", optimize=True)
        bg = ROOT / "public" / m["background"].lstrip("/")
        if bg.exists():
            tpl = Image.open(bg).convert("RGB").resize((cols * t2, rows * t2), Image.LANCZOS)
            if bg.suffix == ".jpg":
                tpl.save(OUT / f"{m['id']}-template@2x.jpg", quality=92, optimize=True)  # JPEG backgrounds keep JPEG templates (a tenth of the size)
            else:
                tpl.save(OUT / f"{m['id']}-template@2x.png", optimize=True)
        pads = [cell for cell, kind in kinds.items() if kind == "pad"]
        pads.sort(key=lambda c: (c[1], c[0]))
        spawn = next(c for c, k in kinds.items() if k == "spawn")
        exit_ = next(c for c, k in kinds.items() if k == "exit")
        cell_list = lambda p: [{"cell": [c, r], "label": f"{COLS_LETTERS[c]}{r}", "centre_2x": list(centre((c, r), t2))} for c, r in p]
        layout = {
            "map": m["id"],
            "name": m["name"],
            "world": m["world"],
            "difficulty": m["difficulty"],
            "cols": cols,
            "rows": rows,
            "tile_px_1x": TILE,
            "tile_px_2x": t2,
            "deliver_size_2x": [cols * t2, rows * t2],
            "coordinates": "cell = [col, row] from the top-left, col 0..11 = A..L; centre_2x = pixel centre of that cell in the 1536 x 2048 delivery",
            "path_cells_in_walking_order": [{"cell": [c, r], "label": f"{COLS_LETTERS[c]}{r}", "centre_2x": list(centre((c, r), t2))} for c, r in path],
            "trail": {"width_tiles": 0.9, "centreline_tolerance_tiles": 0.15, "centreline_tolerance_px_2x": round(0.15 * t2)},
            "pads": [{"cell": [c, r], "label": f"{COLS_LETTERS[c]}{r}", "centre_2x": list(centre((c, r), t2))} for c, r in pads],
            "socket": {"radius_tiles": 0.3, "radius_px_2x": round(0.3 * t2), "centre_tolerance_tiles": 0.1, "centre_tolerance_px_2x": round(0.1 * t2)},
            "spawn": {"cell": list(spawn), "label": f"{COLS_LETTERS[spawn[0]]}{spawn[1]}", "centre_2x": list(centre(spawn, t2))},
            "exit": {"cell": list(exit_), "label": f"{COLS_LETTERS[exit_[0]]}{exit_[1]}", "centre_2x": list(centre(exit_, t2))},
        }
        if m.get("mode"):
            # versus maps: every lane (or every way to a King base), each from its spawn to its exit
            layout["mode"] = m["mode"]
            layout["routes_in_walking_order"] = [cell_list(p) for p in paths]
            layout["zones"] = m["zones"]
        (OUT / f"{m['id']}-layout.json").write_text(json.dumps(layout, indent=2) + "\n")
        print(f"wrote {m['id']}: guide, guide@2x, overlay@2x, template@2x, layout.json ({len(path)} path cells, {len(pads)} pads)")


if __name__ == "__main__":
    main()
