#!/usr/bin/env python3
"""Extra Terram — scripts/check-art.py v0.1.2 — measures the art against the specs in the art review (towers, creeps, maps, strips); numpy + Pillow only

  python scripts/check-art.py [towers|creeps|maps|strips|all] [--drop <folder>] [--race <race>] [--strict]

  --drop    a delivery laid out like the repo (public/sprites/..., public/maps/...): its files are measured
            in place of the game's, everything else comes from the game
  --race    only one race's towers and creeps
  --strict  exit with status 1 when anything fails (for CI); otherwise the report is advisory

What is measured (the numbers behind "Art Review, Enhancements and Design Specs", 2026-10-27):
  towers  per family: outline area at T2 / T3A / T3B against T1 (spec >= 1.15 / 1.35 / 1.35), the T3A-T3B
          overlap (<= 0.75), the closest other family of the race at T1 (<= 0.70), the flat top of a head-less
          body (one that ends within 24 px above its turret's pivot: <= 52 px, the widest socket the turret's
          drum covers; a turret mounted on the front of a taller body is not measured), the contour (median L* of the outermost
          pixel ring of every still <= 25: a dark contour with a lit rim along a third of the outline passes)
          and stray pixels (alpha >= 8 more than 4 px from the silhouette)
  creeps  visible area at the drawn size per class (rusher 0.25-0.35, workhorse 0.45-0.6, tank 0.7-0.9,
          mini-boss 1.4-1.8 tiles^2; the share of the canvas that is opaque is printed alongside), the contour,
          stray pixels, and the median L* step across the outline on every painted map's trail (>= 20)
  maps    painted maps (art/maps/painted.json): trail L* 45-65 and C* 8-30; ground within a tile of the trail
          L* 25-38 and C* 20-35
  strips  walk: the mid-cycle outline overlaps frame 0 by 0.75-0.9; idle: some frame overlaps by 0.85-0.95;
          every loop's last-to-first change is no bigger than 1.15x its average step; fire: some frame's
          outline overlaps frame 0 by 0.95 or less (recoil, squash), first and last frames match the still;
          die: the last frame is empty
Outline overlap is intersection over union of the alpha > 0.5 masks; L* and C* are CIE (D65) from sRGB.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
GROW = {'t1': 1.0, 't2': 1.05, 't3a': 1.14, 't3b': 1.14}
PIVOT_Y = {'t1': 99, 't2': 102, 't3a': 107, 't3b': 107}
STATES = ['t1', 't2', 't3a', 't3b']
TILE2X = 128  # map art px per tile


# ---------------------------------------------------------------- helpers

def args():
    a = sys.argv[1:]
    takes_value = ('--drop', '--race')
    opt = lambda k: a[a.index(k) + 1] if k in a and a.index(k) + 1 < len(a) else None
    words = [x for i, x in enumerate(a) if not x.startswith('--') and (i == 0 or a[i - 1] not in takes_value)]
    return (words[0] if words else 'all'), (Path(opt('--drop')) if opt('--drop') else None), opt('--race'), '--strict' in a


WHAT, DROP, RACE, STRICT = args()


def find(rel: str) -> Path:
    if DROP is not None and (DROP / rel).exists():
        return DROP / rel
    return ROOT / rel


def exists(rel: str) -> bool:
    return (DROP is not None and (DROP / rel).exists()) or (ROOT / rel).exists()


def load_json(rel: str):
    return json.loads((ROOT / rel).read_text())


def rgba(rel: str) -> np.ndarray:
    return np.asarray(Image.open(find(rel)).convert('RGBA')).astype(np.float32) / 255


def lab(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """CIE L* and C* (D65) of an sRGB array in 0..1."""
    c = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    x = (c[..., 0] * 0.4124 + c[..., 1] * 0.3576 + c[..., 2] * 0.1805) / 0.95047
    y = c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722
    z = (c[..., 0] * 0.0193 + c[..., 1] * 0.1192 + c[..., 2] * 0.9505) / 1.08883
    f = lambda t: np.where(t > 216 / 24389, np.cbrt(t), (24389 / 27 * t + 16) / 116)
    fx, fy, fz = f(x), f(y), f(z)
    L = 116 * fy - 16
    a, b = 500 * (fx - fy), 200 * (fy - fz)
    return L, np.hypot(a, b)


def erode(m: np.ndarray, n: int) -> np.ndarray:
    for _ in range(n):
        p = np.pad(m, 1)
        m = p[1:-1, 1:-1] & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    return m


def dilate(m: np.ndarray, n: int) -> np.ndarray:
    for _ in range(n):
        p = np.pad(m, 1)
        m = p[1:-1, 1:-1] | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    return m


def maxfilter(a: np.ndarray, size: int) -> np.ndarray:
    r = size // 2
    p = np.pad(a, r, constant_values=-1e9)
    out = np.full_like(a, -1e9)
    for dy in range(size):
        for dx in range(size):
            out = np.maximum(out, p[dy:dy + a.shape[0], dx:dx + a.shape[1]])
    return out


def resize(img: np.ndarray, size: int) -> np.ndarray:
    im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), 'RGBA').resize((size, size), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255


def iou(a: np.ndarray, b: np.ndarray) -> float:
    return float((a & b).sum() / max(1, (a | b).sum()))


def contour_l(img: np.ndarray) -> float:
    """Median L* of the outermost pixel ring of the silhouette. A dark contour reads under 25 even with a lit
    rim replacing it along a third of the outline; without one the ring is as light as the body or lighter."""
    solid = img[..., 3] > 0.5
    ring = solid & ~erode(solid, 1)
    if not ring.any():
        return float('nan')
    L, _ = lab(img[..., :3])
    return float(np.median(L[ring]))


def strays(img: np.ndarray) -> int:
    """Pixels with alpha >= 8/255 more than 4 px from the silhouette (specks the art should not carry)."""
    solid = img[..., 3] > 0.5
    return int(((img[..., 3] >= 8 / 255) & ~dilate(solid, 4)).sum())


class Report:
    def __init__(self, title: str):
        self.title = title
        self.lines: list[str] = []
        self.fails = 0
        self.items = 0

    def row(self, name: str, values: str, problems: list[str]):
        self.items += 1
        if problems:
            self.fails += 1
        self.lines.append(f"  {'FAIL' if problems else 'ok  '} {name:28s} {values}" + (f"  <- {'; '.join(problems)}" if problems else ''))

    def show(self):
        print(f"\n{self.title}: {self.items - self.fails} of {self.items} meet the spec")
        print('\n'.join(self.lines))


# ---------------------------------------------------------------- towers

def tower_silhouette(race: str, tid: str, st: str, mounts: dict) -> tuple[np.ndarray, np.ndarray, bool]:
    """(outline on a common board grid, the composed still at 256, has turret)."""
    body = rgba(f'public/sprites/{race}/{tid}/{st}.png')
    comp = Image.fromarray((body * 255).astype(np.uint8), 'RGBA')
    turret_rel = f'public/sprites/{race}/{tid}/turret-{st}.png'
    has_turret = exists(turret_rel)
    if has_turret:
        tw = round(64 / (0.4625 * GROW[st]))
        piv = mounts.get(f'{race}/{tid}', {}).get('pivot', {}).get(st, [128, PIVOT_Y[st]])
        tur = Image.open(find(turret_rel)).convert('RGBA').resize((tw, tw), Image.LANCZOS)
        comp.alpha_composite(tur, (int(piv[0] - tw / 2), int(piv[1] - tw / 2)))
    composed = np.asarray(comp).astype(np.float32) / 255
    g = GROW[st]
    big = Image.new('L', (320, 320), 0)
    sz = round(256 * g)
    big.paste(comp.split()[3].resize((sz, sz), Image.LANCZOS), (int(160 - 128 * g), int(200 - 168 * g)))
    return np.asarray(big) > 128, composed, has_turret


def check_towers():
    rep = Report('Towers (outline growth by tier, branches, families, head-less tops, contour)')
    towers = load_json('src/content/towers.json')
    towers = towers['towers'] if isinstance(towers, dict) else towers
    mounts = json.loads((ROOT / 'art/mounts.json').read_text()) if (ROOT / 'art/mounts.json').exists() else {}
    by_race: dict[str, dict[str, np.ndarray]] = {}
    rows = []
    for t in towers:
        race, tid = t['race'], t['id']
        if RACE and race != RACE:
            continue
        if not all(exists(f'public/sprites/{race}/{tid}/{st}.png') for st in STATES):
            continue
        sil, contour, has_t, flat, stray, headless = {}, [], False, 0, 0, False
        for st in STATES:
            m, composed, has_t = tower_silhouette(race, tid, st, mounts)
            sil[st] = m
            contour.append(contour_l(composed))
            body_img = rgba(f'public/sprites/{race}/{tid}/{st}.png')
            stray += strays(body_img)
            if has_t:
                body = body_img[..., 3] > 0.5
                top = np.nonzero(body.any(1))[0].min()
                piv_y = mounts.get(f'{race}/{tid}', {}).get('pivot', {}).get(st, [128, PIVOT_Y[st]])[1]
                # head-less: the body ends within 24 px above the pivot, so the turret sits on its top; a turret
                # mounted on the front of a taller body (a tree, a trunk) leaves the body's top alone
                if top >= piv_y - 24:
                    headless = True
                    flat = max(flat, int(body[top:top + 3].sum(1).max()))
        by_race.setdefault(race, {})[tid] = sil['t1']
        a1 = sil['t1'].sum()
        rows.append((t, sil, [sil[s].sum() / a1 for s in ('t2', 't3a', 't3b')], iou(sil['t3a'], sil['t3b']), flat if headless else None, float(np.nanmedian(contour)), stray))
    for t, sil, growth, branch, flat, cl, stray in rows:
        fam = by_race[t['race']]
        closest = max(((iou(sil['t1'], m), other) for other, m in fam.items() if other != t['id']), default=(0.0, '-'))
        p = []
        growth = [round(g, 2) for g in growth]
        branch, closest = round(branch, 2), (round(closest[0], 2), closest[1])
        if growth[0] < 1.15: p.append(f'T2 grows {growth[0]:.2f}x (>= 1.15)')
        if min(growth[1:]) < 1.35: p.append(f'T3 grows {min(growth[1:]):.2f}x (>= 1.35)')
        if branch > 0.75: p.append(f'T3A/T3B overlap {branch:.2f} (<= 0.75)')
        if closest[0] > 0.70: p.append(f'alike {closest[1]} at T1 ({closest[0]:.2f})')
        if flat is not None and flat > 52: p.append(f'flat top {flat} px (a socket <= 52)')
        if cl > 25: p.append(f'no dark contour (outer ring L* {cl:.0f}, <= 25)')
        if stray: p.append(f'{stray} stray pixels')
        vals = f"T2/T3A/T3B {growth[0]:.2f}/{growth[1]:.2f}/{growth[2]:.2f}  branches {branch:.2f}  closest {closest[0]:.2f}" + (f"  top {flat}px" if flat is not None else '') + f"  contour L* {cl:.0f}"
        rep.row(f"{t['race']}/{t['id']}", vals, p)
    rep.show()
    return rep


# ---------------------------------------------------------------- maps

def layout(map_id: str) -> dict:
    return load_json(f'art/guides/{map_id}-layout.json')


def routes(lay: dict) -> list:
    return lay.get('routes_in_walking_order', [lay['path_cells_in_walking_order']])


def distance_to_route(lay: dict, shape: tuple[int, int], step: int) -> np.ndarray:
    """Distance (2x px) from each sample point of a grid with the given step to the nearest trail centreline."""
    H, W = shape
    ys, xs = np.mgrid[0:H:step, 0:W:step].astype(np.float32)
    best = np.full(ys.shape, 1e9, np.float32)
    for route in routes(lay):
        pts = [tuple(c['centre_2x']) for c in route]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            dx, dy = x1 - x0, y1 - y0
            L2 = dx * dx + dy * dy or 1.0
            t = np.clip(((xs - x0) * dx + (ys - y0) * dy) / L2, 0, 1)
            best = np.minimum(best, np.hypot(xs - (x0 + t * dx), ys - (y0 + t * dy)))
    return best


def map_image(map_id: str, lay: dict) -> np.ndarray:
    W, H = lay['deliver_size_2x']
    for ext in ('png', 'jpg'):
        rel = f'public/maps/{map_id}.{ext}'
        if exists(rel) and (ext == 'jpg' or DROP is not None):
            im = Image.open(find(rel)).convert('RGB')
            if im.size != (W, H):
                im = im.resize((W, H), Image.LANCZOS)
            return np.asarray(im).astype(np.float32) / 255
    raise FileNotFoundError(map_id)


def painted_maps() -> list[str]:
    """The game's painted maps, plus any map a --drop delivers that has a guide."""
    p = ROOT / 'art/maps/painted.json'
    maps = list(json.loads(p.read_text())['maps']) if p.exists() else []
    if DROP is not None and (DROP / 'public/maps').exists():
        for f in sorted((DROP / 'public/maps').iterdir()):
            if f.suffix in ('.png', '.jpg') and f.stem not in maps and (ROOT / f'art/guides/{f.stem}-layout.json').exists():
                maps.append(f.stem)
    return maps


