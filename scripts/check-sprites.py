#!/usr/bin/env python3
"""Extra-Terram — scripts/check-sprites.py v0.3.1 — check an art drop against the sprite spec before it goes in (in the repo: the slots come from the game content); turrets drawn on their bodies

  python check-sprites.py <drop-folder> [--project <game folder>] [--out <dir>]

<drop-folder> is laid out like the game (an unpacked drop): public/sprites/..., public/ui/..., public/art/...
--project     the game folder (the one holding public/sprites). A strip's frame 0 is compared with its
              still; the still is taken from the drop when the drop carries it, otherwise from here.
--out         where to write sprite-check.png (default: the drop folder)

For every file it prints OK, WARN (look at it) or FAIL (the game would show it wrong or not at all),
then writes sprite-check.png: every file on a checkerboard with its guide drawn over it (tower base line,
turret pivot, creep centre, strip frames), and every tower state that has a turret drawn with the turret on the
game's pivot (art/mounts.json, the drop's own if it carries one, else the default), with a warning when a dark
socket or hole of the body shows beside the turret. Exit code 1 when anything FAILs. Put sprite-check.png in the drop.

The spec is the doc "Art Handoff: Towers, Creeps, Effects and UI"; the file names the game looks for are
in sprite-slots.json next to this script. Needs numpy and pillow.
"""
import difflib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
VIS = 40  # alpha above this counts as visible
KEYS = {"magenta": (255, 0, 255), "blue": (0, 0, 255), "green": (0, 255, 0)}
RACE_KEY = {"rootkin": "magenta", "assembly": "magenta", "chitin": "blue", "lumenari": "green"}  # the doc's key colours
STRIP_FRAMES = {"idle": 6, "fire": 4, "walk": 6, "die": 5}
FX = {  # name -> (width, height, frames, added-as-light)
    "rooted": (128, 128, 1, False), "spin-up": (128, 128, 1, True), "hive-link": (128, 48, 1, False),
    "overcharge": (128, 128, 1, True), "impact": (512, 128, 4, False), "muzzle": (128, 64, 1, True),
}


# ------------------------------------------------------------------ helpers

def rgba(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)


def bbox(a: np.ndarray):
    """(x0, y0, x1, y1) of the visible pixels, inclusive, or None."""
    m = a[..., 3] > VIS
    ys, xs = np.where(m)
    if not len(xs):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def corners_clear(a: np.ndarray, k: int = 4) -> bool:
    h, w = a.shape[:2]
    patches = [a[:k, :k], a[:k, w - k:], a[h - k:, :k], a[h - k:, w - k:]]
    return all((p[..., 3] <= VIS).all() for p in patches)


def key_fringe(a: np.ndarray, race: str | None) -> str | None:
    """Visible pixels close to the key colour this race is generated on (a halo the background cut left)."""
    vis = a[..., 3] > 64
    n = vis.sum()
    if not n or race not in RACE_KEY:
        return None
    rgb = a[..., :3][vis]
    for name, c in ((RACE_KEY[race], KEYS[RACE_KEY[race]]),):
        near = (np.abs(rgb - np.array(c)).sum(axis=1) < 90).sum()
        if near / n > 0.003:
            return f"{near} pixels close to the {name} key colour: a fringe left by the background cut"
    return None


def straight_cut(a: np.ndarray) -> str | None:
    """A long vertical run of opaque pixels exactly on the left or right edge of the artwork = cut by a crop."""
    b = bbox(a)
    if not b:
        return None
    x0, y0, x1, y1 = b
    h = y1 - y0 + 1
    for side, x in (("left", x0), ("right", x1)):
        col = a[y0:y1 + 1, x, 3] > 160
        run = best = 0
        for v in col:
            run = run + 1 if v else 0
            best = max(best, run)
        if best >= max(14, 0.12 * h):
            return f"a straight {side} edge {best} px tall: check the unit is not cut by its crop"
    return None


def frames_of(a: np.ndarray, n: int):
    h, w = a.shape[:2]
    fw = w // n
    return [a[:, i * fw:(i + 1) * fw] for i in range(n)]


