#!/usr/bin/env python3
"""Extra Terram — scripts/gen-map-thumbs.py v0.1.0 — a wide strip of every painted map for the level pickers

  python scripts/gen-map-thumbs.py          write public/maps/thumbs/<map>.jpg (640 x 200, JPEG 80) for every map
  python scripts/gen-map-thumbs.py --force  rewrite the ones that are already newer than their map

Each strip is the map's middle band at full width (the part with the most trail), so a level button
shows the world it is played on. Part of `npm run art`; needs Pillow.
"""
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MAPS = ROOT / "public" / "maps"
OUT = MAPS / "thumbs"
W, H = 640, 200


def main() -> None:
    force = "--force" in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)
    n = 0
    for src in sorted(MAPS.glob("*.jpg")):
        dst = OUT / src.name
        if not force and dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
            continue
        im = Image.open(src).convert("RGB")
        w, h = im.size
        band = round(w * H / W)  # the strip keeps the map's own pixels per unit: full width, a band this tall
        top = (h - band) // 2
        im.crop((0, top, w, top + band)).resize((W, H), Image.LANCZOS).save(dst, "JPEG", quality=80, optimize=True, progressive=True)
        n += 1
        print(f"{dst.relative_to(ROOT).as_posix()}  {dst.stat().st_size // 1024} KB")
    print(f"{n} strip(s) written to {OUT.relative_to(ROOT).as_posix()}/")


if __name__ == "__main__":
    main()
