#!/usr/bin/env python3
"""Extra Terram — scripts/check-map.py v0.1.1 — does a painted map background line up with its guide? (also runs from the map kit zip)

  python scripts/check-map.py <map-id> <painting.png|jpg> [--out DIR]

Resizes the painting to the delivery size (1536 × 2048 for a 12 × 16 map) and writes, into --out
(default art/guides/checks/):
  <map>-check.png   the painting with the overlay at 55%: trail band in magenta, sockets in gold
  <map>-pads.png    a contact sheet of every pad: 1.5-tile crop with the expected socket ring drawn
and prints a report:
  trail   per path cell, how different the painting is on the centreline from the ground 0.8 tiles
          to each side (a trail that is really there scores high); cells scoring under the threshold
          are listed — those are where the painted trail wandered off the guide or faded out
  trail centring  for straight cells, where the trail's own centre sits versus the guide centreline,
          in pixels; beyond the tolerance (0.15 tile = 19 px at 2×) is a misalignment
  sockets per pad, how different the inside of the expected socket (r = 0.3 tile) is from the ring
          around it (0.4–0.55 tile); low scores mean no socket is painted where the game puts the pad
Numbers are advisory — a painting with a soft, low-contrast trail can score low and still be fine —
but a cell flagged here is the first place to look in <map>-check.png.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
GUIDES = ROOT / "art" / "guides"
if not GUIDES.exists():  # the standalone map kit keeps the guide files at its top level
    GUIDES = ROOT
TRAIL_MIN = 18.0  # median trail-vs-ground difference below this = low-contrast trail (advisory)
SOCKET_MIN = 10.0


def lab_like(rgb: np.ndarray) -> np.ndarray:
    """A cheap perceptual-ish space: luminance plus two chroma axes, all 0..255 scale."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    return np.stack([lum, (r - g) * 0.5 + 128, (b - (r + g) / 2) * 0.5 + 128], axis=-1)