def check_maps():
    rep = Report('Maps (trail L* 45-65, C* 8-30; ground within a tile of the trail L* 25-38, C* 20-35)')
    for m in painted_maps():
        lay = layout(m)
        img = map_image(m, lay)
        step = 2
        sub = img[::step, ::step]
        L, C = lab(sub)
        dist = distance_to_route(lay, img.shape[:2], step)
        ys, xs = np.mgrid[0:img.shape[0]:step, 0:img.shape[1]:step]
        pd = np.full(dist.shape, 1e9, np.float32)
        for p in lay['pads']:
            x, y = p['centre_2x']
            pd = np.minimum(pd, np.hypot(xs - x, ys - y))
        trail = dist <= 0.30 * TILE2X
        ground = (dist >= 0.62 * TILE2X) & (dist <= 1.0 * TILE2X) & (pd > 0.42 * TILE2X)
        tl, tc, gl, gc = L[trail].mean(), C[trail].mean(), L[ground].mean(), C[ground].mean()
        p = []
        if not 45 <= tl <= 65: p.append(f'trail L* {tl:.0f}')
        if not 8 <= tc <= 30: p.append(f'trail C* {tc:.0f}')
        if not 25 <= gl <= 38: p.append(f'ground L* {gl:.0f}')
        if not 20 <= gc <= 35: p.append(f'ground C* {gc:.0f}')
        rep.row(m, f'trail L* {tl:4.1f} C* {tc:4.1f} | ground L* {gl:4.1f} C* {gc:4.1f}', p)
    rep.show()
    return rep


