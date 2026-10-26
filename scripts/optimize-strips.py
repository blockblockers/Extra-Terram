#!/usr/bin/env python3
"""Extra Terram — scripts/optimize-strips.py v0.1.1 — effect sprites (<race>/fx/) are never quantised; shrink animation strips for the PWA precache

Animation strips are wide PNGs of near-identical frames, and PNG cannot share pixels between frames,
so a 6-frame idle strip at 256 px weighs 300–500 KB as 32-bit RGBA. Quantising each strip to a
256-colour palette (Pillow's fast octree, Floyd–Steinberg dither) cuts that by ~75% with no change
visible at game scale (frames are drawn at ~120 px on a phone). Stills are left alone: they are the
hero frames in the build bar and already small.

  python scripts/optimize-strips.py            quantise every strip under public/sprites that is still RGBA
  python scripts/optimize-strips.py --dry-run  report sizes only

A strip is any PNG whose width is a whole multiple (>1) of its height — the same rule the renderer uses.
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / "public" / "sprites"


def is_strip(img: Image.Image) -> bool:
    w, h = img.size
    return h > 0 and w > h and w % h == 0


def main() -> None:
    dry = "--dry-run" in sys.argv
    before = after = 0
    done = skipped = 0
    for png in sorted(SPRITES.rglob("*.png")):
        rel = png.relative_to(SPRITES)
        if rel.parts[0].startswith("_") or "fx" in rel.parts[:-1]:
            continue  # parked files, and passive effect sprites (soft glows band under a palette)
        img = Image.open(png)
        if not is_strip(img):
            continue
        size = png.stat().st_size
        if img.mode == "P":
            skipped += 1
            continue
        before += size
        rgba = img.convert("RGBA")
        pal = rgba.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
        if not dry:
            pal.save(png, "PNG", optimize=True)
            new = png.stat().st_size
        else:
            import io

            buf = io.BytesIO()
            pal.save(buf, "PNG", optimize=True)
            new = len(buf.getvalue())
        after += new
        done += 1
        print(f"{png.relative_to(SPRITES).as_posix():48s} {size/1024:6.0f} KB -> {new/1024:5.0f} KB")
    print(f"{'would quantise' if dry else 'quantised'} {done} strip(s): {before/1024/1024:.1f} MB -> {after/1024/1024:.1f} MB; {skipped} already palette")


if __name__ == "__main__":
    main()
