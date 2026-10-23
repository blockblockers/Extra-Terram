// Extra Terram — src/render/PixiRenderer.ts v0.1.0 — Phase 1 scaffold
// PixiJS v8 renderer. It is driven by the app's loop (no Pixi ticker): the loop decides when a
// frame is worth drawing, this class only draws. Heat controls live in the loop (fps cap, idle
// between waves) and here (resolution cap, atlas-free but generated textures, no per-frame filters).
import { Application, Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { TILE as TILE_KIND, cellIndex, towerStats, type Projectile, type SimContext, type SimState, type Tower } from '../engine';
import type { Cell, RenderFrame, Renderer } from './renderer';

export const TILE = 64; // board pixels per tile, before fitting to the canvas
const MAX_RESOLUTION = 2; // cap device pixel ratio: fill rate is the phone's main heat source

const hex = (css: string): number => parseInt(css.replace('#', ''), 16);

interface CreepSprites {
  body: Sprite;
  hpBack: Sprite;
  hpFront: Sprite;
}

export class PixiRenderer implements Renderer {
  private app = new Application();
  private canvas: HTMLCanvasElement | null = null;
  private width = 1;
  private height = 1;
  private cols = 1;
  private rows = 1;

  private board = new Container();
  private bgLayer = new Container();
  private padLayer = new Graphics();
  private rangeLayer = new Graphics();
  private towerLayer = new Container();
  private creepLayer = new Container();
  private projectileLayer = new Container();
  private hpLayer = new Container();
  private hoverLayer = new Graphics();

  private towerSprites = new Map<number, Sprite>();
  private creepSprites = new Map<number, CreepSprites>();
  private projectileSprites = new Map<number, Sprite>();
  private textures = new Map<string, Texture>();
  private padKey = '';
  private mounted = false;

  async mount(canvas: HTMLCanvasElement, width: number, height: number, ctx: SimContext): Promise<void> {
    this.canvas = canvas;
    this.cols = ctx.map.cols;
    this.rows = ctx.map.rows;
    await this.app.init({
      canvas,
      width: Math.max(1, width),
      height: Math.max(1, height),
      resolution: Math.min(window.devicePixelRatio || 1, MAX_RESOLUTION),
      autoDensity: true,
      antialias: true,
      autoStart: false, // the app loop calls render(); Pixi's ticker never runs
      background: 0x06100b,
    });
    this.mounted = true;
    this.board.addChild(this.bgLayer, this.padLayer, this.rangeLayer, this.towerLayer, this.creepLayer, this.projectileLayer, this.hpLayer, this.hoverLayer);
    this.app.stage.addChild(this.board);
    await this.loadBackground(ctx);
    this.resize(width, height);
  }

  private async loadBackground(ctx: SimContext): Promise<void> {
    const w = this.cols * TILE;
    const h = this.rows * TILE;
    try {
      const texture = await Assets.load<Texture>(ctx.map.background);
      const sprite = new Sprite(texture);
      sprite.width = w;
      sprite.height = h;
      this.bgLayer.addChild(sprite);
    } catch {
      // No painted background yet: draw a plain readable board so the game still runs.
      const g = new Graphics();
      g.rect(0, 0, w, h).fill(0x12261a);
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const kind = ctx.map.legend[ctx.map.grid[r][c]];
          if (kind === 'path' || kind === 'spawn' || kind === 'exit') g.rect(c * TILE, r * TILE, TILE, TILE).fill(kind === 'path' ? 0x4a3a28 : kind === 'spawn' ? 0x6b3a2b : 0x2b5a3a);
          else if (kind === 'pad') g.circle(c * TILE + TILE / 2, r * TILE + TILE / 2, TILE * 0.36).fill(0x1c3a27);
        }
      }
      this.bgLayer.addChild(g);
    }
  }

  resize(width: number, height: number): void {
    if (!this.mounted) return;
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.app.renderer.resize(this.width, this.height);
    const bw = this.cols * TILE;
    const bh = this.rows * TILE;
    const scale = Math.min(this.width / bw, this.height / bh);
    this.board.scale.set(scale);
    this.board.position.set((this.width - bw * scale) / 2, (this.height - bh * scale) / 2);
  }

  screenToCell(clientX: number, clientY: number): Cell | null {
    if (!this.canvas) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) * this.width) / Math.max(1, rect.width);
    const y = ((clientY - rect.top) * this.height) / Math.max(1, rect.height);
    const scale = this.board.scale.x;
    const col = Math.floor((x - this.board.x) / scale / TILE);
    const row = Math.floor((y - this.board.y) / scale / TILE);
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return null;
    return { col, row };
  }

  draw(frame: RenderFrame): void {
    if (!this.mounted) return;
    const { state, ctx, alpha, overlay } = frame;
    this.drawPads(state, overlay.showPads || overlay.placing !== null);
    this.drawTowers(state, ctx);
    this.drawCreeps(state, ctx, alpha);
    this.drawProjectiles(state, alpha);
    this.drawOverlay(state, ctx, overlay);
    this.app.render();
  }

  destroy(): void {
    if (!this.mounted) return;
    this.mounted = false;
    this.towerSprites.clear();
    this.creepSprites.clear();
    this.projectileSprites.clear();
    this.textures.clear();
    this.app.destroy(false, { children: true, texture: true, textureSource: true });
  }

  // ------------------------------------------------------------ layers

  private drawPads(state: SimState, show: boolean): void {
    const key = `${show}|${state.towers.length}`;
    if (key === this.padKey) return;
    this.padKey = key;
    const g = this.padLayer;
    g.clear();
    if (!show) return;
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const i = cellIndex(state.cols, c, r);
        if (state.grid[i] !== TILE_KIND.pad || state.occupied[i] !== -1) continue;
        g.circle(c * TILE + TILE / 2, r * TILE + TILE / 2, TILE * 0.34).stroke({ width: 2, color: 0xb9f0a8, alpha: 0.55 });
      }
    }
  }

  private drawTowers(state: SimState, ctx: SimContext): void {
    const seen = new Set<number>();
    for (const t of state.towers) {
      seen.add(t.id);
      const key = `tower:${t.def}:${t.tier}:${t.branch ?? ''}`;
      let sprite = this.towerSprites.get(t.id);
      const texture = this.towerTexture(key, t, ctx);
      if (!sprite) {
        sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        this.towerLayer.addChild(sprite);
        this.towerSprites.set(t.id, sprite);
      } else if (sprite.texture !== texture) {
        sprite.texture = texture;
      }
      sprite.position.set(t.col * TILE + TILE / 2, t.row * TILE + TILE / 2);
    }
    for (const [id, sprite] of this.towerSprites) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.towerSprites.delete(id);
      }
    }
  }

  private drawCreeps(state: SimState, ctx: SimContext, alpha: number): void {
    const seen = new Set<number>();
    for (const c of state.creeps) {
      seen.add(c.id);
      let s = this.creepSprites.get(c.id);
      if (!s) {
        const def = ctx.creepIndex[c.def];
        const body = new Sprite(this.creepTexture(def.id, def.radius, def.color));
        body.anchor.set(0.5);
        const hpBack = new Sprite(Texture.WHITE);
        hpBack.tint = 0x1a0d05;
        hpBack.alpha = 0.8;
        const hpFront = new Sprite(Texture.WHITE);
        hpFront.tint = 0x7fd36b;
        s = { body, hpBack, hpFront };
        this.creepLayer.addChild(body);
        this.hpLayer.addChild(hpBack, hpFront);
        this.creepSprites.set(c.id, s);
      }
      const x = (c.px + (c.x - c.px) * alpha) * TILE;
      const y = (c.py + (c.y - c.py) * alpha) * TILE;
      s.body.position.set(x, y);
      const dx = c.x - c.px;
      const dy = c.y - c.py;
      if (dx !== 0 || dy !== 0) s.body.rotation = Math.atan2(dy, dx);
      const ratio = Math.max(0, c.hp / c.maxHp);
      const show = ratio < 1;
      s.hpBack.visible = show;
      s.hpFront.visible = show;
      if (show) {
        const w = TILE * 0.6;
        const h = 5;
        s.hpBack.position.set(x - w / 2, y - TILE * 0.42);
        s.hpBack.width = w;
        s.hpBack.height = h;
        s.hpFront.position.set(x - w / 2, y - TILE * 0.42);
        s.hpFront.width = w * ratio;
        s.hpFront.height = h;
        s.hpFront.tint = ratio > 0.5 ? 0x7fd36b : ratio > 0.25 ? 0xe8c33a : 0xe85a3a;
      }
    }
    for (const [id, s] of this.creepSprites) {
      if (!seen.has(id)) {
        s.body.destroy();
        s.hpBack.destroy();
        s.hpFront.destroy();
        this.creepSprites.delete(id);
      }
    }
  }

  private drawProjectiles(state: SimState, alpha: number): void {
    const seen = new Set<number>();
    for (const p of state.projectiles) {
      seen.add(p.id);
      let sprite = this.projectileSprites.get(p.id);
      if (!sprite) {
        sprite = new Sprite(this.projectileTexture(p.damageType));
        sprite.anchor.set(0.5);
        this.projectileLayer.addChild(sprite);
        this.projectileSprites.set(p.id, sprite);
      }
      sprite.position.set((p.px + (p.x - p.px) * alpha) * TILE, (p.py + (p.y - p.py) * alpha) * TILE);
    }
    for (const [id, sprite] of this.projectileSprites) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.projectileSprites.delete(id);
      }
    }
  }

  private drawOverlay(state: SimState, ctx: SimContext, overlay: RenderFrame['overlay']): void {
    const g = this.hoverLayer;
    const r = this.rangeLayer;
    g.clear();
    r.clear();

    if (overlay.selected !== null) {
      const t = state.towers.find((tw) => tw.id === overlay.selected);
      if (t) {
        const stats = towerStats(ctx.towerIndex[t.def], t.tier, t.branch);
        r.circle(t.col * TILE + TILE / 2, t.row * TILE + TILE / 2, stats.range * TILE)
          .fill({ color: 0xb9f0a8, alpha: 0.08 })
          .stroke({ width: 2, color: 0xb9f0a8, alpha: 0.5 });
        g.circle(t.col * TILE + TILE / 2, t.row * TILE + TILE / 2, TILE * 0.42).stroke({ width: 3, color: 0xffffff, alpha: 0.8 });
      }
    }

    if (overlay.hover) {
      const { col, row } = overlay.hover;
      const i = cellIndex(state.cols, col, row);
      const cx = col * TILE + TILE / 2;
      const cy = row * TILE + TILE / 2;
      if (overlay.placing) {
        const def = ctx.towerIndex[overlay.placing];
        const valid = state.grid[i] === TILE_KIND.pad && state.occupied[i] === -1 && state.resources >= def.cost;
        const color = valid ? 0x7fd36b : 0xe85a3a;
        const stats = towerStats(def, 1, null);
        r.circle(cx, cy, stats.range * TILE).fill({ color, alpha: 0.08 }).stroke({ width: 2, color, alpha: 0.45 });
        g.circle(cx, cy, TILE * 0.36).fill({ color, alpha: 0.35 }).stroke({ width: 2, color, alpha: 0.9 });
      } else if (state.occupied[i] !== -1 || state.grid[i] === TILE_KIND.pad) {
        g.circle(cx, cy, TILE * 0.38).stroke({ width: 2, color: 0xffffff, alpha: 0.35 });
      }
    }
  }

  // ------------------------------------------------------------ generated textures
  // Placeholder art: shapes built once per kind and cached. Real sprite sheets per race come in Phase 2.

  private towerTexture(key: string, t: Tower, ctx: SimContext): Texture {
    const cached = this.textures.get(key);
    if (cached) return cached;
    const def = ctx.towerIndex[t.def];
    const g = new Graphics();
    const r = TILE * 0.36;
    const color = hex(def.color);
    g.circle(r + 4, r + 4, r).fill({ color: 0x08110b, alpha: 0.55 }); // soft shadow
    g.circle(r + 2, r + 2, r).fill(0x1c3a27).stroke({ width: 3, color: 0x0b1a12 });
    g.circle(r + 2, r + 2, r * 0.72).fill(color);
    if (def.attack === 'aura') g.circle(r + 2, r + 2, r * 0.4).fill({ color: 0xffffff, alpha: 0.35 });
    else g.circle(r + 2, r + 2, r * 0.22).fill(0x0b1a12);
    for (let i = 0; i < t.tier; i++) g.circle(r + 2 - 10 + i * 10, r + 2 + r * 0.95, 3.2).fill(0xf4fbff);
    if (t.branch) g.circle(r + 2, r + 2 - r * 0.95, 4.5).fill(t.branch === 'a' ? 0xe8c33a : 0x4fd8e8);
    const texture = this.app.renderer.generateTexture(g);
    g.destroy();
    this.textures.set(key, texture);
    return texture;
  }

  private creepTexture(id: string, radius: number, color: string): Texture {
    const key = `creep:${id}`;
    const cached = this.textures.get(key);
    if (cached) return cached;
    const w = radius * 2 * TILE * 1.25;
    const h = radius * 2 * TILE;
    const g = new Graphics();
    g.roundRect(1, 1, w, h, 5).fill(0x111111); // tracks
    g.roundRect(3, 4, w - 4, h - 6, 4).fill(hex(color)).stroke({ width: 2, color: 0x1a1a1a });
    g.rect(3 + w * 0.55, 6, w * 0.3, h - 10).fill({ color: 0x1a1a1a, alpha: 0.7 }); // cab
    g.circle(3 + w * 0.7, h / 2 + 1, Math.max(2, h * 0.12)).fill(0xffe9a6); // headlamp
    const texture = this.app.renderer.generateTexture(g);
    g.destroy();
    this.textures.set(key, texture);
    return texture;
  }

  private projectileTexture(type: Projectile['damageType']): Texture {
    const key = `proj:${type}`;
    const cached = this.textures.get(key);
    if (cached) return cached;
    const g = new Graphics();
    const color = type === 'bio' ? 0x9fe84a : type === 'energy' ? 0x4fd8e8 : 0xf6f0c8;
    g.circle(5, 5, 4).fill(color).stroke({ width: 1, color: 0x0b1a12, alpha: 0.6 });
    const texture = this.app.renderer.generateTexture(g);
    g.destroy();
    this.textures.set(key, texture);
    return texture;
  }
}
