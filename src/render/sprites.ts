// Extra Terram — src/render/sprites.ts v0.5.0 — stills, animation strips, vector fallbacks
// The art handoff doc (Project) describes the image spec. Any sprite listed in public/sprites/manifest.json
// is loaded and used; anything else is drawn here with Pixi Graphics and cached as a texture.
// Keys: tower:<id>:<tier>:<branch|->   turret:<id>:<tier>:<branch|->   creep:<id>   projectile:<towerId>
import { Assets, Graphics, Rectangle, Texture, type Renderer as PixiRendererType } from 'pixi.js';
import type { CreepDef, TowerDef } from '../engine';
import { drawCreep, drawProjectile, drawTower, drawTurret } from './vectorArt';

export const TILE = 64;
export const TOWER_CANVAS = 256; // art spec: tower body canvas
export const TOWER_ANCHOR_Y = 168 / 256; // footprint centre sits two-thirds down
export const CREEP_CANVAS = 128;
export const TURRET_CANVAS = 128;

interface Manifest {
  version: number;
  sprites: string[]; // paths relative to /sprites, e.g. "rootkin/needlespire/t1.png"
}

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
  private strips = new Map<string, Strip | null>();
  private images = new Set<string>();
  private renderer: PixiRendererType;

  constructor(renderer: PixiRendererType) {
    this.renderer = renderer;
  }

  /** Fetch the manifest and preload every listed image. Missing manifest = vector art only. */
  async load(): Promise<void> {
    try {
      const res = await fetch('/sprites/manifest.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const manifest = (await res.json()) as Manifest;
      if (!Array.isArray(manifest.sprites) || manifest.sprites.length === 0) return;
      const urls = manifest.sprites.map((p) => `/sprites/${p}`);
      const loaded = await Assets.load<Texture>(urls);
      for (const [i, p] of manifest.sprites.entries()) if (loaded[urls[i]]) this.images.add(p);
    } catch {
      // Offline first run or no sprites yet: vector art carries the game.
    }
  }

  private imageTexture(path: string): Texture | null {
    if (!this.images.has(path)) return null;
    return Assets.get<Texture>(`/sprites/${path}`) ?? null;
  }

  /**
   * An animation strip: a PNG whose width is a whole multiple of its height, sliced into square
   * frames left to right. Detected purely by shape, so a strip is just a file dropped next to its still.
   */
  private strip(path: string, fps: number): Strip | null {
    const cached = this.strips.get(path);
    if (cached !== undefined) return cached;
    const base = this.imageTexture(path);
    let out: Strip | null = null;
    if (base) {
      const size = base.height;
      const n = Math.round(base.width / size);
      if (n >= 2 && Math.abs(base.width - n * size) < 2) {
        const frames: Texture[] = [];
        for (let i = 0; i < n; i++) frames.push(new Texture({ source: base.source, frame: new Rectangle(i * size, 0, size, size) }));
        out = { frames, fps };
      }
    }
    this.strips.set(path, out);
    return out;
  }

  /** Idle (loop) or fire (once) strip for a tower body, or null. */
  towerStrip(def: TowerDef, tier: 1 | 2 | 3, branch: 'a' | 'b' | null, anim: TowerAnim): Strip | null {
    const state = tierFile(tier, branch).replace('.png', '');
    return this.strip(`${def.race}/${def.id}/${state}-${anim}.png`, anim === 'idle' ? 6 : 12);
  }

  /** Fire strip for a turret, or null. */
  turretStrip(def: TowerDef, tier: 1 | 2 | 3, branch: 'a' | 'b' | null): Strip | null {
    const state = tierFile(tier, branch).replace('.png', '');
    return this.strip(`${def.race}/${def.id}/turret-${state}-fire.png`, 12);
  }

  /** Walk (loop) or die (once) strip for a creep, or null. */
  creepStrip(def: CreepDef, anim: CreepAnim): Strip | null {
    return this.strip(`${def.race}/creeps/${def.id}-${anim}.png`, anim === 'walk' ? 8 : 12);
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
    const file = `${def.race}/${def.id}/${tierFile(tier, branch)}`;
    const image = this.imageTexture(file);
    const entry: SpriteEntry = image
      ? { texture: image, width: TILE * 1.85, height: TILE * 1.85, ax: 0.5, ay: TOWER_ANCHOR_Y, image: true }
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
    const file = `${def.race}/${def.id}/turret-${tierFile(tier, branch)}`;
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
    const file = `${def.race}/creeps/${def.id}.png`;
    const image = this.imageTexture(file);
    // Painted creeps fill ~72% of their canvas, so the canvas is drawn larger than the hit radius.
    const size = TILE * Math.min(1.5, Math.max(0.95, def.radius * 2 * 2.7));
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

export function hasTurret(def: TowerDef): boolean {
  return def.attack === 'projectile' && (def.role === 'heavy' || def.role === 'range' || def.role === 'splash');
}

function tierFile(tier: 1 | 2 | 3, branch: 'a' | 'b' | null): string {
  return tier === 3 ? `t3${branch ?? 'a'}.png` : `t${tier}.png`;
}