def premul(a: np.ndarray) -> np.ndarray:
    return np.concatenate([a[..., :3] * (a[..., 3:4] / 255.0), a[..., 3:4]], axis=-1)


def diff(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.abs(premul(a) - premul(b)).mean())


def near_copy(f0: np.ndarray, fi: np.ndarray) -> bool:
    """True when frame i is frame 0 merely moved or scaled (what the game already does by itself)."""
    b0, bi = bbox(f0), bbox(fi)
    if not b0 or not bi:
        return False
    c0 = Image.fromarray(f0[b0[1]:b0[3] + 1, b0[0]:b0[2] + 1].astype(np.uint8), "RGBA")
    ci = fi[bi[1]:bi[3] + 1, bi[0]:bi[2] + 1]
    c0 = np.asarray(c0.resize((ci.shape[1], ci.shape[0]), Image.BILINEAR)).astype(np.float32)
    return diff(c0, ci) < 4.0


def load_slots(project: Path | None) -> dict:
    p = HERE / "sprite-slots.json"
    if p.exists():
        return json.loads(p.read_text())
    if project is None:
        raise SystemExit("sprite-slots.json is missing next to this script; pass --project <game folder> instead")
    return slots_from_project(project)


def slots_from_project(project: Path) -> dict:
    content = project / "src" / "content"
    towers = json.loads((content / "towers.json").read_text())["towers"]
    creeps = json.loads((content / "creeps.json").read_text())["creeps"]
    races = [r["id"] for r in json.loads((content / "races.json").read_text())["races"]]
    return {
        "races": races,
        "towers": [{"race": t["race"], "id": t["id"], "attack": t["attack"], "role": t["role"],
                    "turret": t["attack"] == "projectile" and t["role"] in ("heavy", "range", "splash"),
                    "projectile": t["attack"] == "projectile"} for t in towers],
        "creeps": [{"race": c["race"], "id": c["id"], "boss": c["archetype"] == "boss"} for c in creeps],
        "beams": [t["id"] for t in towers if t["attack"] == "beam" and t["id"] != "mandible"],
        "fields": [t["id"] for t in towers if t["attack"] == "aura"],
        "ui": ["currency-sap", "currency-scrap", "currency-resin", "currency-lumen", "emblem-rootkin",
               "emblem-assembly", "emblem-chitin", "emblem-lumenari", "lives", "mode-race", "mode-mirror",
               "mode-coop", "mode-lanes", "mode-king"],
    }


def known_names(slots: dict) -> set:
    out = set()
    states = ["t1", "t2", "t3a", "t3b"]
    race_of = {t["id"]: t["race"] for t in slots["towers"]}
    for t in slots["towers"]:
        base = f"public/sprites/{t['race']}/{t['id']}/"
        for s in states:
            out |= {base + f"{s}.png", base + f"{s}-idle.png", base + f"{s}-fire.png"}
            if t["turret"]:
                out |= {base + f"turret-{s}.png", base + f"turret-{s}-fire.png"}
        if t["projectile"]:
            out.add(base + "projectile.png")
    for c in slots["creeps"]:
        base = f"public/sprites/{c['race']}/creeps/{c['id']}"
        out |= {base + ".png", base + "-walk.png", base + "-die.png"}
    for r in slots["races"]:
        out |= {f"public/sprites/{r}/fx/impact.png", f"public/sprites/{r}/fx/muzzle.png"}
    out |= {"public/sprites/rootkin/fx/rooted.png", "public/sprites/assembly/fx/spin-up.png",
            "public/sprites/chitin/fx/hive-link.png", "public/sprites/lumenari/fx/overcharge.png",
            "public/sprites/chitin/fx/bite-mandible.png"}
    for b in slots["beams"]:
        out.add(f"public/sprites/{race_of[b]}/fx/beam-{b}.png")
    for f in slots["fields"]:
        out.add(f"public/sprites/{race_of[f]}/fx/field-{f}.png")
    out |= {f"public/ui/{u}.png" for u in slots["ui"]}
    out.add("public/art/title.jpg")
    out.add("public/art/title-portrait.jpg")
    return out


# ------------------------------------------------------------------ the checks