# ---------------------------------------------------------------- creeps

def creep_size_tiles(c: dict) -> float:
    a = c.get('archetype')
    return 2.3 if a == 'boss' else 1.7 if a == 'tank' else min(1.5, max(0.95, c['radius'] * 5.4))


def trail_samples(map_id: str, lay: dict, img_shape) -> list[tuple[float, float]]:
    """Points every half tile along the trail centrelines, at least 0.6 tile from any pad."""
    pads = [p['centre_2x'] for p in lay['pads']]
    out = []
    for route in routes(lay):
        pts = [tuple(c['centre_2x']) for c in route]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            for t in (0.0, 0.5):
                x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
                if min((np.hypot(x - px, y - py) for px, py in pads), default=1e9) > 0.6 * TILE2X:
                    out.append((x, y))
    return out


def edge_step(sprite: np.ndarray, Lmap: np.ndarray, cx: float, cy: float) -> float | None:
    h, w = sprite.shape[:2]
    x0, y0 = int(cx - w / 2), int(cy - h / 2)
    H, W = Lmap.shape
    if x0 < 0 or y0 < 0 or x0 + w > W or y0 + h > H:
        return None
    a = sprite[..., 3]
    solid = a > 0.5
    inner = solid & ~erode(solid, 2)
    outer = dilate(solid, 4) & ~dilate(solid, 1)
    Ls, _ = lab(sprite[..., :3])
    comp = Ls * a + Lmap[y0:y0 + h, x0:x0 + w] * (1 - a)
    peak = maxfilter(np.where(inner, comp, -1.0), 5)
    return float(np.median(np.abs(peak[outer] - comp[outer])))


