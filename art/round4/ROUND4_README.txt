EXTRA TERRAM — ROUND 4 ART UPDATE

What changed
- Replaced the embedded-lettering title image with a clean cinematic background. The app's live title text in src/ui/Menu.tsx remains the source of the correct brand spelling, “Extra Terram”.
- Added public/art/title@2x.jpg at 3072 × 4096 alongside title.jpg at 1536 × 2048.
- Applied a restrained material shading, faction tint, and microtexture pass to the 64 existing tower states for the 16 previously-placeholder tower families. Canvas size, alpha channel, silhouette, and filenames are preserved.
- Added scripts/round4-art-polish.py and art/round4-art-inventory.json so the pass can be reproduced and audited.

Important limitation
The tower update is a procedural shading/texture refinement, not a hand-painted or newly generated painterly repaint. The base designs still have their existing silhouettes. The map backgrounds were not changed in this pass because their paths and build-pad positions must remain tied to the game's layout data.

Validation
- All 64 tower states decode as RGBA PNGs and remain 256 × 256.
- Title artwork is 1536 × 2048; @2x artwork is 3072 × 4096.
- Existing sprite filenames and manifest paths are unchanged.
- Full Vite/TypeScript build not claimed; run npm ci followed by npm run build in the project environment.