class Report:
    def __init__(self):
        self.rows = []  # (rel, level, messages, image array or None, guide kind)

    def add(self, rel, msgs, img=None, guide=None):
        level = "FAIL" if any(m.startswith("FAIL") for m in msgs) else "WARN" if msgs else "OK"
        self.rows.append((rel, level, [m.split(": ", 1)[1] if m[:4] in ("FAIL", "WARN") else m for m in msgs], img, guide))


def fail(m):
    return "FAIL: " + m


def warn(m):
    return "WARN: " + m


def check_size(a, w, h, msgs):
    if a.shape[1] != w or a.shape[0] != h:
        msgs.append(fail(f"is {a.shape[1]} × {a.shape[0]}, the game needs {w} × {h}"))
        return False
    return True


def check_tower_still(a, msgs, race=None):
    if not check_size(a, 256, 256, msgs):
        return
    if not corners_clear(a):
        msgs.append(fail("the background is not transparent"))
    b = bbox(a)
    if not b:
        msgs.append(fail("the image is empty"))
        return
    x0, y0, x1, y1 = b
    if abs(y1 - 182) > 4:
        msgs.append(warn(f"the base sits on y = {y1}, not 182 (art-drop refits it, but check the footprint)"))
    foot = a[max(y0, y1 - 12):y1 + 1, :, 3] > VIS
    cols = np.where(foot.any(axis=0))[0]
    if len(cols) and abs((cols.min() + cols.max()) / 2 - 128) > 16:
        msgs.append(warn(f"the base is centred on x = {(cols.min() + cols.max()) / 2:.0f}, not 128"))
    if x0 < 2 or x1 > 253 or y0 < 2:
        msgs.append(fail("the unit touches the canvas edge"))
    if (x1 - x0 + 1) > 0.85 * 256 + 4:
        msgs.append(warn(f"{x1 - x0 + 1} px wide: more than 85% of the canvas"))
    for m in (straight_cut(a), key_fringe(a, race)):
        if m:
            msgs.append(warn(m))


def check_turret(a, msgs, race=None):
    if not check_size(a, 128, 128, msgs):
        return
    if not corners_clear(a):
        msgs.append(fail("the background is not transparent"))
    b = bbox(a)
    if not b:
        msgs.append(fail("the image is empty"))
        return
    x0, y0, x1, y1 = b
    yy, xx = np.mgrid[0:128, 0:128]
    near = ((xx - 64) ** 2 + (yy - 64) ** 2 <= 36) & (a[..., 3] > VIS)
    if not near.any():
        msgs.append(fail("nothing is painted on the pivot (64, 64): the part would spin around empty space"))
    if x0 < 2 or y0 < 2 or x1 > 125 or y1 > 125:
        msgs.append(fail("the part touches the canvas edge (keep it within 55 px of the pivot)"))
    else:
        reach = float(np.sqrt(((xx - 64) ** 2 + (yy - 64) ** 2)[a[..., 3] > VIS].max()))
        if reach > 56:
            msgs.append(warn(f"reaches {reach:.0f} px from the pivot (spec: within 55)"))
    if y1 - y0 + 1 > 94:
        msgs.append(warn(f"{y1 - y0 + 1} px tall (spec: up to 90)"))
    vis = a[..., 3] > VIS
    if vis[:, 65:].sum() < vis[:, :64].sum():
        msgs.append(warn("more of the part lies left of the pivot than right: does it point right?"))
    m = key_fringe(a, race)
    if m:
        msgs.append(warn(m))


def check_centred(a, size, msgs, fill=(0.5, 0.88), what="unit", race=None):
    if not check_size(a, size, size, msgs):
        return
    if not corners_clear(a):
        msgs.append(fail("the background is not transparent"))
    b = bbox(a)
    if not b:
        msgs.append(fail("the image is empty"))
        return
    x0, y0, x1, y1 = b
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    if abs(cx - size / 2) > 0.08 * size or abs(cy - size / 2) > 0.08 * size:
        msgs.append(warn(f"the {what} is centred on ({cx:.0f}, {cy:.0f}), not the canvas centre"))
    f = max(x1 - x0 + 1, y1 - y0 + 1) / size
    if not fill[0] <= f <= fill[1]:
        msgs.append(warn(f"fills {f:.0%} of the canvas (expected {fill[0]:.0%} to {fill[1]:.0%})"))
    if x0 < 1 or y0 < 1 or x1 > size - 2 or y1 > size - 2:
        msgs.append(fail(f"the {what} touches the canvas edge"))
    m = key_fringe(a, race)
    if m:
        msgs.append(warn(m))


