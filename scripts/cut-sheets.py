#!/usr/bin/env python3
"""Extra Terram — scripts/cut-sheets.py v0.2.0 — cut game sprites out of the concept sheets (all four races)

The art pack (art/concept-sheets/*.png) is four labelled sheets on fake-transparency checkerboards,
not individual sprites. This script knows where each usable unit sits on those sheets, cuts it out,
removes the checkerboard to true alpha, rotates projectiles to point right, and drops the result in
public/sprites/_inbox/ for `python scripts/sprites.py --fit` to place and list.

Mapping decided on 2026-10-23 (swap folders if you prefer a different one):
  sheet 01, Rootkin column 1 (broad, stout, wide caps)  -> ironbark   t1 / t2 / t3a / t3b
  sheet 01, Rootkin column 2 (drooping vines)            -> weepvine   t1 / t2 / t3a / t3b
  sheet 01, Rootkin column 3 (narrow, pointed tops)      -> needlespire t1 / t2 / t3a / t3b
  sheet 01, Rootkin turret row, right-pointing cannon    -> ironbark   turret-t1 … turret-t3b
  sheet 02, Assembly creep row (facing right)            -> compactor, dump-hauler, dozer
  sheet 02, Rootkin projectiles (pointing up-right)      -> needlespire and ironbark projectile
  sheet 01, Assembly columns 1/2/3                       -> nailgun / pile-driver / mortar; turret row col 3 -> pile-driver turret
  sheet 01, Chitin columns 1/2/3                         -> spitter / mandible / acid-bloat
  sheet 01, Lumenari columns 1/2/3                       -> prism / lance / nova
  sheet 02, creep rows (facing right)                    -> rootkin, chitin and lumenari creeps
  sheet 01, projectile row                               -> one projectile per tower that fires one

Usage: python scripts/cut-sheets.py   then   python scripts/sprites.py --fit
"""
from pathlib import Path

import sys

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parent.parent
SHEETS = ROOT / "art" / "concept-sheets"
INBOX = ROOT / "public" / "sprites" / "_inbox"

S01 = SHEETS / "01_sprite_atlas_overview.png"
S02 = SHEETS / "02_four_faction_asset_sheet.png"

# (sheet, crop box, destination relative to _inbox, rotation degrees counter-clockwise)
CUTS = [
    # Ironbark: column 1
    (S01, (196, 84, 294, 182), "rootkin/ironbark/t1.png", 0),
    (S01, (196, 184, 294, 284), "rootkin/ironbark/t2.png", 0),
    (S01, (196, 288, 294, 392), "rootkin/ironbark/t3a.png", 0),
    (S01, (196, 396, 294, 498), "rootkin/ironbark/t3b.png", 0),
    # Weepvine: column 2
    (S01, (300, 84, 400, 182), "rootkin/weepvine/t1.png", 0),
    (S01, (300, 184, 400, 284), "rootkin/weepvine/t2.png", 0),
    (S01, (300, 288, 400, 392), "rootkin/weepvine/t3a.png", 0),
    (S01, (300, 396, 400, 498), "rootkin/weepvine/t3b.png", 0),
    # Needlespire: column 3
    (S01, (404, 84, 502, 182), "rootkin/needlespire/t1.png", 0),
    (S01, (404, 184, 502, 284), "rootkin/needlespire/t2.png", 0),
    (S01, (404, 288, 502, 392), "rootkin/needlespire/t3a.png", 0),
    (S01, (404, 396, 502, 498), "rootkin/needlespire/t3b.png", 0),
    # Ironbark pod cannon (sheet 02, labelled IRONBARK): points down-left on the sheet, rotated to point right.
    # The same image serves every tier for now.
    (S02, (700, 92, 822, 178), "rootkin/ironbark/turret-t1.png", 135),
    (S02, (700, 92, 822, 178), "rootkin/ironbark/turret-t2.png", 135),
    (S02, (700, 92, 822, 178), "rootkin/ironbark/turret-t3a.png", 135),
    (S02, (700, 92, 822, 178), "rootkin/ironbark/turret-t3b.png", 135),
    # Assembly creeps, facing right. The row label sits just above the first two; ERASE clears it.
    (S02, (432, 944, 492, 1012), "assembly/creeps/compactor.png", 0),
    (S02, (498, 930, 600, 1012), "assembly/creeps/dump-hauler.png", 0),
    (S02, (612, 930, 724, 1012), "assembly/creeps/dozer.png", 0),
    # Projectiles point up-right on the sheet; rotate to point right
    (S02, (1158, 92, 1228, 142), "rootkin/needlespire/projectile.png", -45),
    (S02, (1082, 92, 1140, 142), "rootkin/ironbark/projectile.png", -45),
]


