// Extra Terram — src/render/effects.ts v0.7.0 — particles live in board px and are drawn where the camera projects them
// One pool, one shared texture, one container: the whole layer is a single draw batch. Nothing here
// touches the simulation, and when the pool is full new bursts are dropped rather than allocated.
import { Container, Graphics, Sprite, Texture, type Renderer as PixiRendererType } from 'pixi.js';
import type { ArmorType, DamageType, SimEvent } from '../engine';

const TILE = 64;

interface Particle {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  drag: number;
  life: number; // ticks left
  maxLife: number;
  size: number; // board px at full life
  endSize: number;
  color: number;
  alpha: number;
  spin: number;
  gravity: number;
  kind: 'dot' | 'spark' | 'shard' | 'leaf' | 'scrap' | 'ring' | 'beam';
  length: number; // beams only
  /** Beams: the two ends, board px (drawn between their projections). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const DAMAGE_COLOR: Record<DamageType, number> = { thorn: 0xd9c25a, kinetic: 0xf6f0c8, acid: 0x9fe84a, energy: 0x4fd8e8 };

/** Board px → screen px with the local scale (the camera's projection; identity when there is none). */
export type Project = (x: number, y: number) => { x: number; y: number; s: number };
const IDENTITY: Project = (x, y) => ({ x, y, s: 1 });

export class Effects {
  readonly container = new Container();
  private pool: Particle[] = [];
  private free: Particle[] = [];
  private live: Particle[] = [];
  private textures: Record<Particle['kind'], Texture>;
  private rng = 0x9e3779b9;
  /** 1 = full budget, 0.5 = battery saver. */
  scale = 1;

  constructor(
    renderer: PixiRendererType,
    private project: Project = IDENTITY,
    capacity = 400,
  ) {
    this.textures = {
      dot: this.make(renderer, (g) => g.circle(8, 8, 7).fill(0xffffff)),
      spark: this.make(renderer, (g) => g.roundRect(0, 6, 16, 4, 2).fill(0xffffff)),
      shard: this.make(renderer, (g) => g.moveTo(8, 0).lineTo(16, 8).lineTo(8, 16).lineTo(0, 8).closePath().fill(0xffffff)),
      leaf: this.make(renderer, (g) => g.ellipse(8, 8, 8, 4).fill(0xffffff)),
      scrap: this.make(renderer, (g) => g.rect(2, 4, 12, 8).fill(0xffffff).rect(5, 2, 6, 12).fill(0xffffff)),
      ring: this.make(renderer, (g) => g.circle(16, 16, 14).stroke({ width: 3, color: 0xffffff })),
      beam: this.make(renderer, (g) => g.rect(0, 0, 32, 4).fill(0xffffff)),
    };
    for (let i = 0; i < capacity; i++) {
      const sprite = new Sprite(this.textures.dot);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      this.container.addChild(sprite);
      const p: Particle = { sprite, x: 0, y: 0, vx: 0, vy: 0, drag: 1, life: 0, maxLife: 1, size: 4, endSize: 0, color: 0xffffff, alpha: 1, spin: 0, gravity: 0, kind: 'dot', length: 0, x0: 0, y0: 0, x1: 0, y1: 0 };
      this.pool.push(p);
      this.free.push(p);
    }
  }

  private make(renderer: PixiRendererType, draw: (g: Graphics) => void): Texture {
    const g = new Graphics();
    draw(g);
    const t = renderer.generateTexture({ target: g, resolution: 2 });
    g.destroy();
    return t;
  }

  /** Cheap render-only randomness; the sim never sees it. */
  private rand(): number {
    this.rng = (Math.imul(this.rng ^ (this.rng >>> 15), 0x2c1b3c6d) ^ ((this.rng ^ (this.rng >>> 15)) >>> 12)) >>> 0;
    return this.rng / 4294967296;
  }