def check_projectile(a, msgs, race=None):
    check_centred(a, 64, msgs, fill=(0.55, 0.92), what="projectile", race=race)
    b = bbox(a)
    if b and (b[2] - b[0]) < (b[3] - b[1]):
        msgs.append(warn("taller than it is long: a projectile should point right"))


def check_strip(a, rel, kind, frame, n, still: np.ndarray | None, msgs):
    h, w = a.shape[:2]
    if h != frame or w != frame * n:
        msgs.append(fail(f"is {w} × {h}; a {kind} strip here is {n} frames of {frame}: {frame * n} × {frame}"))
        return
    fr = frames_of(a, n)
    if still is None:
        msgs.append(warn("its still is not in the drop or the project, so frame 0 could not be compared"))
    elif still.shape != fr[0].shape:
        msgs.append(fail(f"frame size {fr[0].shape[1]} differs from its still ({still.shape[1]})"))
    else:
        d = diff(fr[0], still)
        if d > 6.0:
            msgs.append(fail(f"frame 0 differs from the still (mean difference {d:.1f}): the unit would jump when the strip starts"))
        elif d > 3.0:
            msgs.append(warn(f"frame 0 is not quite the still (mean difference {d:.1f}); copy the still into frame 0 pixel for pixel"))
    b0 = bbox(fr[0])
    if not b0:
        msgs.append(fail("frame 0 is empty"))
        return
    w0, h0 = b0[2] - b0[0] + 1, b0[3] - b0[1] + 1
    for i, f in enumerate(fr[1:], 1):
        b = bbox(f)
        if not b:
            if kind != "die":
                msgs.append(fail(f"frame {i} is empty"))
            continue
        wi, hi = b[2] - b[0] + 1, b[3] - b[1] + 1
        grow = max(wi / w0, hi / h0)
        shrink = min(wi / w0, hi / h0)
        if kind != "die" and (grow > 1.06 or shrink < 0.94):
            msgs.append(warn(f"frame {i} is {wi} × {hi} against frame 0's {w0} × {h0}: more than 6% off"))
    if kind != "die":
        copies = sum(near_copy(fr[0], f) for f in fr[1:])
        if copies == len(fr) - 1:
            msgs.append(warn("every frame is the still moved or scaled: the game already does that, so this strip adds nothing"))
    if kind in ("idle", "walk") and n > 2:
        steps = [diff(fr[i], fr[i + 1]) for i in range(n - 1)]
        back = diff(fr[-1], fr[0])
        med = float(np.median(steps)) or 0.01
        if back > 2.5 * med and back > 2.0:
            msgs.append(warn(f"the loop jumps from the last frame back to frame 0 ({back:.1f} against a usual step of {med:.1f})"))
    if kind == "die":
        if fr[-1][..., 3].sum() > 0.8 * fr[0][..., 3].sum():
            msgs.append(warn("the last die frame is nearly as solid as the still: it should end faint or scattered"))


def dark_share(a: np.ndarray) -> float:
    vis = a[..., 3] > 64
    if not vis.any():
        return 0.0
    rgb = a[..., :3][vis]
    luma = 0.299 * rgb[:, 0] + 0.587 * rgb[:, 1] + 0.114 * rgb[:, 2]
    return float((luma < 50).mean())


