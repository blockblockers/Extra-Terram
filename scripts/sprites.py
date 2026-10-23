#!/usr/bin/env python3
"""Extra Terram — scripts/sprites.py v0.2.0 — sprite inbox fitter + manifest writer

Two jobs, matching the art handoff doc:

  python scripts/sprites.py           write public/sprites/manifest.json from the PNGs that exist
  python scripts/sprites.py --fit     first process public/sprites/_inbox/**: trim transparent margins,
                                      scale to the canvas rule, place at the anchor, save to the real
                                      path, then write the manifest

Canvas rules (from the handoff):
  towers   256x256, footprint centre at (128, 168); t1/t2 fill 70% of the box, t3a/t3b fill 85%
  turrets  128x128, pivot at centre, pointing right
  creeps   128x128, centred, facing right
  projectile 64x64, centred, pointing right

Needs pillow. Raw crops go in  public/sprites/_inbox/<race>/<tower>/t1.png  (or creeps/<creep>.png).
"""
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / "public" / "sprites"
INBOX = SPRITES / "_inbox"

TOWER_STATES = {"t1": 0.70, "t2": 0.70, "t3a": 0.85, "t3b": 0.85}


def spec_for(rel: Path):
    """(canvas, fill ratio, anchor x, anchor y) for a sprite path like rootkin/needlespire/t3a.png."""
    name = rel.stem
    parts = rel.parts
    if len(parts) >= 2 and parts[-2] == "creeps":
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
    img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    # place so the unit's footprint (its bottom centre) sits at the anchor for towers,
    # or its centre at the anchor for everything else
    if ay > 0.5:
        x = round(canvas * ax - img.width / 2)
        y = round(canvas * ay - img.height * 0.92)  # bottom edge a little below the anchor line
    else:
        x = round(canvas * ax - img.width / 2)
        y = round(canvas * ay - img.height / 2)
    out.alpha_composite(img, (max(0, min(canvas - img.width, x)), max(0, min(canvas - img.height, y))))
    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst, optimize=True)


def process_inbox() -> int:
    if not INBOX.exists():
        return 0
    n = 0
    for src in sorted(INBOX.rglob("*.png")):
        rel = src.relative_to(INBOX)
        spec = spec_for(rel)
        if spec is None:
            print(f"skip {rel}: not a recognised sprite name (see the handoff doc)")
            continue
        dst = SPRITES / rel
        fit(src, dst, *spec)
        print(f"fitted {rel} -> {spec[0]}px")
        n += 1
    return n


def write_manifest() -> int:
    paths = []
    for png in sorted(SPRITES.rglob("*.png")):
        rel = png.relative_to(SPRITES)
        if rel.parts[0].startswith("_"):
            continue
        paths.append(rel.as_posix())
    (SPRITES).mkdir(parents=True, exist_ok=True)
    (SPRITES / "manifest.json").write_text(json.dumps({"version": 1, "sprites": paths}, indent=2) + "\n")
    return len(paths)


if __name__ == "__main__":
    if "--fit" in sys.argv:
        fitted = process_inbox()
        if fitted and "--keep-inbox" not in sys.argv:
            shutil.rmtree(INBOX)
        print(f"{fitted} sprite(s) fitted")
    count = write_manifest()
    print(f"manifest: {count} sprite(s) listed in public/sprites/manifest.json")
