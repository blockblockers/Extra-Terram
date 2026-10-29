// Extra Terram — src/render/paintedFx.ts v0.2.0 — painted effects keep their board position and are drawn where the camera projects them
// Optional art from public/sprites/<race>/fx/. Each event gets the painted version when its file is
// loaded and a pooled sprite is free; otherwise `handle` returns false and the code-drawn particles
// (effects.ts) draw it as before, so every effect falls back on its own. Fixed pools, time in sim
// ticks (follows game speed and pause), nothing touches the simulation.
import { Container, NineSliceSprite, Sprite, Texture } from 'pixi.js';
import type { DamageType, SimEvent, TowerDef } from '../engine';
import type { Project } from './effects';
import type { SpriteLibrary, Strip } from './sprites';

const TILE = 64;
const TICKS_PER_SECOND = 20;
const RACE_OF_DAMAGE: Record<DamageType, string> = { thorn: 'rootkin', kinetic: 'assembly', acid: 'chitin', energy: 'lumenari' };

/** Where a tower's shots leave it right now, as the renderer sees it. */
export interface TowerPose {
  def: TowerDef;
  /** The tower's cell centre, board px. */
  cx: number;
  cy: number;
  /** The turret pivot (turret towers) or the emitter (the rest), board px. */
  mx: number;
  my: number;
  /** Turret towers: the barrel's current angle and the muzzle's distance from the pivot; else null and 0. */
  aim: number | null;
  reach: number;
}

interface Beam {
  sprite: NineSliceSprite;
  life: number;
  maxLife: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  thick: number;
}

interface Burst {
  sprite: Sprite;
  strip: Strip;
  t: number; // seconds into the strip
  x: number;
  y: number;
  size: number;
}

interface Flash {
  sprite: Sprite;
  life: number;
  maxLife: number;
  tower: number;
  angle: number; // used when the tower has no turret
}

export class PaintedFx {
  /** Beams and muzzle flashes: light, added on top. */
  readonly additive = new Container();
  /** Impacts and bites. */
  readonly normal = new Container();
  /** 1 = full budget, 0.5 = battery saver. */
  scale = 1;
  private beams: Beam[] = [];
  private freeBeams: NineSliceSprite[] = [];
  private bursts: Burst[] = [];
  private freeBursts: Sprite[] = [];
  private flashes: Flash[] = [];
  private freeFlashes: Sprite[] = [];
  private made = { beams: 0, bursts: 0, flashes: 0 };
  private flashCount = 0;
  private rng = 0x2545f491;

  constructor(
    private lib: SpriteLibrary,
    private pose: (towerId: number) => TowerPose | null,
    private project: Project = (x, y) => ({ x, y, s: 1 }),
    private caps = { beams: 24, bursts: 40, flashes: 16 },
  ) {
    this.additive.blendMode = 'add';
  }

  private rand(): number {
    this.rng = (Math.imul(this.rng ^ (this.rng >>> 15), 0x2c1b3c6d) ^ ((this.rng ^ (this.rng >>> 15)) >>> 12)) >>> 0;
    return this.rng / 4294967296;
  }

  /** Draw the painted version of this event; false when there is none (no art, or the pool is full). */
  handle(ev: SimEvent): boolean {
    switch (ev.kind) {
      case 'fire':
        return this.muzzle(ev.tower, ev.x * TILE, ev.y * TILE, ev.tx * TILE, ev.ty * TILE);
      case 'beam':
        return this.beam(ev.tower, ev.x * TILE, ev.y * TILE, ev.tx * TILE, ev.ty * TILE, !!ev.alpha);
      case 'hit':
        return this.impact(ev.x * TILE, ev.y * TILE, ev.damageType, ev.splash);
      default:
        return false;
    }
  }

  // ------------------------------------------------------------ pools

  private takeBeam(): NineSliceSprite | null {
    let s = this.freeBeams.pop();
    if (!s && this.made.beams < this.caps.beams) {
      s = new NineSliceSprite({ texture: Texture.WHITE, leftWidth: 16, rightWidth: 16, topHeight: 0, bottomHeight: 0 });
      s.blendMode = 'add';
      this.additive.addChild(s);
      this.made.beams++;
    }
    return s ?? null;
  }

  private takeBurst(): Sprite | null {
    const cap = Math.max(4, Math.round(this.caps.bursts * this.scale));
    if (this.bursts.length >= cap) return null;
    let s = this.freeBursts.pop();
    if (!s && this.made.bursts < this.caps.bursts) {
      s = new Sprite(Texture.WHITE);
      s.anchor.set(0.5);
      this.normal.addChild(s);
      this.made.bursts++;
    }
    return s ?? null;
  }

  private takeFlash(): Sprite | null {
    let s = this.freeFlashes.pop();
    if (!s && this.made.flashes < this.caps.flashes) {
      s = new Sprite(Texture.WHITE);
      s.anchor.set(0, 0.5); // the flash's root, (0, 32) on its 128 x 64 canvas
      s.blendMode = 'add';
      this.additive.addChild(s);
      this.made.flashes++;
    }
    return s ?? null;
  }

  // ------------------------------------------------------------ effects

