// Extra Terram — src/render/anim.ts v0.5.0 — a tiny strip player, driven by the frame loop, no Pixi ticker
// One Player per sprite. A looping strip (idle, walk) runs continuously; a one-shot strip (fire, die)
// interrupts it and hands back when done. Time is in sim ticks (20 Hz) so playback follows the game
// speed buttons, and nothing advances while the game is paused.
import type { Sprite, Texture } from 'pixi.js';
import { TICK_RATE } from '../engine';
import type { Strip } from './sprites';

export class StripPlayer {
  private loop: Strip | null;
  private once: Strip | null = null;
  private t = 0; // seconds into the current strip
  private still: Texture;
  /** Speed multiplier for the loop (a fast creep walks faster). */
  rate = 1;

  constructor(
    private sprite: Sprite,
    still: Texture,
    loop: Strip | null,
    phase = 0,
  ) {
    this.still = still;
    this.loop = loop;
    this.t = phase;
    this.apply();
  }

  /** True when any strip is attached, so the renderer can skip procedural motion. */
  get animated(): boolean {
    return this.loop !== null || this.once !== null;
  }

  get playingOnce(): boolean {
    return this.once !== null;
  }

  /** Play a one-shot strip from its first frame. */
  play(strip: Strip | null): void {
    if (!strip) return;
    this.once = strip;
    this.t = 0;
    this.apply();
  }

  /** Advance by dt ticks and set the sprite's texture. */
  update(dtTicks: number): void {
    const dt = dtTicks / TICK_RATE;
    if (this.once) {
      this.t += dt;
      const n = this.once.frames.length;
      const i = Math.floor(this.t * this.once.fps);
      if (i >= n) {
        this.once = null;
        this.t = 0;
      }
    } else if (this.loop) {
      this.t += dt * this.rate;
    }
    this.apply();
  }

  private apply(): void {
    if (this.once) {
      const i = Math.min(this.once.frames.length - 1, Math.floor(this.t * this.once.fps));
      this.sprite.texture = this.once.frames[i];
    } else if (this.loop) {
      const n = this.loop.frames.length;
      const i = Math.floor(this.t * this.loop.fps) % n;
      this.sprite.texture = this.loop.frames[i];
    } else if (this.sprite.texture !== this.still) {
      this.sprite.texture = this.still;
    }
  }
}