def check_fx(a, name, msgs):
    if name.startswith("beam-"):
        spec = (256, 32, 1, True)
    elif name.startswith("field-"):
        spec = (512, 512, 1, False)
    elif name.startswith("bite-"):
        spec = (512, 128, 4, False)
    else:
        spec = FX.get(name)
    if spec is None:
        msgs.append(fail("not an effect the game knows"))
        return
    w, h, _, light = spec
    if not check_size(a, w, h, msgs):
        return
    if not corners_clear(a, 3) and not name.startswith("beam-"):
        msgs.append(fail("the background is not transparent"))
    if light and dark_share(a) > 0.02:
        msgs.append(warn(f"{dark_share(a):.0%} of it is dark: it is added as light, so dark parts vanish"))
    if name.startswith("beam-"):
        rows = a[..., 3].sum(axis=1) * a[..., :3].mean(axis=2).mean(axis=1)
        peak = int(np.argmax(rows))
        if abs(peak - 16) > 4:
            msgs.append(warn(f"the brightest line is at y = {peak}, not on the centre line (16)"))
    if name.startswith("field-"):
        yy, xx = np.mgrid[0:512, 0:512]
        outside = (xx - 255.5) ** 2 + (yy - 255.5) ** 2 > 256 ** 2
        if (a[..., 3][outside] > VIS).mean() > 0.01:
            msgs.append(fail("paint outside the circle: a field must be transparent beyond its rim"))
    if name == "hive-link":
        cols = (a[..., 3] > VIS).sum(axis=0)[13:115].astype(float)
        if cols.mean() and cols.std() / cols.mean() > 0.35:
            msgs.append(warn("the thread is uneven along its length; it is stretched, so keep it even"))


# ------------------------------------------------------------------ the contact sheet

def sheet(report: Report, out: Path) -> None:
    rows = [r for r in report.rows if r[3] is not None]
    if not rows:
        return
    cell, pad, label = 220, 10, 46
    cols = 5
    nrow = (len(rows) + cols - 1) // cols
    W = cols * (cell + pad) + pad
    H = nrow * (cell + label + pad) + pad
    img = Image.new("RGB", (W, H), (24, 30, 38))
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 12)
    except OSError:
        font = ImageFont.load_default()
    color = {"OK": (95, 200, 120), "WARN": (240, 190, 70), "FAIL": (235, 90, 90)}
    for i, (rel, level, msgs, a, guide) in enumerate(rows):
        r, c = divmod(i, cols)
        x0, y0 = pad + c * (cell + pad), pad + r * (cell + label + pad)
        bg = Image.new("RGB", (cell, cell), (52, 60, 70))
        d = ImageDraw.Draw(bg)
        for yy in range(0, cell, 11):
            for xx in range(0, cell, 11):
                if (xx // 11 + yy // 11) % 2:
                    d.rectangle([xx, yy, xx + 10, yy + 10], fill=(44, 52, 62))
        src = Image.fromarray(a.astype(np.uint8), "RGBA")
        k = min(cell / src.width, cell / src.height)
        sw, sh = max(1, int(src.width * k)), max(1, int(src.height * k))
        ox, oy = (cell - sw) // 2, (cell - sh) // 2
        bg.paste(src.resize((sw, sh), Image.LANCZOS), (ox, oy), src.resize((sw, sh), Image.LANCZOS))
        d = ImageDraw.Draw(bg)
        if guide == "tower":
            d.line([ox, oy + 182 * k, ox + sw, oy + 182 * k], fill=(232, 79, 200), width=1)
            d.line([ox + 128 * k - 6, oy + 168 * k, ox + 128 * k + 6, oy + 168 * k], fill=(242, 193, 78), width=1)
            d.line([ox + 128 * k, oy + 168 * k - 6, ox + 128 * k, oy + 168 * k + 6], fill=(242, 193, 78), width=1)
        elif guide == "centre":
            cx, cy = ox + sw / 2, oy + sh / 2
            d.line([cx - 6, cy, cx + 6, cy], fill=(242, 193, 78), width=1)
            d.line([cx, cy - 6, cx, cy + 6], fill=(242, 193, 78), width=1)
        elif guide and guide.startswith("strip:"):
            n = int(guide.split(":")[1])
            for f in range(1, n):
                d.line([ox + f * sw / n, oy, ox + f * sw / n, oy + sh], fill=(79, 216, 232), width=1)
        img.paste(bg, (x0, y0))
        dd = ImageDraw.Draw(img)
        dd.rectangle([x0, y0 + cell, x0 + cell, y0 + cell + 4], fill=color[level])
        name = rel.replace("public/sprites/", "")
        dd.text((x0, y0 + cell + 8), name[-34:], font=font, fill=(232, 236, 240))
        dd.text((x0, y0 + cell + 24), (msgs[0] if msgs else "OK")[:36], font=font, fill=color[level])
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)


