// Extra Terram — src/render/sprites.ts v0.2.0 — sprite library: images when present, vector art when not
// The art handoff doc (Project) describes the image spec. Any sprite listed in public/sprites/manifest.json
// is loaded and used; anything else is drawn here with Pixi Graphics and cached as a texture.
// Keys: tower:<id>:<tier>:<branch|->   turret:<id>:<tier>:<branch|->   creep:<id>   projectile:<towerId>
import { Assets, Graphics, Texture, type Renderer as PixiRendererType } from 'pixi.js';
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

export class SpriteLibrary {
  private cache = new Map<string, SpriteEntry>();
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
      ? { texture: image, width: TILE * 1.6, height: TILE * 1.6, ax: 0.5, ay: TOWER_ANCHOR_Y, image: true }
      : this.generate((g) => drawTower(g, def, tier, branch, TILE));
    this.cache.set(key, entry);
    return entry;
  }

  /** Rotating part, or null when the tower has none. */
  turret(def: TowerDef, tier: 1 | 2 | 3, branch: 'a' | 'b' | null): SpriteEntry | null {
    if (!hasTurret(def)) return null;
    const key = `turret:${def.id}:${tier}:${branch ?? '-'}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const file = `${def.race}/${def.id}/turret-${tierFile(tier, branch)}`;
    const image = this.imageTexture(file);
    const entry: SpriteEntry = image
      ? { texture: image, width: TILE * 0.9, height: TILE * 0.9, ax: 0.5, ay: 0.5, image: true }
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
    const size = TILE * def.radius * 2 * 1.5;
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

export function hasTurret(def: TowerDef): boolean {
  return def.attack === 'projectile' && (def.role === 'heavy' || def.role === 'range' || def.role === 'splash');
}

function tierFile(tier: 1 | 2 | 3, branch: 'a' | 'b' | null): string {
  return tier === 3 ? `t3${branch ?? 'a'}.png` : `t${tier}.png`;
}
