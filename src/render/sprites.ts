// Extra Terram — src/render/sprites.ts v0.9.0 — strips load on demand; mini-bosses on their own art; tanks 1.7 tiles; mount points from the sprite index; effect strips
// The art handoff docs (Project) describe the image spec. Any sprite listed in public/sprites/manifest.json
// is used; anything else is drawn here with Pixi Graphics and cached as a texture. Stills and effects
// are loaded with the board; animation strips load the first time something asks for them (they are
// most of the art's weight), and `stripsVersion` ticks up as each arrives so the renderer can attach it.
// Keys: tower:<id>:<tier>:<branch|->   turret:<id>:<tier>:<branch|->   creep:<id>   projectile:<towerId>
import { Assets, Graphics, Rectangle, Texture, type Renderer as PixiRendererType } from 'pixi.js';
import type { CreepDef, TowerDef } from '../engine';
import { SpriteIndex, loadSpriteIndex, towerState, type Point } from './spriteIndex';
import { drawCreep, drawProjectile, drawTower, drawTurret } from './vectorArt';

export const TILE = 64;
export const TOWER_CANVAS = 256; // art spec: tower body canvas
export const TOWER_ANCHOR_Y = 168 / 256; // footprint centre sits two-thirds down
export const CREEP_CANVAS = 128;
export const TURRET_CANVAS = 128;

/** Animation strips by name; everything else (stills, effects) loads with the board. */
const STRIP_FILE = /-(idle|fire|walk|die)\.png$/;

export interface SpriteEntry {
  texture: Texture;
  /** Size in board pixels the texture should be drawn at. */
  width: number;
  height: number;
  /** Anchor in 0..1. */
  ax: number;
  ay: number;
  /** True when the texture came from an image file rather than vector art. */
  image: boolean;
}

/** An animation strip sliced into frames. fps is the authored playback rate. */
export interface Strip {
  frames: Texture[];
  fps: number;
}

export type TowerAnim = 'idle' | 'fire';
export type CreepAnim = 'walk' | 'die';

export class SpriteLibrary {
  private cache = new Map<string, SpriteEntry>();
  private strips = new Map<string, Strip | null | 'loading'>();
  private fxStrips = new Map<string, Strip | null>();
  private images = new Set<string>();
  private renderer: PixiRendererType;
  private index = new SpriteIndex();
  /** Which art a creep uses: its own id when its file exists, else the art it borrows. */
  private creepArt = new Map<string, string>();
  /** Goes up by one each time a strip finishes loading. */
  stripsVersion = 0;

  constructor(renderer: PixiRendererType) {
    this.renderer = renderer;
  }

  /** Fetch the sprite index and preload every still and effect. No manifest = vector art only. */
  async load(): Promise<void> {
    try {
      this.index = await loadSpriteIndex();
      const now = [...this.index.sprites].filter((p) => !STRIP_FILE.test(p));
      if (now.length === 0) return;
      const urls = now.map((p) => `/sprites/${p}`);
      const loaded = await Assets.load<Texture>(urls);
      for (const [i, p] of now.entries()) if (loaded[urls[i]]) this.images.add(p);
    } catch {
      // Offline first run or no sprites yet: vector art carries the game.
    }
  }

  private imageTexture(path: string): Texture | null {
    if (!this.images.has(path)) return null;
    return Assets.get<Texture>(`/sprites/${path}`) ?? null;
  }

  /** Slice a strip texture (width a whole multiple of its height) into square frames, left to right. */
  private slice(base: Texture, fps: number): Strip | null {
    const size = base.height;
    const n = Math.round(base.width / size);
    if (n < 2 || Math.abs(base.width - n * size) >= 2) return null;
    const frames: Texture[] = [];
    for (let i = 0; i < n; i++) frames.push(new Texture({ source: base.source, frame: new Rectangle(i * size, 0, size, size) }));
    return { frames, fps };
  }