# ------------------------------------------------------------------ main

def main() -> None:
    args = [a for a in sys.argv[1:]]
    if not args or args[0].startswith("--"):
        raise SystemExit(__doc__)
    drop = Path(args[0]).resolve()
    project = Path(args[args.index("--project") + 1]).resolve() if "--project" in args else None
    if project is None and (HERE.parent / "src" / "content").exists():
        project = HERE.parent  # in the repo: scripts/ sits next to the game's content
    out = Path(args[args.index("--out") + 1]).resolve() if "--out" in args else drop
    slots = load_slots(project)
    names = known_names(slots)
    bosses = {c["id"] for c in slots["creeps"] if c["boss"]}

    files = sorted(p for p in drop.rglob("*") if p.suffix.lower() in (".png", ".jpg", ".jpeg") and "public" in p.parts)
    report = Report()
    for p in files:
        rel = "/".join(p.parts[p.parts.index("public"):])
        msgs: list[str] = []
        if rel.startswith("public/maps/thumbs/"):
            continue  # written by scripts/gen-map-thumbs.py from the maps, never delivered
        if rel.startswith("public/maps/"):
            report.add(rel, ["not checked here: map backgrounds are checked with check-map.py from the map kit"])
            continue
        if rel.startswith("public/icons/"):
            report.add(rel, ["not checked here: the app icons are made by the project's icon script"])
            continue
        if rel not in names:
            close = difflib.get_close_matches(rel, list(names), n=1, cutoff=0.8)
            report.add(rel, [fail("the game does not look for a file with this name" + (f"; did you mean {close[0]}?" if close else ""))])
            continue
        if rel in ("public/art/title.jpg", "public/art/title-portrait.jpg"):
            # The key art, free of lettering, in two framings: title.jpg is 16:9 landscape (1672 x 941 or a
            # whole multiple; the bottom 11% dark for the race bar), title-portrait.jpg is 3:4 portrait
            # (1536 x 2048 or a multiple; the lower quarter dark for the quick bar).
            im = Image.open(p)
            w, h = im.size
            tall = rel.endswith("title-portrait.jpg")
            ratio, base, band, name = (3 / 4, (1536, 2048), 0.75, "3:4 portrait, 1536 × 2048") if tall else (1672 / 941, (1672, 941), 0.89, "16:9 landscape, 1672 × 941")
            if w < base[0] or h < base[1] or abs(w / h - ratio) > 0.01:
                msgs.append(fail(f"is {w} × {h}; the key art is {name} or a whole multiple of it"))
            g = np.asarray(im.convert("L")).astype(float)
            if g.shape[0] >= 3 and g[int(g.shape[0] * band):].mean() > 30:
                msgs.append(warn(f"the bottom {round((1 - band) * 100)}% is not dark: the {'quick bar' if tall else 'race bar'} sits there"))
            report.add(rel, msgs)
            continue
        a = rgba(p)
        parts = rel.split("/")
        stem = parts[-1][:-4]
        guide = None
        if parts[1] == "ui":
            check_centred(a, 128, msgs, fill=(0.6, 0.95), what="icon")
            guide = "centre"
        elif parts[3] == "fx":
            check_fx(a, stem, msgs)
            guide = "strip:4" if stem in ("impact",) or stem.startswith("bite-") else None
        elif parts[3] == "creeps":
            cid = stem.rsplit("-", 1)[0] if stem.endswith(("-walk", "-die")) else stem
            size = 256 if cid in bosses else 128
            if stem.endswith(("-walk", "-die")):
                anim = stem.rsplit("-", 1)[1]
                still = still_for(drop, project, rel.rsplit("-", 1)[0] + ".png")
                check_strip(a, rel, anim, size, STRIP_FRAMES[anim], still, msgs)
                guide = f"strip:{STRIP_FRAMES[anim]}"
            else:
                check_centred(a, size, msgs, fill=(0.5, 0.88), what="creep", race=parts[2])
                guide = "centre"
        else:
            if stem == "projectile":
                check_projectile(a, msgs, race=parts[2])
                guide = "centre"
            elif stem.startswith("turret-"):
                if stem.endswith("-fire"):
                    still = still_for(drop, project, rel[: -len("-fire.png")] + ".png")
                    check_strip(a, rel, "fire", 128, 4, still, msgs)
                    guide = "strip:4"
                else:
                    check_turret(a, msgs, race=parts[2])
                    guide = "centre"
            elif stem.endswith(("-idle", "-fire")):
                anim = stem.rsplit("-", 1)[1]
                still = still_for(drop, project, rel.rsplit("-", 1)[0] + ".png")
                check_strip(a, rel, anim, 256, STRIP_FRAMES[anim], still, msgs)
                guide = f"strip:{STRIP_FRAMES[anim]}"
            else:
                check_tower_still(a, msgs, race=parts[2])
                guide = "tower"
        report.add(rel, msgs, a, guide)
    check_mounts(drop, project, report)

    worst = "OK"
    for rel, level, msgs, _, _ in report.rows:
        print(f"{level:4}  {rel}" + (f"\n      " + "\n      ".join(msgs) if msgs else ""))
        if level == "FAIL" or (level == "WARN" and worst == "OK"):
            worst = level
    counts = {k: sum(1 for r in report.rows if r[1] == k) for k in ("OK", "WARN", "FAIL")}
    sheet(report, out / "sprite-check.png")
    print(f"\n{len(report.rows)} files: {counts['OK']} OK, {counts['WARN']} to look at, {counts['FAIL']} failing."
          + (f" Contact sheet: {out / 'sprite-check.png'}" if report.rows else " No files found under public/ in the drop."))
    sys.exit(1 if counts["FAIL"] else 0)


