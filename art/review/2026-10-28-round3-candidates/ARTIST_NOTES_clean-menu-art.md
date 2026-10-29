# Extra Terram v0.17.0 — UI-free title-art update

This package addresses the 2026-10-28 title key-art README inside the supplied v0.17.0 ZIP.

## Installation

Copy the following paths over a development branch of `extra-terram-v0.17.0`:

- `public/art/title.jpg` — UI-free 16:9 landscape art, **3344 × 1882**. No baked title, buttons, account HUD or race bar; bottom 11% darkened for live UI.
- `public/art/title-portrait.jpg` — 3:4 phone companion, **1536 × 2048**. No baked UI, calm upper sky and dark lower foreground.
- `src/ui/Menu.tsx` — render an accessible, live landscape title instead of the hidden heading. Buttons remain real React buttons.
- `src/ui/Title.tsx` — preload the appropriate landscape/portrait background.
- `src/styles/index.css` — landscape and portrait sources selected by aspect ratio, fixed viewport and `cover` (no stretching); buttons and gold/cyan/teal bevels now painted in CSS; the old blurred ambient background is eliminated.
- `scripts/check-sprites.py` — recognizes both formats and checks each image's dimensions and bottom darkness.

Alternatively apply `patches/v0170-clean-menu-ui.patch` for the four code files and copy the two JPGs.

## Original painting fidelity and source-resolution limitations

The landscape recreates the approved scene's **four-faction visual story** (Rootkin tree, Assembly cannon, Chitin on trail, Lumenari crystal structure, planets and waterfalls) but is **not pixel-identical** to the original painting. Its left-side scenery was re-composed to replace painted UI with continuous world art.

The landscape image was generated at 1672 × 941, enhanced and resampled to the exact 3344 × 1882 target; it is **not an independently painted native 2× master**. The portrait was re-composed from a companion generated concept panel and enhanced/resampled to 1536 × 2048; it likewise is **not native-resolution 1536-pixel painting**. They satisfy required dimensions and visual framing but native high-DPI repainting remains a potential further enhancement.

The old dark teal plate, gold bevel, and cyan Play border remain a CSS design reference. No old menu terms such as 'Research' or 'Collection' are painted into the backgrounds.

## Technical checks completed

- `check-sprites.py` (v0.17.1 patch) against the two delivered JPGs: **2 OK, 0 warnings, 0 failures**.
- Dimensions: landscape **3344×1882**, portrait **1536×2048**.
- Bottom 11% mean luma: landscape around **4**, portrait around **3** (checker warning threshold 30).
- TypeScript source parsed/transpiled with the globally installed compiler: **no syntax errors**.
- Static Chromium smoke previews (CSS and simulated interactive controls) rendered at **1600×900, 915×412 and 412×915**. They are **layout smoke tests, not full React game screens**.
- The full npm dependency installation timed out in this sandbox, so `npm run build`, live menu functionality and actual in-game pixel-perfect verification are **not claimed**.

## Suggested integration test

1. On a branch with Node 22 and network access run `npm ci`.
2. Copy the two JPGs and all four patched code files.
3. Run `npm run check-sprites -- <drop-folder>` where the folder contains `public/art/title.jpg` and `title-portrait.jpg`.
4. Run `npm run build` and `npm run lint`.
5. Verify desktop 16:9 / ultrawide, landscape phone, portrait phone and all submenu expansions.
6. Confirm that the menu title, button labels and account overlays remain crisp at different viewport sizes, no image distortion occurs, and the portrait quick bar stays readable.

## Files

`qa/landscape-before-after.jpg`: old baked-UI backdrop vs new clean world art.
`qa/landscape-ui-smoke.jpg`: example desktop live-button layout (illustrative static smoke rendering).
`qa/portrait-ui-smoke.jpg`: example portrait crop and quick bar (illustrative static smoke rendering).
`qa/phone-landscape-ui-smoke.jpg`: example landscape phone layout.
`qa/portrait-preview.jpg`: clean portrait without UI.
`art/key-art/`: editable-lossless image masters, for future enhancements.