ROWS = {"t1": (84, 182), "t2": (184, 284), "t3a": (288, 392), "t3b": (396, 498)}
COLS = {
    "assembly": {"nailgun": (522, 618), "pile-driver": (628, 722), "mortar": (732, 826)},
    "chitin": {"spitter": (842, 938), "mandible": (946, 1042), "acid-bloat": (1052, 1150)},
    "lumenari": {"prism": (1196, 1292), "lance": (1298, 1396), "nova": (1402, 1500)},
}
for race, towers in COLS.items():
    for tower, (x0, x1) in towers.items():
        for state, (y0, y1) in ROWS.items():
            CUTS.append((S01, (x0, y0, x1, y1), f"{race}/{tower}/{state}.png", 0))
# the Assembly cannon in the turret row points right already
for state in ("t1", "t2", "t3a", "t3b"):
    CUTS.append((S01, (732, 500, 826, 592), f"assembly/pile-driver/turret-{state}.png", 0))
# projectiles on sheet 01 point up-right
CUTS += [
    (S01, (522, 700, 618, 772), "assembly/nailgun/projectile.png", -40),
    (S01, (628, 700, 722, 772), "assembly/mortar/projectile.png", -40),
    (S01, (732, 700, 826, 772), "assembly/pile-driver/projectile.png", -40),
    (S01, (842, 700, 938, 772), "chitin/spitter/projectile.png", -40),
    (S01, (946, 700, 1042, 772), "chitin/stalker-eye/projectile.png", -40),
    (S01, (1052, 700, 1150, 772), "chitin/acid-bloat/projectile.png", -40),
    (S01, (1196, 700, 1292, 772), "lumenari/nova/projectile.png", -40),
]
# creeps on sheet 02, facing right
CUTS += [
    (S02, (76, 942, 164, 1012), "rootkin/creeps/thornbeast.png", 0),
    (S02, (168, 942, 256, 1012), "rootkin/creeps/seedling.png", 0),
    (S02, (256, 934, 384, 1012), "rootkin/creeps/rootwalker.png", 0),
    (S02, (798, 946, 862, 1012), "chitin/creeps/skitterling.png", 0),
    (S02, (880, 934, 968, 1012), "chitin/creeps/carapace-beetle.png", 0),
    (S02, (986, 934, 1102, 1012), "chitin/creeps/siege-beetle.png", 0),
    (S02, (1176, 946, 1238, 1012), "lumenari/creeps/wisp.png", 0),
    (S02, (1260, 934, 1334, 1012), "lumenari/creeps/sentinel.png", 0),
    (S02, (1368, 934, 1470, 1012), "lumenari/creeps/bastion.png", 0),
]

# Sheet regions to blank out before cutting (labels that overlap a crop), in sheet coordinates.
ERASE = {S02: [(430, 920, 526, 944), (40, 918, 132, 944), (784, 918, 884, 946), (1144, 918, 1242, 946)]}

from cut_sheets_lib import despeckle, remove_checker  # noqa: E402


def main() -> None:
    if not S01.exists() or not S02.exists():
        raise SystemExit(f"concept sheets not found under {SHEETS}")
    sheets = {S01: Image.open(S01).convert("RGB"), S02: Image.open(S02).convert("RGB")}
    for sheet, boxes in ERASE.items():
        for b in boxes:
            sheets[sheet].paste((253, 253, 253), b)
    for sheet, box, rel, rot in CUTS:
        crop = sheets[sheet].crop(box)
        sprite = despeckle(remove_checker(crop))
        if rot:
            sprite = sprite.rotate(rot, resample=Image.BICUBIC, expand=True)
        bbox = sprite.getbbox()
        if bbox:
            sprite = sprite.crop(bbox)
        dst = INBOX / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        sprite.save(dst, optimize=True)
        print(f"cut {rel}: {sprite.width}x{sprite.height}")


if __name__ == "__main__":
    main()