  /**
   * An animation strip, or null while it is missing or still loading. The first call for a strip that
   * exists starts its download; `stripsVersion` goes up when it lands, and the next call returns it.
   */
  private strip(path: string, fps: number): Strip | null {
    const known = this.strips.get(path);
    if (known === 'loading') return null;
    if (known !== undefined) return known;
    if (!this.index.has(path)) {
      this.strips.set(path, null);
      return null;
    }
    this.strips.set(path, 'loading');
    Assets.load<Texture>(`/sprites/${path}`)
      .then((tex) => {
        this.strips.set(path, tex ? this.slice(tex, fps) : null);
        this.stripsVersion++;
      })
      .catch(() => this.strips.set(path, null)); // offline and never cached: the still carries on
    return null;
  }

  /** Idle (loop) or fire (once) strip for a tower body, or null. */
  towerStrip(def: TowerDef, tier: 1 | 2 | 3, branch: 'a' | 'b' | null, anim: TowerAnim): Strip | null {
    return this.strip(`${def.race}/${def.id}/${towerState(tier, branch)}-${anim}.png`, anim === 'idle' ? 6 : 12);
  }

  /** Fire strip for a turret, or null. */
  turretStrip(def: TowerDef, tier: 1 | 2 | 3, branch: 'a' | 'b' | null): Strip | null {
    return this.strip(`${def.race}/${def.id}/turret-${towerState(tier, branch)}-fire.png`, 12);
  }

  /** The art id a creep is drawn with: its own when `<id>.png` exists (mini-bosses), else the art it borrows. */
  private creepArtId(def: CreepDef): string {
    let id = this.creepArt.get(def.id);
    if (id === undefined) {
      id = def.art && !this.images.has(`${def.race}/creeps/${def.id}.png`) ? def.art : def.id;
      this.creepArt.set(def.id, id);
    }
    return id;
  }

  /** Walk (loop) or die (once) strip for a creep, or null. Follows the still: own strips with own art only. */
  creepStrip(def: CreepDef, anim: CreepAnim): Strip | null {
    return this.strip(`${def.race}/creeps/${this.creepArtId(def)}-${anim}.png`, anim === 'walk' ? 8 : 12);
  }

  /**
   * A race's effect sprite (`<race>/fx/<name>.png`), or null until the art exists. Optional art: the
   * game works without it. Passives: rooted, spin-up, hive-link, overcharge; weapons: beam-<tower>,
   * muzzle, field-<tower>.
   */
  fx(race: string, name: string): Texture | null {
    return this.imageTexture(`${race}/fx/${name}.png`);
  }

  /** A race's effect strip (impact, bite-<tower>: 4 frames of 128), or null. */
  fxStrip(race: string, name: string, fps = 12): Strip | null {
    const path = `${race}/fx/${name}.png`;
    const known = this.fxStrips.get(path);
    if (known !== undefined) return known;
    const base = this.imageTexture(path);
    const strip = base ? this.slice(base, fps) : null;
    this.fxStrips.set(path, strip);
    return strip;
  }

  /** Painted-turret pivot, board pixels from the cell centre. */
  pivot(def: TowerDef, tier: 1 | 2 | 3, branch: 'a' | 'b' | null): Point {
    return this.index.pivot(def, towerState(tier, branch));
  }

  /** Where shots and beams leave a painted tower without a turret, board pixels from the cell centre. */
  emitter(def: TowerDef, tier: 1 | 2 | 3, branch: 'a' | 'b' | null): Point {
    return this.index.emitter(def, towerState(tier, branch));
  }

  /** How far a painted turret's muzzle sits in front of its pivot, board pixels. */
  reach(def: TowerDef, tier: 1 | 2 | 3, branch: 'a' | 'b' | null): number {
    return this.index.reach(def, towerState(tier, branch));
  }

  /**
   * Draw vector art into a texture at its natural size, with the anchor placed at the drawing's
   * (0, 0): the ground-contact point for towers, the centre for creeps and projectiles, the pivot
   * for turrets. No stretching: the sprite is shown at the bounds the drawing actually has.
   */
  private generate(draw: (g: Graphics) => void): SpriteEntry {
    const g = new Graphics();
    draw(g);
    const b = g.getLocalBounds();
    const texture = this.renderer.generateTexture({ target: g, resolution: 2 });
    g.destroy();
    const width = Math.max(1, b.width);
    const height = Math.max(1, b.height);
    return { texture, width, height, ax: -b.minX / width, ay: -b.minY / height, image: false };
  }