GROW = {"t1": 1.0, "t2": 1.05, "t3a": 1.14, "t3b": 1.14}
PIVOT_Y = {"t1": 99, "t2": 102, "t3a": 107, "t3b": 107}


def lab_l(a: np.ndarray) -> np.ndarray:
    """CIE L* (0-100) of an RGBA array."""
    rgb = a[..., :3] / 255.0
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    y = lin @ np.array([0.2126, 0.7152, 0.0722])
    f = np.where(y > 0.008856, np.cbrt(y), 7.787 * y + 16 / 116)
    return 116 * f - 16


def erode(m: np.ndarray, k: int) -> np.ndarray:
    for _ in range(k):
        p = np.pad(m, 1)
        m = p[1:-1, 1:-1] & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    return m


def components(m: np.ndarray):
    """Yield the 8-connected components of a boolean mask as (ys, xs) arrays."""
    left = m.copy()
    while left.any():
        ys, xs = np.nonzero(left)
        comp = np.zeros_like(m)
        comp[ys[0], xs[0]] = True
        while True:
            p = np.pad(comp, 1)
            grown = p[1:-1, 1:-1] | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:] | p[:-2, :-2] | p[:-2, 2:] | p[2:, :-2] | p[2:, 2:]
            grown &= left
            if (grown == comp).all():
                break
            comp = grown
        left &= ~comp
        yield np.nonzero(comp)


def pivots_for(drop: Path, project: Path | None) -> dict:
    """Turret pivots per tower and state: the game's art/mounts.json, overridden by one the drop carries."""
    out: dict = {}
    for root in (project, drop):
        if root is not None and (root / "art" / "mounts.json").exists():
            for key, entry in json.loads((root / "art" / "mounts.json").read_text()).items():
                if not key.startswith("_") and "pivot" in entry:
                    out.setdefault(key, {}).update(entry["pivot"])
    return out


