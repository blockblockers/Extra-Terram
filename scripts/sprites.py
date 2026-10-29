#!/usr/bin/env python3
"""Extra Terram — scripts/sprites.py v0.5.0 — head-less bodies and stills with strips are never refit; strip refit; boss canvas; mounts.json; ui list

Jobs, matching the art handoff docs:

  python scripts/sprites.py                 write public/sprites/manifest.json (sprites and ui icons) and
                                            public/sprites/mounts.json (turret pivots, emitters, reach)
  python scripts/sprites.py --fit           first process public/sprites/_inbox/**: trim transparent margins,
                                            scale to the canvas rule, place at the anchor, save to the real
                                            path, then write the manifest
  python scripts/sprites.py --refit         normalise tower stills already in place: any t1/t2/t3a/t3b whose
                                            artwork is more than 8% off the size rule, or whose base is off
                                            y = 182, is trimmed and refitted. Never touched: a head-less body
                                            (a turret file sits beside it: a refit would move its collar off
                                            the pivot) and a still with strips (its strips' frame 0 must stay
                                            equal to it; use --refit-strips for those)
  python scripts/sprites.py --refit-strips  bring strips back onto their still: when a strip's frame 0 is the
                                            still drawn at another size or place (strips cut before a refit),
                                            every frame gets the transform that maps frame 0 onto the still,
                                            and frame 0 becomes the still exactly

Canvas rules (from the handoff):
  towers     256x256, footprint centre at (128, 168); t1/t2 fill 70% of the box, t3a/t3b up to 85% wide —
             but never taller than the anchor allows (bottom edge at y=182), so a tall tier-3 is capped at
             ~70% height; the renderer draws tier 3 a little larger instead
  turrets    128x128, pivot at centre, pointing right
  creeps     128x128, centred, facing right; mini-bosses 256x256
  projectile 64x64, centred, pointing right

mounts: art/mounts.json (kept by hand from the art drops' READMEs) gives turret pivots that are off the
default and emitter points for towers without a turret, in 256-canvas pixels per state. The manifest step
merges it with each turret's front reach, measured from its art, into public/sprites/mounts.json.

Needs pillow and numpy. Raw crops go in  public/sprites/_inbox/<race>/<tower>/t1.png  (or creeps/<creep>.png).
"""
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / "public" / "sprites"
UI = ROOT / "public" / "ui"
INBOX = SPRITES / "_inbox"
MOUNTS_SRC = ROOT / "art" / "mounts.json"
MOUNTS_OUT = SPRITES / "mounts.json"

TOWER_STATES = {"t1": 0.70, "t2": 0.70, "t3a": 0.85, "t3b": 0.85}
STRIP_ANIMS = ("idle", "fire")
VIS = 40


def boss_ids() -> set:
    try:
        creeps = json.loads((ROOT / "src" / "content" / "creeps.json").read_text())["creeps"]
    except (OSError, KeyError, ValueError):
        return set()
    return {c["id"] for c in creeps if c.get("archetype") == "boss"}


def spec_for(rel: Path, bosses: set | None = None):
    """(canvas, fill ratio, anchor x, anchor y) for a sprite path like rootkin/needlespire/t3a.png."""
    name = rel.stem
    parts = rel.parts
    if len(parts) >= 2 and parts[-2] == "creeps":
        if name in (bosses if bosses is not None else boss_ids()):
            return 256, 0.72, 0.5, 0.5
        return 128, 0.72, 0.5, 0.5
    if name.startswith("turret-"):
        return 128, 0.9, 0.5, 0.5
    if name == "projectile":
        return 64, 0.8, 0.5, 0.5
    if name in TOWER_STATES:
        return 256, TOWER_STATES[name], 0.5, 168 / 256
    return None


def fit(src: Path, dst: Path, canvas: int, ratio: float, ax: float, ay: float) -> None:
    img = Image.open(src).convert("RGBA")
    bbox = img.getbbox()
    if bbox is None:
        raise SystemExit(f"{src}: image is fully transparent")
    img = img.crop(bbox)
    w, h = img.size
    scale = (canvas * ratio) / max(w, h)
    if ay > 0.5:
        # the footprint must stay on the anchor: never let the sprite be taller than the room above it
        bottom = canvas * ay + canvas * 0.055  # 182 px on a 256 canvas
        scale = min(scale, (bottom - 3) / h)
    img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    # place so the unit's footprint (its bottom centre) sits at the anchor for towers,
    # or its centre at the anchor for everything else
    if ay > 0.5:
        x = round(canvas * ax - img.width / 2)
        y = round(bottom - img.height)  # bottom edge on the footprint line (y = 182 on a 256 canvas)
    else:
        x = round(canvas * ax - img.width / 2)
        y = round(canvas * ay - img.height / 2)
    out.alpha_composite(img, (max(0, min(canvas - img.width, x)), max(0, min(canvas - img.height, y))))
    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst, optimize=True)


