// Extra Terram — src/render/renderer.ts v0.1.0 — Phase 1 scaffold
// The thin interface the app drives. PixiRenderer is the one implementation today; keeping the
// surface small means a Canvas 2D fallback or a different engine could slot in without touching
// the sim or the UI.
import type { SimContext, SimState } from '../engine';

export interface Cell {
  col: number;
  row: number;
}

export interface RenderOverlay {
  /** Cell under the pointer, if any. */
  hover: Cell | null;
  /** Tower def id being placed, if the player is in placement mode. */
  placing: string | null;
  /** Selected tower id, if any (draws its range ring). */
  selected: number | null;
  /** Show every build pad (true while placing or when the player turns the grid on). */
  showPads: boolean;
}

export interface RenderFrame {
  state: SimState;
  ctx: SimContext;
  /** 0..1 position between the previous tick and the current one. */
  alpha: number;
  overlay: RenderOverlay;
}

export interface Renderer {
  mount(canvas: HTMLCanvasElement, width: number, height: number, ctx: SimContext): Promise<void>;
  resize(width: number, height: number): void;
  draw(frame: RenderFrame): void;
  /** Map a pointer position (CSS pixels relative to the viewport) to a board cell, or null when outside the board. */
  screenToCell(clientX: number, clientY: number): Cell | null;
  destroy(): void;
}