  tower(def: TowerDef, tier: 1 | 2 | 3, branch: 'a' | 'b' | null): SpriteEntry {
    const key = `tower:${def.id}:${tier}:${branch ?? '-'}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const file = `${def.race}/${def.id}/${towerState(tier, branch)}.png`;
    const image = this.imageTexture(file);
    // Every state is fitted to the same footprint rule (bottom at y=182 of 256), so tiers grow on
    // screen by a draw scale rather than by overflowing the canvas: tier 3 is 14% larger than tier 1.
    const grow = tier === 3 ? 1.14 : tier === 2 ? 1.05 : 1;
    const entry: SpriteEntry = image
      ? { texture: image, width: TILE * 1.85 * grow, height: TILE * 1.85 * grow, ax: 0.5, ay: TOWER_ANCHOR_Y, image: true }
      : this.generate((g) => drawTower(g, def, tier, branch, TILE));
    this.cache.set(key, entry);
    return entry;
  }

  /** Rotating part, or null when the tower has none. A painted body only gets a painted turret. */
  turret(def: TowerDef, tier: 1 | 2 | 3, branch: 'a' | 'b' | null, bodyIsImage: boolean): SpriteEntry | null {
    if (!hasTurret(def)) return null;
    const key = `turret:${def.id}:${tier}:${branch ?? '-'}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const file = `${def.race}/${def.id}/turret-${towerState(tier, branch)}.png`;
    const image = this.imageTexture(file);
    if (!image && bodyIsImage) return null;
    const entry: SpriteEntry = image
      ? { texture: image, width: TILE * 1.0, height: TILE * 1.0, ax: 0.5, ay: 0.5, image: true }
      : this.generate((g) => drawTurret(g, def, tier, branch, TILE));
    this.cache.set(key, entry);
    return entry;
  }

  creep(def: CreepDef): SpriteEntry {
    const key = `creep:${def.id}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const image = this.imageTexture(`${def.race}/creeps/${this.creepArtId(def)}.png`);
    // Painted creeps fill ~72% of their canvas, so the canvas is drawn larger than the hit radius.
    // Workhorses and tanks share the 1.5-tile cap otherwise, and a tank's wide, low build then reads
    // smaller than the workhorse: tanks get 1.7 tiles. Mini-bosses (256 canvas) are drawn 2.3 tiles.
    const size =
      def.archetype === 'boss' ? TILE * 2.3 : def.archetype === 'tank' ? TILE * 1.7 : TILE * Math.min(1.5, Math.max(0.95, def.radius * 2 * 2.7));
    const entry: SpriteEntry = image
      ? { texture: image, width: size, height: size, ax: 0.5, ay: 0.5, image: true }
      : this.generate((g) => drawCreep(g, def, TILE));
    this.cache.set(key, entry);
    return entry;
  }

  projectile(def: TowerDef): SpriteEntry {
    const key = `projectile:${def.id}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const file = `${def.race}/${def.id}/projectile.png`;
    const image = this.imageTexture(file);
    const entry: SpriteEntry = image
      ? { texture: image, width: TILE * 0.4, height: TILE * 0.4, ax: 0.5, ay: 0.5, image: true }
      : this.generate((g) => drawProjectile(g, def, TILE));
    this.cache.set(key, entry);
    return entry;
  }

  destroy(): void {
    for (const e of this.cache.values()) if (!e.image) e.texture.destroy(true);
    this.cache.clear();
  }
}

/** Public path of a sprite image, for the UI (build bar, menu). The UI hides the img if it 404s. */
export function spriteUrl(race: string, towerId: string, state: 't1' | 't2' | 't3a' | 't3b' = 't1'): string {
  return `/sprites/${race}/${towerId}/${state}.png`;
}

/** Public path of a creep still, for the UI (send bar). */
export function creepUrl(race: string, creepId: string): string {
  return `/sprites/${race}/creeps/${creepId}.png`;
}

export function hasTurret(def: TowerDef): boolean {
  return def.attack === 'projectile' && (def.role === 'heavy' || def.role === 'range' || def.role === 'splash');
}