  private spawn(kind: Particle['kind'], x: number, y: number, opts: Partial<Omit<Particle, 'sprite' | 'kind' | 'x' | 'y'>>): Particle | null {
    const p = this.free.pop();
    if (!p) return null;
    p.kind = kind;
    p.sprite.texture = this.textures[kind];
    p.x = x;
    p.y = y;
    p.vx = opts.vx ?? 0;
    p.vy = opts.vy ?? 0;
    p.drag = opts.drag ?? 0.9;
    p.maxLife = opts.maxLife ?? 10;
    p.life = p.maxLife;
    p.size = opts.size ?? 4;
    p.endSize = opts.endSize ?? 0;
    p.color = opts.color ?? 0xffffff;
    p.alpha = opts.alpha ?? 1;
    p.spin = opts.spin ?? 0;
    p.gravity = opts.gravity ?? 0;
    p.length = opts.length ?? 0;
    p.x0 = opts.x0 ?? x;
    p.y0 = opts.y0 ?? y;
    p.x1 = opts.x1 ?? x;
    p.y1 = opts.y1 ?? y;
    p.sprite.tint = p.color;
    p.sprite.visible = true;
    p.sprite.rotation = this.rand() * Math.PI * 2;
    p.sprite.anchor.set(0.5);
    this.live.push(p);
    return p;
  }

  private count(n: number): number {
    return Math.max(1, Math.round(n * this.scale));
  }

  // ------------------------------------------------------------ event handlers

  handle(ev: SimEvent, projectileColor: (towerId: number) => number): void {
    switch (ev.kind) {
      case 'fire':
        this.muzzle(ev.x * TILE, ev.y * TILE, ev.tx * TILE, ev.ty * TILE, projectileColor(ev.tower));
        break;
      case 'hit':
        this.impact(ev.x * TILE, ev.y * TILE, ev.damageType, ev.amount);
        if (ev.splash) this.spawn('ring', ev.x * TILE, ev.y * TILE, { size: 8, endSize: ev.splash * TILE, maxLife: 7, color: DAMAGE_COLOR[ev.damageType], alpha: 0.7 });
        break;
      case 'beam':
        this.beam(ev.x * TILE, ev.y * TILE, ev.tx * TILE, ev.ty * TILE, DAMAGE_COLOR[ev.damageType]);
        break;
      case 'income':
        this.income(ev.x * TILE, ev.y * TILE);
        break;
      case 'kill':
        this.death(ev.x * TILE, ev.y * TILE, ev.armor);
        break;
      case 'leak':
        this.leak(ev.x * TILE, ev.y * TILE);
        break;
      case 'place':
        this.ring(ev.x * TILE, ev.y * TILE, 0x9fe8c0, 8);
        break;
      case 'upgrade':
        this.ring(ev.x * TILE, ev.y * TILE, 0xe8c33a, 10);
        break;
      case 'sell':
        this.ring(ev.x * TILE, ev.y * TILE, 0xc47a1e, 6);
        break;
      case 'wave':
        break;
    }
  }

  muzzle(x: number, y: number, tx: number, ty: number, color: number): void {
    const dx = tx - x;
    const dy = ty - y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const ox = (dx / d) * 14;
    const oy = (dy / d) * 14;
    this.spawn('dot', x + ox, y + oy, { size: 9, endSize: 2, maxLife: 4, color, alpha: 0.9 });
    for (let i = 0; i < this.count(2); i++) {
      this.spawn('dot', x + ox, y + oy, { vx: (dx / d) * 3 + (this.rand() - 0.5) * 2, vy: (dy / d) * 3 + (this.rand() - 0.5) * 2, size: 2.5, endSize: 0.5, maxLife: 6, color, alpha: 0.7 });
    }
  }

