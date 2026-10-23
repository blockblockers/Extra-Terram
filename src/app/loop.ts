// Extra Terram — src/app/loop.ts v0.1.0 — Phase 1 scaffold
// The requestAnimationFrame loop: fixed-timestep sim (20 Hz), interpolated render, fast-forward,
// pause on backgrounding, and the heat controls (fps cap, no frames while nothing moves).
import { TICK_RATE } from '../engine';

const TICK_MS = 1000 / TICK_RATE;
const MAX_TICKS_PER_FRAME = 12; // after a long stall, catch up this much and drop the rest

export interface LoopHooks {
  /** Advance the sim by one tick. */
  step(): void;
  /** Draw a frame; alpha is 0..1 between the previous tick and the current one. */
  render(alpha: number): void;
  /** True while something on the board moves; false lets the loop skip frames between waves. */
  isAnimating(): boolean;
  /** Called when the loop pauses itself (tab hidden, app backgrounded). */
  onAutoPause?(): void;
}

export class GameLoop {
  /** Sim speed multiplier: 1, 2 or 3. Only the sim runs faster; the render rate is capped separately. */
  speed = 1;
  paused = false;
  /** Render cap. 60 for smooth, 30 for the battery setting. */
  maxFps = 60;
  /** Set when the overlay (hover, selection, placement) changed and a frame is owed even if nothing moves. */
  dirty = true;

  private acc = 0;
  private last = 0;
  private lastRender = 0;
  private alpha = 0;
  private raf = 0;
  private running = false;

  constructor(private hooks: LoopHooks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.lastRender = 0;
    document.addEventListener('visibilitychange', this.onVisibility);
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    cancelAnimationFrame(this.raf);
  }

  private onVisibility = (): void => {
    if (document.hidden && !this.paused) {
      this.paused = true;
      this.hooks.onAutoPause?.();
    }
  };

  private frame = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(now - this.last, 250);
    this.last = now;

    let ticked = false;
    if (!this.paused) {
      this.acc += dt * this.speed;
      let n = 0;
      while (this.acc >= TICK_MS && n < MAX_TICKS_PER_FRAME) {
        this.hooks.step();
        this.acc -= TICK_MS;
        n++;
      }
      if (n === MAX_TICKS_PER_FRAME) this.acc = 0; // never spiral after a stall
      ticked = n > 0;
      this.alpha = this.acc / TICK_MS;
    }

    const wantFrame = this.dirty || (ticked && this.hooks.isAnimating());
    const minInterval = 1000 / this.maxFps - 2;
    if (wantFrame && now - this.lastRender >= minInterval) {
      this.hooks.render(this.alpha);
      this.lastRender = now;
      this.dirty = false;
    }
    this.raf = requestAnimationFrame(this.frame);
  };
}
