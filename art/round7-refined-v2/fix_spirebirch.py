"""Remove the spire tip (and its fading base) from Spirebirch's turret art, so the part that turns
is the ring, the thorn launcher and the leaves only; the body keeps its own spire.
Usage: python fix_spirebirch.py <spirebirch folder> [--preview out.png]"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image

folder = Path(sys.argv[1])
preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None

def fix_frame(fr: np.ndarray) -> tuple:
    a = fr.copy()
    r, g, b, al = [a[..., i].astype(int) for i in range(4)]
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    band = (xx >= 54) & (xx <= 74)
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    leaf = (g > r + 12) & (g > b + 12)
    dark = lum < 60
    above = band & (yy < 53) & (al > 0) & ~leaf & ~dark
    below = band & (yy > 79) & (al > 0)
    kill = above | below
    a[kill, 3] = 0
    return a, int(kill.sum())

out_prev = []
for p in sorted(folder.glob('turret-*.png')):
    img = Image.open(p).convert('RGBA')
    arr = np.asarray(img)
    size = img.height
    n = img.width // size
    frames = []
    total = 0
    for i in range(n):
        fr, k = fix_frame(arr[:, i * size:(i + 1) * size])
        frames.append(fr)
        total += k
    new = np.concatenate(frames, axis=1)
    out = Image.fromarray(new.astype(np.uint8), 'RGBA')
    if preview:
        out_prev.append((p.name, img, out))
    else:
        out.save(p, optimize=True)
    print(f'{p.name}: {total} px of spire removed over {n} frame(s)')

if preview:
    rows = []
    for name, before, after in out_prev:
        w, h = before.size
        row = Image.new('RGBA', (w * 2 + 8, h), (40, 60, 70, 255))
        row.alpha_composite(before, (0, 0)); row.alpha_composite(after, (w + 8, 0))
        rows.append(row.resize((row.width * 2, row.height * 2), Image.NEAREST))
    W = max(r.width for r in rows); H = sum(r.height + 4 for r in rows)
    s = Image.new('RGBA', (W, H), (0, 0, 0, 255)); y = 0
    for r in rows:
        s.alpha_composite(r, (0, y)); y += r.height + 4
    s.convert('RGB').save(preview, quality=88)