  impact(x: number, y: number, type: DamageType, amount: number): void {
    const color = DAMAGE_COLOR[type];
    const n = this.count(Math.min(8, 3 + Math.floor(amount / 12)));
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2;
      const sp = 1.5 + this.rand() * 2.5;
      this.spawn(type === 'acid' ? 'dot' : 'spark', x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: type === 'acid' ? 3 : 4, endSize: 0.5, maxLife: 8, color, alpha: 0.95, drag: 0.85 });
    }
    this.spawn('ring', x, y, { size: 6, endSize: 16, maxLife: 5, color, alpha: 0.6 });
  }

  /** A bio damage-over-time drip on a creep. */
  drip(x: number, y: number): void {
    this.spawn('dot', x + (this.rand() - 0.5) * 8, y + (this.rand() - 0.5) * 8, { vy: 0.6, size: 2.5, endSize: 1, maxLife: 10, color: 0x9fe84a, alpha: 0.9, gravity: 0.08 });
  }

  death(x: number, y: number, armor: ArmorType): void {
    if (armor === 'plated') {
      for (let i = 0; i < this.count(8); i++) {
        const a = this.rand() * Math.PI * 2;
        const sp = 2 + this.rand() * 4;
        this.spawn('spark', x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: 4, endSize: 1, maxLife: 14, color: this.rand() < 0.5 ? 0xffd27a : 0xffffff, alpha: 1, drag: 0.9, gravity: 0.15 });
      }
      this.spawn('scrap', x, y, { vx: (this.rand() - 0.5) * 4, vy: -3, size: 10, endSize: 8, maxLife: 18, color: 0xe8c33a, alpha: 1, spin: 0.3, gravity: 0.35, drag: 0.98 });
      this.spawn('dot', x, y, { size: 14, endSize: 26, maxLife: 8, color: 0x3a3f44, alpha: 0.5, drag: 1 }); // smoke puff
    } else if (armor === 'shielded') {
      for (let i = 0; i < this.count(8); i++) {
        const a = this.rand() * Math.PI * 2;
        const sp = 2 + this.rand() * 3;
        this.spawn('shard', x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: 6, endSize: 2, maxLife: 14, color: 0x9ff0ff, alpha: 1, spin: 0.2 });
      }
    } else if (armor === 'carapace') {
      // cracked chitin and a splash of green ichor
      for (let i = 0; i < this.count(9); i++) {
        const a = this.rand() * Math.PI * 2;
        const sp = 1.5 + this.rand() * 3;
        const shell = this.rand() < 0.5;
        this.spawn(shell ? 'shard' : 'dot', x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: shell ? 5 : 3.5, endSize: 1, maxLife: 14, color: shell ? 0x8a5cc0 : 0x9fe84a, alpha: 1, spin: shell ? 0.25 : 0, drag: 0.9, gravity: 0.1 });
      }
    } else {
      for (let i = 0; i < this.count(10); i++) {
        const a = this.rand() * Math.PI * 2;
        const sp = 1.5 + this.rand() * 3;
        const leaf = this.rand() < 0.4;
        this.spawn(leaf ? 'leaf' : 'dot', x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: leaf ? 6 : 3.5, endSize: 1, maxLife: 16, color: leaf ? 0x7fd36b : 0xe8c33a, alpha: 1, spin: leaf ? 0.25 : 0, drag: 0.9, gravity: 0.1 });
      }
    }
  }

  leak(x: number, y: number): void {
    this.spawn('ring', x, y, { size: 10, endSize: 48, maxLife: 12, color: 0xe85a3a, alpha: 0.9 });
    this.spawn('dot', x, y, { size: 18, endSize: 4, maxLife: 10, color: 0xe85a3a, alpha: 0.6 });
  }

  ring(x: number, y: number, color: number, motes: number): void {
    this.spawn('ring', x, y, { size: 8, endSize: 40, maxLife: 12, color, alpha: 0.8 });
    for (let i = 0; i < this.count(motes); i++) {
      const a = (i / motes) * Math.PI * 2;
      this.spawn('dot', x + Math.cos(a) * 10, y + Math.sin(a) * 10, { vx: Math.cos(a) * 0.6, vy: Math.sin(a) * 0.6 - 1.2, size: 3, endSize: 0.5, maxLife: 14, color, alpha: 0.9, drag: 0.96 });
    }
  }

  /** A hitscan beam from a tower (or the previous chain target) to a creep. */
  beam(x0: number, y0: number, x1: number, y1: number, color: number): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;
    const p = this.spawn('beam', (x0 + x1) / 2, (y0 + y1) / 2, { size: 5, endSize: 1, maxLife: 5, color, alpha: 0.95, drag: 1, length: len, x0, y0, x1, y1 });
    if (p) p.sprite.rotation = Math.atan2(dy, dx);
    const core = this.spawn('beam', (x0 + x1) / 2, (y0 + y1) / 2, { size: 2, endSize: 0.5, maxLife: 5, color: 0xffffff, alpha: 0.9, drag: 1, length: len, x0, y0, x1, y1 });
    if (core) core.sprite.rotation = Math.atan2(dy, dx);
    this.spawn('dot', x1, y1, { size: 7, endSize: 2, maxLife: 5, color, alpha: 0.9 });
  }

  /** The flash where a beam lands, on its own: a painted beam (paintedFx.ts) keeps it. */
  beamFlash(x: number, y: number, type: DamageType): void {
    this.spawn('dot', x, y, { size: 7, endSize: 2, maxLife: 5, color: DAMAGE_COLOR[type], alpha: 0.9 });
  }

  /** Sap paid out by an economy tower: gold motes rising. */
  income(x: number, y: number): void {
    this.spawn('ring', x, y, { size: 8, endSize: 34, maxLife: 12, color: 0xe8c33a, alpha: 0.8 });
    for (let i = 0; i < this.count(6); i++) {
      this.spawn('dot', x + (this.rand() - 0.5) * 20, y + (this.rand() - 0.5) * 10, { vy: -1.4 - this.rand(), vx: (this.rand() - 0.5) * 0.6, size: 3, endSize: 1, maxLife: 18, color: 0xffe08a, alpha: 1, drag: 0.98 });
    }
  }

  /** Short-lived trail dot behind a projectile; called by the renderer each frame a projectile moves. */
  trail(x: number, y: number, color: number): void {
    this.spawn('dot', x, y, { size: 3, endSize: 0.5, maxLife: 4, color, alpha: 0.55, drag: 1 });
  }

  // ------------------------------------------------------------ per-frame update

  /** Advance by dt in ticks (fractional allowed) and draw. */
  update(dtTicks: number): void {
    let w = 0;
    for (let i = 0; i < this.live.length; i++) {
      const p = this.live[i];
      p.life -= dtTicks;
      if (p.life <= 0) {
        p.sprite.visible = false;
        this.free.push(p);
        continue;
      }
      p.vy += p.gravity * dtTicks;
      p.x += p.vx * dtTicks;
      p.y += p.vy * dtTicks;
      p.vx *= p.drag;
      p.vy *= p.drag;
      const t = 1 - p.life / p.maxLife;
      const size = p.size + (p.endSize - p.size) * t;
      if (p.kind === 'beam') {
        // between the projected ends, so a beam lies right under the camera's angle
        const a = this.project(p.x0, p.y0);
        const b = this.project(p.x1, p.y1);
        p.sprite.position.set((a.x + b.x) / 2, (a.y + b.y) / 2);
        p.sprite.width = Math.hypot(b.x - a.x, b.y - a.y);
        p.sprite.height = size * a.s;
        p.sprite.rotation = Math.atan2(b.y - a.y, b.x - a.x);
      } else {
        const q = this.project(p.x, p.y);
        p.sprite.position.set(q.x, q.y);
        p.sprite.width = size * 2 * q.s;
        p.sprite.height = (p.kind === 'spark' || p.kind === 'leaf' ? size : size * 2) * q.s;
        p.sprite.rotation += p.spin * dtTicks;
        if (p.kind === 'spark' && (p.vx !== 0 || p.vy !== 0)) p.sprite.rotation = Math.atan2(p.vy, p.vx);
      }
      p.sprite.alpha = p.alpha * (1 - t * t);
      this.live[w++] = p;
    }
    this.live.length = w;
  }

  get active(): number {
    return this.live.length;
  }

  destroy(): void {
    for (const p of this.pool) p.sprite.destroy();
    for (const t of Object.values(this.textures)) t.destroy(true);
    this.container.destroy();
  }
}