def has_turret(png: Path) -> bool:
    return (png.parent / f"turret-{png.stem}.png").exists()


def strips_of(png: Path) -> list:
    return [png.parent / f"{png.stem}-{a}.png" for a in STRIP_ANIMS if (png.parent / f"{png.stem}-{a}.png").exists()]


def process_inbox() -> int:
    if not INBOX.exists():
        return 0
    n = 0
    bosses = boss_ids()
    for src in sorted(INBOX.rglob("*.png")):
        rel = src.relative_to(INBOX)
        spec = spec_for(rel, bosses)
        if spec is None:
            print(f"skip {rel}: not a recognised sprite name (see the handoff doc)")
            continue
        dst = SPRITES / rel
        if rel.stem in TOWER_STATES and (dst.parent / f"turret-{rel.stem}.png").exists():
            print(f"skip {rel}: a head-less body (its turret is in place); deliver it on its canvas, not through the inbox")
            continue
        fit(src, dst, *spec)
        print(f"fitted {rel} -> {spec[0]}px")
        n += 1
    return n


def refit_in_place(tolerance: float = 0.08) -> int:
    """Refit tower stills whose content is off the fill rule. Returns how many were changed."""
    n = 0
    for png in sorted(SPRITES.rglob("*.png")):
        rel = png.relative_to(SPRITES)
        if rel.parts[0].startswith("_") or rel.stem not in TOWER_STATES:
            continue
        img = Image.open(png).convert("RGBA")
        w, h = img.size
        if w != h:
            continue  # a strip
        bbox = img.getbbox()
        if bbox is None:
            continue
        canvas, ratio, ax, ay = spec_for(rel)
        expected_bottom = canvas * ay + canvas * 0.055
        bw, bh = bbox[2] - bbox[0], bbox[3] - bbox[1]
        content = max(bw, bh) / canvas
        # a tall unit is capped by the room above the anchor, not by the fill rule: that is on the rule
        height_capped = bh >= expected_bottom - 3 - 3 and bw / canvas <= ratio + tolerance
        size_ok = abs(content - ratio) <= tolerance or height_capped
        bottom_off = abs(bbox[3] - expected_bottom)
        too_tall = bh > expected_bottom - 3 + 2
        if size_ok and bottom_off <= 6 and not too_tall:
            continue
        if has_turret(png):
            print(f"kept {rel.as_posix()}: a head-less body (its turret mounts on it), never refitted")
            continue
        if strips_of(png):
            print(f"kept {rel.as_posix()}: it has strips, and their frame 0 must stay equal to it")
            continue
        fit(png, png, canvas, ratio, ax, ay)
        why = f"filled {content:.0%} vs rule {ratio:.0%}" if not size_ok else (f"footprint at y={bbox[3]} (expected ~{expected_bottom:.0f})" if bottom_off > 6 else f"{bh} px tall")
        print(f"refitted {rel.as_posix()}: {why}")
        n += 1
    return n


# ------------------------------------------------------------------ strips back onto their still

def _rgba(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)


def _bbox(a: np.ndarray):
    ys, xs = np.where(a[..., 3] > VIS)
    if not len(xs):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def _diff(a: np.ndarray, b: np.ndarray) -> float:
    pa = np.concatenate([a[..., :3] * (a[..., 3:4] / 255.0), a[..., 3:4]], axis=-1)
    pb = np.concatenate([b[..., :3] * (b[..., 3:4] / 255.0), b[..., 3:4]], axis=-1)
    return float(np.abs(pa - pb).mean())


def _place(cell: Image.Image, img: Image.Image, ox: int, oy: int) -> None:
    """Composite img onto cell with its top-left at (ox, oy), clipped to the cell (offsets may be negative)."""
    sx0, sy0 = max(0, -ox), max(0, -oy)
    dx, dy = max(0, ox), max(0, oy)
    w = min(img.width - sx0, cell.width - dx)
    h = min(img.height - sy0, cell.height - dy)
    if w > 0 and h > 0:
        cell.alpha_composite(img.crop((sx0, sy0, sx0 + w, sy0 + h)), (dx, dy))