def mean_in_circle(img: np.ndarray, cx: float, cy: float, r: float) -> np.ndarray:
    h, w = img.shape[:2]
    y0, y1 = max(0, int(cy - r)), min(h, int(cy + r) + 1)
    x0, x1 = max(0, int(cx - r)), min(w, int(cx + r) + 1)
    if y1 <= y0 or x1 <= x0:
        return np.zeros(3)
    yy, xx = np.mgrid[y0:y1, x0:x1]
    mask = (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r
    patch = img[y0:y1, x0:x1][mask]
    return patch.mean(axis=0) if len(patch) else np.zeros(3)


def mean_in_ring(img: np.ndarray, cx: float, cy: float, r0: float, r1: float) -> np.ndarray:
    h, w = img.shape[:2]
    y0, y1 = max(0, int(cy - r1)), min(h, int(cy + r1) + 1)
    x0, x1 = max(0, int(cx - r1)), min(w, int(cx + r1) + 1)
    if y1 <= y0 or x1 <= x0:
        return np.zeros(3)
    yy, xx = np.mgrid[y0:y1, x0:x1]
    d2 = (xx - cx) ** 2 + (yy - cy) ** 2
    mask = (d2 >= r0 * r0) & (d2 <= r1 * r1)
    patch = img[y0:y1, x0:x1][mask]
    return patch.mean(axis=0) if len(patch) else np.zeros(3)


def dist(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.sqrt(((a - b) ** 2).sum()))


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 2:
        raise SystemExit(__doc__)
    map_id, painting = args[0], Path(args[1])
    out_dir = Path(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv else GUIDES / "checks"
    out_dir.mkdir(parents=True, exist_ok=True)
    layout = json.loads((GUIDES / f"{map_id}-layout.json").read_text())
    W, H = layout["deliver_size_2x"]
    tile = layout["tile_px_2x"]
    src = Image.open(painting).convert("RGB")
    if src.size != (W, H):
        print(f"note: painting is {src.size[0]}x{src.size[1]}, resized to {W}x{H} for the check")
        src = src.resize((W, H), Image.LANCZOS)
    img = lab_like(np.asarray(src, dtype=np.float32))

    # --- trail presence and centring (versus maps: every lane / every way to a base; shared cells once)
    routes = layout.get("routes_in_walking_order") or [layout["path_cells_in_walking_order"]]
    weak = []
    offsets = []
    scores = []
    checked = set()
    for cells, i, cell in ((r, i, c) for r in routes for i, c in enumerate(r)):
        if tuple(cell["cell"]) in checked:
            continue
        checked.add(tuple(cell["cell"]))
        cx, cy = cell["centre_2x"]
        prev_c = cells[i - 1]["cell"] if i > 0 else None
        next_c = cells[i + 1]["cell"] if i + 1 < len(cells) else None
        # direction of travel through this cell
        if prev_c and next_c:
            dx, dy = next_c[0] - prev_c[0], next_c[1] - prev_c[1]
        elif next_c:
            dx, dy = next_c[0] - cell["cell"][0], next_c[1] - cell["cell"][1]
        else:
            dx, dy = cell["cell"][0] - prev_c[0], cell["cell"][1] - prev_c[1]
        if dx == 0 and dy == 0:
            continue
        # centring is only measured on long straights: two cells either side in the same line, so a
        # corner's inside never masquerades as a drifted trail
        def in_line(a, b, c):
            return a and b and c and (a[0] - b[0] == b[0] - c[0]) and (a[1] - b[1] == b[1] - c[1])
        prev2 = cells[i - 2]["cell"] if i > 1 else None
        next2 = cells[i + 2]["cell"] if i + 2 < len(cells) else None
        straight = in_line(prev_c, cell["cell"], next_c) and in_line(prev2, prev_c, cell["cell"]) and in_line(cell["cell"], next_c, next2)
        # perpendicular unit vector
        px, py = (-dy, dx)
        n = (px * px + py * py) ** 0.5
        px, py = px / n, py / n
        centre = mean_in_circle(img, cx, cy, tile * 0.18)
        side_a = mean_in_circle(img, cx + px * tile * 0.8, cy + py * tile * 0.8, tile * 0.18)
        side_b = mean_in_circle(img, cx - px * tile * 0.8, cy - py * tile * 0.8, tile * 0.18)
        score = min(dist(centre, side_a), dist(centre, side_b))
        scores.append((cell["label"], score))
        if straight and score >= 6:
            # the painted band: offsets whose colour stays close to the centreline sample (closer than
            # half-way to the ground); its midpoint is where the trail really runs
            ground_d = score
            inside = []
            for off in range(-int(tile * 0.7), int(tile * 0.7) + 1, 4):
                smp = mean_in_circle(img, cx + px * off, cy + py * off, tile * 0.1)
                if dist(smp, centre) < 0.5 * ground_d:
                    inside.append(off)
            # keep the run that contains 0
            run = [0]
            for off in range(4, int(tile * 0.7) + 1, 4):
                if off in inside:
                    run.append(off)
                else:
                    break
            for off in range(-4, -int(tile * 0.7) - 1, -4):
                if off in inside:
                    run.append(off)
                else:
                    break
            width = (max(run) - min(run)) / tile
            if width >= 0.3:  # a textured trail may not give a clean band; then centring is not measurable here
                offsets.append((cell["label"], (min(run) + max(run)) // 2, width))
    # --- sockets
    socket_r = layout["socket"]["radius_px_2x"]
    missing = []
    socket_scores = []
    for pad in layout["pads"]:
        cx, cy = pad["centre_2x"]
        inside = mean_in_circle(img, cx, cy, socket_r)
        ring = mean_in_ring(img, cx, cy, tile * 0.4, tile * 0.55)
        s = dist(inside, ring)
        socket_scores.append(s)
        if s < SOCKET_MIN:
            missing.append((pad["label"], round(s, 1)))

    # --- pictures
    overlay = Image.open(GUIDES / f"{map_id}-overlay@2x.png").convert("RGBA")
    check = src.convert("RGBA")
    faded = overlay.copy()
    faded.putalpha(faded.getchannel("A").point(lambda a: int(a * 0.55)))
    check.alpha_composite(faded)
    check.convert("RGB").save(out_dir / f"{map_id}-check.png", optimize=True)
    crop = int(tile * 1.5)
    per_row = 6
    rows_n = (len(layout["pads"]) + per_row - 1) // per_row
    sheet = Image.new("RGB", (per_row * crop, rows_n * crop), (10, 10, 10))
    for i, pad in enumerate(layout["pads"]):
        cx, cy = pad["centre_2x"]
        patch = src.crop((int(cx - crop / 2), int(cy - crop / 2), int(cx + crop / 2), int(cy + crop / 2)))
        d = ImageDraw.Draw(patch)
        d.ellipse([crop / 2 - socket_r, crop / 2 - socket_r, crop / 2 + socket_r, crop / 2 + socket_r], outline=(232, 195, 58), width=3)
        d.text((4, 4), pad["label"], fill=(255, 255, 255))
        sheet.paste(patch, ((i % per_row) * crop, (i // per_row) * crop))
    sheet.save(out_dir / f"{map_id}-pads.png", optimize=True)

    # --- report
    tol = layout["trail"]["centreline_tolerance_px_2x"]
    values = [v for _, v in scores]
    median = float(np.median(values))
    weak_limit = max(6.0, min(0.35 * median, 18.0))
    weak = [(l, round(v, 1)) for l, v in scores if v < weak_limit]
    off_cells = [(l, o) for l, o, _ in offsets if abs(o) > tol]
    contrast = "good" if median >= TRAIL_MIN else "LOW — make sure the trail reads against the ground"
    print(f"{map_id}: trail contrast median {median:.1f} ({contrast}); {len(weak)} of {len(scores)} cells weak (under {weak_limit:.1f})" + (f": {weak}" if weak else ""))
    print(f"  trail centring: {len(off_cells)} of {len(offsets)} long-straight cells more than {tol} px off the guide" + (f": {off_cells}" if off_cells else "") + (" (no measurable band on the straights; judge the check image)" if not offsets else ""))
    print(f"  sockets: mean {np.mean(socket_scores):.1f} (threshold {SOCKET_MIN}); {len(missing)} of {len(layout['pads'])} pads without a visible socket" + (f": {missing}" if missing else ""))
    verdict = "ALIGNED (by the numbers; confirm in the check image)" if not weak and not off_cells and not missing else "NEEDS A LOOK"
    print(f"  verdict: {verdict}")
    print(f"  wrote {out_dir / (map_id + '-check.png')} and {out_dir / (map_id + '-pads.png')}")


if __name__ == "__main__":
    main()