  private muzzle(tower: number, x: number, y: number, tx: number, ty: number): boolean {
    const p = this.pose(tower);
    if (!p) return false;
    const tex = this.lib.fx(p.def.race, 'muzzle');
    if (!tex) return false;
    this.flashCount++;
    if (this.scale < 1 && this.flashCount % 2 === 0) return true; // battery saver: every other flash, none drawn by code either
    const s = this.takeFlash();
    if (!s) return false;
    s.texture = tex;
    s.visible = true;
    s.alpha = 1;
    const angle = Math.atan2(ty - (p.aim === null ? p.my : y), tx - (p.aim === null ? p.mx : x));
    this.flashes.push({ sprite: s, life: 4, maxLife: 4, tower, angle });
    this.placeFlash(this.flashes[this.flashes.length - 1]);
    return true;
  }

  private placeFlash(f: Flash): void {
    const p = this.pose(f.tower);
    if (!p) return; // the tower is gone: the flash stays where it was and fades
    const bx = p.aim !== null ? p.mx + Math.cos(p.aim) * p.reach : p.mx;
    const by = p.aim !== null ? p.my + Math.sin(p.aim) * p.reach : p.my;
    const q = this.project(bx, by);
    f.sprite.position.set(q.x, q.y);
    f.sprite.width = TILE * 0.6 * q.s;
    f.sprite.height = TILE * 0.3 * q.s;
    f.sprite.rotation = p.aim !== null ? p.aim : f.angle;
  }

  private beam(tower: number, x0: number, y0: number, x1: number, y1: number, alpha: boolean): boolean {
    const p = this.pose(tower);
    if (!p) return false;
    const bite = this.lib.fxStrip(p.def.race, `bite-${p.def.id}`);
    if (bite) return this.burst(bite, x1, y1, TILE, 0);
    const tex = this.lib.fx(p.def.race, `beam-${p.def.id}`);
    if (!tex) return false;
    // the first segment of a chain starts at the tower: from its emitter rather than the ground under it
    if (Math.abs(x0 - p.cx) < 1 && Math.abs(y0 - p.cy) < 1) {
      x0 = p.mx;
      y0 = p.my;
    }
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 2) return true;
    const s = this.takeBeam();
    if (!s) return false;
    s.texture = tex;
    // texture pixels at half scale: 32 px of art = 16 board px thick (24 for an overcharged alpha shot)
    const thick = alpha ? 48 : 32;
    s.visible = true;
    s.alpha = 1;
    const beam: Beam = { sprite: s, life: 5, maxLife: 5, x0, y0, x1, y1, thick };
    this.placeBeam(beam);
    this.beams.push(beam);
    return true;
  }

  /** A beam runs between the projections of its ends; its thickness follows the local scale. */
  private placeBeam(b: Beam): void {
    const a = this.project(b.x0, b.y0);
    const z = this.project(b.x1, b.y1);
    const len = Math.hypot(z.x - a.x, z.y - a.y);
    const s = b.sprite;
    s.width = Math.max(34, (len / a.s) * 2);
    s.height = b.thick;
    s.scale.set(0.5 * a.s);
    s.pivot.set(0, b.thick / 2);
    s.position.set(a.x, a.y);
    s.rotation = Math.atan2(z.y - a.y, z.x - a.x);
  }

  private impact(x: number, y: number, type: DamageType, splash?: number): boolean {
    const strip = this.lib.fxStrip(RACE_OF_DAMAGE[type], 'impact');
    if (!strip) return false;
    const size = splash ? splash * 2 * TILE : TILE * 0.75;
    return this.burst(strip, x, y, size, Math.floor(this.rand() * 4) * (Math.PI / 2));
  }

  private burst(strip: Strip, x: number, y: number, size: number, rotation: number): boolean {
    const s = this.takeBurst();
    if (!s) return false;
    s.texture = strip.frames[0];
    s.rotation = rotation;
    s.visible = true;
    s.alpha = 1;
    const b: Burst = { sprite: s, strip, t: 0, x, y, size };
    this.placeBurst(b);
    this.bursts.push(b);
    return true;
  }

  private placeBurst(b: Burst): void {
    const q = this.project(b.x, b.y);
    b.sprite.position.set(q.x, q.y);
    b.sprite.width = b.size * q.s;
    b.sprite.height = b.size * q.s;
  }

  // ------------------------------------------------------------ per frame

  /** Advance by dt in ticks (fractional allowed). */
  update(dtTicks: number): void {
    let w = 0;
    for (const b of this.beams) {
      b.life -= dtTicks;
      if (b.life <= 0) {
        b.sprite.visible = false;
        this.freeBeams.push(b.sprite);
        continue;
      }
      const t = 1 - b.life / b.maxLife;
      b.sprite.alpha = 1 - t * t;
      this.placeBeam(b);
      this.beams[w++] = b;
    }
    this.beams.length = w;

    w = 0;
    for (const f of this.flashes) {
      f.life -= dtTicks;
      if (f.life <= 0) {
        f.sprite.visible = false;
        this.freeFlashes.push(f.sprite);
        continue;
      }
      this.placeFlash(f);
      const t = 1 - f.life / f.maxLife;
      f.sprite.alpha = 1 - t * t;
      this.flashes[w++] = f;
    }
    this.flashes.length = w;

    w = 0;
    for (const b of this.bursts) {
      b.t += dtTicks / TICKS_PER_SECOND;
      const i = Math.floor(b.t * b.strip.fps);
      if (i >= b.strip.frames.length) {
        b.sprite.visible = false;
        this.freeBursts.push(b.sprite);
        continue;
      }
      b.sprite.texture = b.strip.frames[i];
      this.placeBurst(b);
      this.bursts[w++] = b;
    }
    this.bursts.length = w;
  }

  destroy(): void {
    this.additive.destroy({ children: true });
    this.normal.destroy({ children: true });
  }
}
