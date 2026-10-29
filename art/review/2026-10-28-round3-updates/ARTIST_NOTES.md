# Extra Terram — Round 3 targeted updates + title-backdrop fix

**Reviewed against:** `Extra-Terram — Art Handoff: Round 3` (Oct. 28, 2026) and updated v0.15.2 rework review. The only editable game project supplied was **v0.15.1**, whereas the handoff says the game is now **v0.15.3**. Do not indiscriminately replace newer code or maps.

## What was accepted in v0.15.3 (do not reinstall old rejected work)
- Batch A v3: all 94 files accepted.
- Batch B: **all 74 files rejected**. Do not use our earlier `extra-terram-batch-B-*` packages. The checker could not distinguish authentic grown tower mass from pasted-on decorations.
- Batch C: 18 files accepted, including the dark tar field and creep cleanup. Salvage Rig and some other crop/painting fixes remain outstanding.
- Batch D: all four map replacements accepted.
- Current handoff metrics: 14/28 tower families passing all strict rules; 16/16 creeps; 10/10 maps aligned; 212/212 strips with measurable motion.

## Production-safe candidates (relative paths in this ZIP)
- `public/art/title.jpg` — same approved text-free four-faction painting, gently reprocessed from the existing 2× source. **Not falsely represented as brand-new native painted art.**
- `public/art/title@2x.jpg` — 3072×4096 master for high-DPI displays. Referenced by the version-sensitive title component patch below.
- `public/sprites/assembly/salvage-rig/t3a.png`, `t3b.png` and corresponding `*-idle.png` — remove only the fake white/checkerboard matte between crane supports; original bodies and material remain. Frame 0 of each updated idle strip exactly matches the new still.

## Version-sensitive files (REVIEW BEFORE APPLYING TO v0.15.3)
- `patches/Title.tsx.patch`, `version-sensitive-review/src/ui/Title.tsx` — **important menu fix**: the painting is fixed to the **viewport** (`100svh`) instead of growing with scrollable menu content, intro transform-scale removed, vertical overflow remains scrollable, and the high-DPI asset is used. The title and buttons stay LIVE React UI, never baked into the painting. The full source file is based on v0.15.1, so apply/merge the patch to the latest Title.tsx rather than overwriting v0.15.3 wholesale.
- `patches/check-sprites.py.patch`, `version-sensitive-review/scripts/check-sprites.py` — teaching the validator that `public/art/title@2x.jpg` is a deliberate 3072×4096 high-DPI companion. Otherwise the older checker reports an 'unknown asset' false failure.
- `version-sensitive-review/public/maps/chitin-hive-01.jpg` — **optional candidate only**. Cooler and less saturated purple ground/pad environs while retaining exact route and socket positions. It was based on the supplied v0.15.1 map and must be visually compared against v0.15.3 before adoption, to avoid reverting a newer map color treatment. Use the baseline v0.15.3 map for final recompositing if it differs.

## QA
- `qa/check-map-report.txt`: Chitin candidate **ALIGNED**, 46/46 path cells without weak trails, 24/24 visible pads, straight centering not automatically measurable.
- `qa/check-sprites-report.txt`: seven public assets checked, **zero FAILS** under the paired updated checker. The two Salvage Rig still WARN messages (x-centering and a straight left crop edge) are inherited from the original artwork; no new warnings. The map is intentionally checked by check-map rather than check-sprites.
- `qa/salvage-before-after.jpg`, `qa/chitin-before-after.jpg`, `qa/title-before-after.jpg`: comparisons.
- `qa/map-check/`: overlay and socket contact sheet.

## Still NOT solved — Round 3 bespoke art brief
These require newly painted body geometry, not automatic fins/hoses/discs: Mortar/Pile Driver T1 similarity 0.91 vs target 0.70, T3 branch pairs for nine families, Chitin T1 silhouettes, realistic shading of A-v3 overpaints, Solar Collector T3B 1.34× vs 1.35×, and source-clipped Resin Nest/Pheromone Node T3A/B. Elder Fork and Crystal Throne also need eventual continuous environmental repaint; no attempt is made here to claim those are done. The original uncropped source sheets and current v0.15.3 project are needed to finish the last crop and scene fixes accurately.

## Testing after merging
1. Merge the title component patch into the actual v0.15.3 source. Add both `public/art` title files. Do not delete the live title lockup.
2. Compare menu backgrounds on a 390×844 phone: title, long submenu, scroll, back, landscape. Background should remain identical scale during each transition.
3. Validate `npm run check-sprites -- <drop>` with the updated checker, `npm run check-art -- all --drop <drop>`, and review `art-preview` and game UI in the current v0.15.3 build. The provided project did not contain dependencies and full v0.15.3 runtime tests were **not run here**.