def refit_strips() -> int:
    """Map every strip whose frame 0 is its still at another size or place back onto the still."""
    n = 0
    for strip in sorted(SPRITES.rglob("*.png")):
        rel = strip.relative_to(SPRITES)
        if rel.parts[0].startswith("_") or "/fx/" in rel.as_posix():
            continue
        stem = strip.stem
        if not any(stem.endswith(f"-{a}") for a in ("idle", "fire", "walk", "die")):
            continue
        still_path = strip.parent / (stem.rsplit("-", 1)[0] + ".png")
        if not still_path.exists():
            continue
        img = Image.open(strip).convert("RGBA")
        size = img.height
        frames = img.width // size
        if frames < 2 or img.width != frames * size:
            continue
        still = _rgba(still_path)
        if still.shape[0] != size:
            continue
        f0 = np.asarray(img.crop((0, 0, size, size))).astype(np.float32)
        if _diff(f0, still) <= 3.0:
            continue
        b0, bs = _bbox(f0), _bbox(still)
        if not b0 or not bs:
            continue
        sx = (bs[2] - bs[0]) / (b0[2] - b0[0])
        sy = (bs[3] - bs[1]) / (b0[3] - b0[1])
        if abs(sx - sy) > 0.04 * max(sx, sy):
            print(f"left {rel.as_posix()}: frame 0 is not the still at another size (x {sx:.2f}, y {sy:.2f})")
            continue
        s = (sx + sy) / 2
        # frame point (x, y) -> (bs0 + (x - b00) * s), applied to the whole frame
        ox = round(bs[0] - b0[0] * s)
        oy = round(bs[1] - b0[1] * s)
        out = Image.new("RGBA", img.size, (0, 0, 0, 0))
        for i in range(frames):
            fr = img.crop((i * size, 0, (i + 1) * size, size))
            scaled = fr.resize((max(1, round(size * s)), max(1, round(size * s))), Image.LANCZOS)
            cell = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            _place(cell, scaled, ox, oy)
            out.alpha_composite(cell, (i * size, 0))
        mapped = np.asarray(out.crop((0, 0, size, size))).astype(np.float32)
        d = _diff(mapped, still)
        if d > 6.0:
            print(f"left {rel.as_posix()}: frame 0 does not match the still even after the transform (difference {d:.1f})")
            continue
        out.paste(Image.open(still_path).convert("RGBA"), (0, 0))  # frame 0 is the still, pixel for pixel
        out.save(strip, optimize=True)
        print(f"refitted strip {rel.as_posix()}: scale {s:.3f}, frame 0 now equal to the still (was {_diff(f0, still):.1f} off)")
        n += 1
    return n


# ------------------------------------------------------------------ mounts and the manifest

def turret_reach(path: Path) -> int:
    """How far the turret reaches in front of its pivot (turret pixels), within 8 px of the centre row."""
    a = np.asarray(Image.open(path).convert("RGBA"))[..., 3] > VIS
    band = a[56:73, 64:]
    cols = np.where(band.any(axis=0))[0]
    return int(cols.max()) + 1 if len(cols) else 55


def write_mounts() -> int:
    try:
        src = json.loads(MOUNTS_SRC.read_text()) if MOUNTS_SRC.exists() else {}
    except ValueError as e:
        raise SystemExit(f"{MOUNTS_SRC}: not valid JSON ({e})")
    towers: dict = {}
    for key, entry in src.items():
        if key.startswith("_"):
            continue
        towers[key] = {k: v for k, v in entry.items() if k in ("pivot", "emit")}
    for png in sorted(SPRITES.rglob("turret-*.png")):
        rel = png.relative_to(SPRITES)
        if rel.parts[0].startswith("_") or png.stem.endswith("-fire"):
            continue
        key = f"{rel.parts[0]}/{rel.parts[1]}"
        state = png.stem[len("turret-"):]
        towers.setdefault(key, {}).setdefault("reach", {})[state] = turret_reach(png)
    MOUNTS_OUT.write_text(json.dumps({"version": 1, "towers": towers}, indent=1, sort_keys=True) + "\n")
    return len(towers)


def write_manifest() -> int:
    paths = []
    for png in sorted(SPRITES.rglob("*.png")):
        rel = png.relative_to(SPRITES)
        if rel.parts[0].startswith("_"):
            continue
        paths.append(rel.as_posix())
    ui = sorted(p.stem for p in UI.glob("*.png")) if UI.exists() else []
    SPRITES.mkdir(parents=True, exist_ok=True)
    (SPRITES / "manifest.json").write_text(json.dumps({"version": 2, "sprites": paths, "ui": ui}, indent=2) + "\n")
    return len(paths)


if __name__ == "__main__":
    if "--fit" in sys.argv:
        fitted = process_inbox()
        if fitted and "--keep-inbox" not in sys.argv:
            shutil.rmtree(INBOX)
        print(f"{fitted} sprite(s) fitted")
    if "--refit" in sys.argv:
        print(f"{refit_in_place()} tower still(s) refitted in place")
    if "--refit-strips" in sys.argv:
        print(f"{refit_strips()} strip(s) brought back onto their still")
    count = write_manifest()
    mounts = write_mounts()
    print(f"manifest: {count} sprite(s) listed in public/sprites/manifest.json; mounts for {mounts} tower(s) in public/sprites/mounts.json")
