#!/usr/bin/env python3
"""Extra Terram — scripts/gen-icons.py v0.1.0 — Phase 1 scaffold

Placeholder PWA icons: a Rootkin spire on a dark grove background, drawn at 512 and scaled to 192.
Replace with real art in Phase 2; keep the maskable-safe inset (content inside the central 80%).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "icons"


def draw(size: int) -> Image.Image:
    s = size
    img = Image.new("RGBA", (s, s), (6, 16, 11, 255))
    d = ImageDraw.Draw(img)
    # soft moss glow behind the spire
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([s * 0.18, s * 0.22, s * 0.82, s * 0.86], fill=(63, 143, 58, 120))
    glow = glow.filter(ImageFilter.GaussianBlur(s * 0.08))
    img = Image.alpha_composite(img, glow)
    d = ImageDraw.Draw(img)
    # trunk
    d.rounded_rectangle([s * 0.46, s * 0.58, s * 0.54, s * 0.80], radius=s * 0.02, fill=(107, 74, 43, 255))
    # three stacked needle tiers, widest at the bottom
    tiers = [(0.26, 0.74, 0.62), (0.31, 0.64, 0.50), (0.36, 0.54, 0.38)]
    for i, (left, right, base) in enumerate(tiers):
        top = base - 0.16
        shade = (63 + i * 18, 143 + i * 20, 58 + i * 10, 255)
        d.polygon([(s * 0.5, s * top), (s * right, s * base), (s * left, s * base)], fill=shade)
    # sap orb at the tip
    d.ellipse([s * 0.455, s * 0.165, s * 0.545, s * 0.255], fill=(232, 195, 58, 255))
    return img


OUT.mkdir(parents=True, exist_ok=True)
base = draw(512)
base.save(OUT / "icon-512.png", optimize=True)
base.resize((192, 192), Image.LANCZOS).save(OUT / "icon-192.png", optimize=True)
print(f"wrote {OUT.relative_to(ROOT)}/icon-512.png and icon-192.png")