def check_creeps():
    rep = Report('Creeps (visible area by class, contour, stray pixels, the step across the outline on every painted trail)')
    creeps = load_json('src/content/creeps.json')
    creeps = creeps['creeps'] if isinstance(creeps, dict) else creeps
    target = {'rusher': (0.25, 0.35), 'workhorse': (0.45, 0.6), 'tank': (0.7, 0.9), 'boss': (1.4, 1.8)}
    boards = []
    for m in painted_maps():
        lay = layout(m)
        img = map_image(m, lay)
        boards.append((m, lab(img)[0], trail_samples(m, lay, img.shape)))
    for c in creeps:
        if RACE and c['race'] != RACE:
            continue
        rel = f"public/sprites/{c['race']}/creeps/{c['id']}.png"
        if not exists(rel):
            rel = f"public/sprites/{c['race']}/creeps/{c.get('art', c['id'])}.png"
        if not exists(rel):
            continue
        img = rgba(rel)
        canvas = img.shape[0]
        solid = img[..., 3] > 0.5
        share = solid.mean()
        size = creep_size_tiles(c)
        area = round(float(solid.sum() * (size / canvas) ** 2), 2)
        cl = contour_l(img)
        stray = strays(img)
        boss = c.get('archetype') == 'boss'
        tlo, thi = target.get(c.get('archetype'), (0, 99))
        p = []
        if not tlo <= area <= thi: p.append(f'area {area:.2f} tiles^2 ({tlo}-{thi}; {share * 100:.0f}% of the canvas is opaque)')
        if cl > 25: p.append(f'no dark contour (outer ring L* {cl:.0f}, <= 25)')
        if stray: p.append(f'{stray} stray pixels')
        steps = []
        if not boss:
            spr = resize(img, round(size * TILE2X))
            for m, Lmap, pts in boards:
                vals = [v for v in (edge_step(spr, Lmap, x, y) for x, y in pts[::max(1, len(pts) // 24)]) if v is not None]
                if vals:
                    steps.append((float(np.median(vals)), m))
            weak = [f'{m} {v:.0f}' for v, m in steps if v < 20]
            if weak: p.append('outline step under 20 L* on ' + ', '.join(weak))
        vals = f"{c.get('archetype', '?'):9s} area {area:.2f} tiles^2 ({share * 100:.0f}% opaque)  contour L* {cl:.0f}" + (f"  outline step {min(v for v, _ in steps):.0f}-{max(v for v, _ in steps):.0f}" if steps else '')
        rep.row(f"{c['race']}/{c['id']}", vals, p)
    rep.show()
    return rep


# ---------------------------------------------------------------- strips

def frames(rel: str) -> list[np.ndarray]:
    img = rgba(rel)
    h = img.shape[0]
    n = img.shape[1] // h
    return [img[:, i * h:(i + 1) * h] for i in range(n)]


def change(a: np.ndarray, b: np.ndarray, area: int) -> float:
    da = np.abs(a[..., 3] - b[..., 3]) > 0.25
    dc = (np.abs(a[..., :3] - b[..., :3]).max(-1) > 0.094) & ((a[..., 3] > 0.5) | (b[..., 3] > 0.5))
    return float((da | dc).sum() / max(1, area))


def check_strips():
    rep = Report('Strips (real motion, closed loops, fire strips that start and end on the still, deaths that end empty)')
    rels = sorted({str(p.relative_to(ROOT)) for p in (ROOT / 'public/sprites').rglob('*-*.png')} |
                  ({str(p.relative_to(DROP)) for p in (DROP / 'public/sprites').rglob('*-*.png')} if DROP is not None and (DROP / 'public/sprites').exists() else set()))
    for rel in rels:
        name = Path(rel).name
        kind = name.rsplit('-', 1)[-1][:-4]
        if kind not in ('idle', 'fire', 'walk', 'die') or '/fx/' in rel:
            continue
        if RACE and f'/{RACE}/' not in rel:
            continue
        fr = frames(rel)
        if len(fr) < 2:
            continue
        masks = [f[..., 3] > 0.5 for f in fr]
        area = int(np.logical_or.reduce(masks).sum())
        overlaps = [round(iou(masks[0], m), 2) for m in masks[1:]]
        steps = [change(fr[i], fr[i + 1], area) for i in range(len(fr) - 1)]
        seam = change(fr[-1], fr[0], area)
        p = []
        still_rel = str(Path(rel).with_name(name.rsplit('-', 1)[0] + '.png'))
        if kind == 'walk':
            mid = overlaps[len(fr) // 2 - 1]
            if not 0.75 <= mid <= 0.9: p.append(f'mid-cycle overlap {mid:.2f} (0.75-0.9)')
        if kind == 'idle':
            if not any(0.85 <= o <= 0.95 for o in overlaps): p.append(f'lowest overlap {min(overlaps):.2f} (a frame at 0.85-0.95)')
        if kind == 'fire' and min(overlaps) > 0.95:
            p.append(f'no recoil or squash in the outline (lowest overlap {min(overlaps):.2f}, <= 0.95)')
        if kind in ('idle', 'walk') and seam > 1.15 * np.mean(steps):
            p.append(f'loop seam {seam / np.mean(steps):.1f}x a step')
        if kind == 'fire' and exists(still_rel):
            still = rgba(still_rel)
            if still.shape == fr[0].shape:
                # strips in the game are reduced to 256 colours (optimize-strips), which alone moves them a few
                # levels off their full-colour stills: a delivered strip gets 3 / 6, a reduced one 10 / 12
                reduced = Image.open(find(rel)).mode == 'P'
                t0, t1 = (10, 12) if reduced else (3, 6)
                d0 = float(np.abs(fr[0] - still).mean() * 255)
                d1 = float(np.abs(fr[-1] - still).mean() * 255)
                if d0 > t0: p.append(f'frame 0 off the still ({d0:.1f}, <= {t0})')
                if d1 > t1: p.append(f'last frame off the still ({d1:.1f}, <= {t1})')
        if kind == 'die' and fr[-1][..., 3].mean() > 0.02:
            p.append(f'last frame not empty (alpha {fr[-1][..., 3].mean():.2f})')
        rep.row(rel.replace('public/sprites/', ''), f"{len(fr)}f  lowest overlap {min(overlaps):.2f}  seam/step {seam / max(1e-6, np.mean(steps)):.1f}", p)
    rep.show()
    return rep


# ---------------------------------------------------------------- main

def main():
    reports = []
    if WHAT in ('towers', 'all'): reports.append(check_towers())
    if WHAT in ('creeps', 'all'): reports.append(check_creeps())
    if WHAT in ('maps', 'all'): reports.append(check_maps())
    if WHAT in ('strips', 'all'): reports.append(check_strips())
    if not reports:
        print(__doc__)
        sys.exit(2)
    print('\nSummary: ' + '; '.join(f'{r.title.split(" (")[0]} {r.items - r.fails}/{r.items}' for r in reports))
    if STRICT and any(r.fails for r in reports):
        sys.exit(1)


if __name__ == '__main__':
    main()