def mounted(body: np.ndarray, turret: np.ndarray, state: str, pivot) -> tuple[np.ndarray, list[str]]:
    """The body with its turret on the pivot (aimed right, as drawn in the game), and a warning for any dark
    socket or hole of the body that the turret does not cover in every aim (it would show beside the turret)."""
    tw = round(64 / (0.4625 * GROW[state]))
    px, py = pivot
    tur = Image.fromarray(turret.astype(np.uint8), "RGBA").resize((tw, tw), Image.LANCZOS)
    comp = Image.fromarray(body.astype(np.uint8), "RGBA")
    comp.alpha_composite(tur, (int(px - tw / 2), int(py - tw / 2)))
    d = ImageDraw.Draw(comp)
    d.line([px - 5, py, px + 5, py], fill=(255, 0, 255, 255))
    d.line([px, py - 5, px, py + 5], fill=(255, 0, 255, 255))
    msgs: list[str] = []
    solid = body[..., 3] > 128
    lum = lab_l(body)
    dark = (lum < 14) & erode(solid, 3)  # the outline band along the edge is meant to be dark
    covers = []
    for angle in (0, 90, 180, 270):
        cover = Image.new("L", (256, 256), 0)
        cover.paste(tur.rotate(angle).split()[3], (int(px - tw / 2), int(py - tw / 2)))
        covers.append(np.asarray(cover) > 128)
    for ys, xs in components(dark):
        w, h = int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)
        # a socket: a near-black patch about a drum wide, wider than tall, above the pivot (shading and seams are not)
        if (len(ys) < 200 or not 18 <= w <= 80 or h > 0.85 * w or len(ys) < 0.25 * w * h
                or lum[ys, xs].mean() > 10 or ys.mean() > py):
            continue
        shown = max(1 - c[ys, xs].mean() for c in covers)
        if shown > 0.4:
            cx, cy = int(xs.mean()), int(ys.mean())
            msgs.append(warn(f"a dark socket or hole ({w} × {h} px at {cx}, {cy}) shows beside the turret on its pivot "
                             f"({px}, {py}) in some aims ({shown:.0%} uncovered): paint the socket under the pivot, "
                             f"or name the pivot that sits in it"))
    return np.asarray(comp).astype(np.float32), msgs


def check_mounts(drop: Path, project: Path | None, report: "Report") -> None:
    """Every tower state with a turret, the turret drawn on its pivot: on the contact sheet, and warned about
    when a socket of the body shows beside it."""
    pivots = pivots_for(drop, project)
    seen = set()
    for t in sorted(drop.rglob("turret-t*.png")):
        if "public" not in t.parts or t.stem.endswith("-fire"):
            continue
        rel_dir = "/".join(t.parts[t.parts.index("public"):-1])
        state = t.stem[len("turret-"):]
        if state not in GROW or (rel_dir, state) in seen:
            continue
        seen.add((rel_dir, state))
        body = still_for(drop, project, f"{rel_dir}/{state}.png")
        if body is None:
            continue
        race, tower = rel_dir.split("/")[2:4]
        pivot = pivots.get(f"{race}/{tower}", {}).get(state, [128, PIVOT_Y[state]])
        comp, msgs = mounted(body, rgba(t), state, pivot)
        report.add(f"{rel_dir}/{state} + turret", msgs, comp, "tower")
    for b in sorted(drop.rglob("t*.png")):  # a body delivered without its turret: draw the game's turret on it
        if "public" not in b.parts or b.stem not in GROW:
            continue
        rel_dir = "/".join(b.parts[b.parts.index("public"):-1])
        if (rel_dir, b.stem) in seen or project is None or not (project / rel_dir / f"turret-{b.stem}.png").exists():
            continue
        seen.add((rel_dir, b.stem))
        race, tower = rel_dir.split("/")[2:4]
        pivot = pivots.get(f"{race}/{tower}", {}).get(b.stem, [128, PIVOT_Y[b.stem]])
        comp, msgs = mounted(rgba(b), rgba(project / rel_dir / f"turret-{b.stem}.png"), b.stem, pivot)
        report.add(f"{rel_dir}/{b.stem} + turret", msgs, comp, "tower")


def still_for(drop: Path, project: Path | None, rel_still: str):
    for root in (drop, project):
        if root is not None and (root / rel_still).exists():
            return rgba(root / rel_still)
    return None


if __name__ == "__main__":
    main()
