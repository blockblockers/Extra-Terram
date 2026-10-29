# Extra Terram — Six Multiplayer Maps (October 27, 2026)

## What this ZIP contains

Six individually constructed multiplayer map paintings following **the supplied v0.13.0 JSON layouts and templates**. Each environment uses richer painted material from the approved solo-world art plus coordinate-locked trails, platforms, goals and gates; identical lanes share the same scenic strip. The image-generation concept artwork was used as a *style reference*, not as map geometry.

### Direct game drop

Unzip **`public/maps/`** over the matching paths in your game branch. For multiplayer in v0.13.0, the `.jpg` files match the existing game filenames; the `.png` files are full-fidelity painting masters. If a future generator overwrites backgrounds, mark these files as painted in that branch's **`art/maps/painted.json`** according to its supported schema; this manifest was not part of the provided v0.13.0 project and is not invented here.

### Maps

| Map | File stem | PNG size | Pads |
| --- | --- | --- | --- |
| Foundry Crown | `king-2-foundry` | 1664×2048 | 32 |
| Elder Fork | `king-3-elderfork` | 1664×2304 | 37 |
| Crystal Throne | `king-4-throne` | **1664×2560** | 38 |
| Twin Hollows | `lanes-2-hollows` | 1536×2048 | 20 |
| Three Rivers of Light | `lanes-3-prism` | 1536×2304 | 27 |
| Four Warrens | `lanes-4-warrens` | 1536×2560 | 32 |

> The Crystal Throne PDF table states 1664×2432, but its v0.13.0 layout JSON and template are 1664×2560. **The project geometry wins.**

### Editable source

- `editable/<id>.ora`: OpenRaster (Krita / GIMP) with seven separated layers.
- `editable/<id>/layer-00.png` to `layer-06.png`: transparent editable originals and an environment base.
- `editable/<id>/locked-route-mask.png` and `locked-platform-mask.png`: authoritative geometry masks. **Never reposition them.**
- `reference/*-layout.json`, `*-overlay@2x.png`, `*-guide@2x.png`: coordinate and visual alignment references.

### QA and limitations

- Built from the exact v0.13.0 layout cell centers; all 6 centerline masks pass an independent cell-center check, no pad masks overlap a path.
- The project checker reports no absent platforms on any map and zero weak trail cells on five of six.
- **Crystal Throne E9** is an advisory weak score at a legitimate route fork; the checker sampled another connected trail on its side. See the check overlay; this is *not* a missing painted path cell.
- The checker could not numerically resolve straight-run centering on these textured surfaces, so we include full-size overlay images for visual inspection.
- We repaired inherited near-white strips along some source-world image edges.
- We have **not run the game itself or the planned v0.15.0 code release**, and this is a visually rich art draft rather than independently artist-approved final art.

### Compatibility

The existing turret, boss, projectile, UI icon and effect code work remains with the project's developer: this ZIP is **map artwork only** and does not purport to implement the planned v0.15.0 code changes.
