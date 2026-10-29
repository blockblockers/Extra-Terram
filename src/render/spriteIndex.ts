// Extra Terram — src/render/spriteIndex.ts v0.1.0 — one fetch of the sprite manifest and the mount data, shared by the renderer and the UI
// `scripts/sprites.py` writes both files: public/sprites/manifest.json (every sprite and interface icon that
// exists) and public/sprites/mounts.json (turret pivots, emitters and each turret's reach). Nothing here
// imports Pixi, so the menus can use it without pulling in the renderer.
import type { TowerDef } from '../engine';

export type TowerState = 't1' | 't2' | 't3a' | 't3b';

export interface Point {
  x: number;
  y: number;
}

interface Manifest {
  version: number;
  sprites: string[];
  ui?: string[];
}

interface MountEntry {
  pivot?: Partial<Record<TowerState, [number, number]>>;
  emit?: Partial<Record<TowerState, [number, number]>>;
  reach?: Partial<Record<TowerState, number>>;
}

const TILE = 64;
/** Painted tower bodies: the 256 canvas is drawn 1.85 tiles across times the tier's growth, anchored at (128, 168). */
const BODY_TILES = 1.85;
const GROW: Record<TowerState, number> = { t1: 1, t2: 1.05, t3a: 1.14, t3b: 1.14 };
/** Turrets: the 128 canvas is drawn 1 tile across, so a turret pixel is half a board pixel. */
const TURRET_PX = TILE / 128;
/** A turret's front reach when its art has not been measured (the spec's limit, in turret pixels). */
const DEFAULT_REACH = 55;
/** Default turret pivot and emitter: half a tile above the cell centre. */
const DEFAULT_MOUNT: Point = { x: 0, y: -TILE * 0.5 };

export function towerState(tier: 1 | 2 | 3, branch: 'a' | 'b' | null): TowerState {
  return tier === 3 ? (branch === 'b' ? 't3b' : 't3a') : tier === 2 ? 't2' : 't1';
}

/** Board pixels per pixel of a painted body's 256 canvas, at this state. */
export function bodyScale(state: TowerState): number {
  return (TILE * BODY_TILES * GROW[state]) / 256;
}

/** Size of a turret's 128 canvas relative to its body's 256 canvas (for composing icons). */
export function turretToBody(state: TowerState): number {
  return (TILE * 1) / (TILE * BODY_TILES * GROW[state]);
}

export class SpriteIndex {
  readonly sprites: ReadonlySet<string>;
  readonly ui: ReadonlySet<string>;
  private mounts: Record<string, MountEntry>;

  constructor(sprites: string[] = [], ui: string[] = [], mounts: Record<string, MountEntry> = {}) {
    this.sprites = new Set(sprites);
    this.ui = new Set(ui);
    this.mounts = mounts;
  }

  /** True when public/sprites/<path> exists. */
  has(path: string): boolean {
    return this.sprites.has(path);
  }

  /** True when public/ui/<name>.png exists. */
  hasUi(name: string): boolean {
    return this.ui.has(name);
  }

  /** True when this tower has a painted turret for this state. */
  hasTurretArt(def: TowerDef, state: TowerState): boolean {
    return this.has(`${def.race}/${def.id}/turret-${state}.png`);
  }

  /** Pivot on the body's 256 canvas, in canvas pixels (for the UI). */
  pivotOnCanvas(def: TowerDef, state: TowerState): [number, number] {
    const p = this.mounts[`${def.race}/${def.id}`]?.pivot?.[state];
    if (p) return p;
    return [128, 168 + DEFAULT_MOUNT.y / bodyScale(state)];
  }

  /** Where a painted turret's centre sits, board pixels from the cell centre. */
  pivot(def: TowerDef, state: TowerState): Point {
    return this.toBoard(this.mounts[`${def.race}/${def.id}`]?.pivot?.[state], state);
  }

  /** Where beams and muzzle flashes start on a tower without a turret, board pixels from the cell centre. */
  emitter(def: TowerDef, state: TowerState): Point {
    return this.toBoard(this.mounts[`${def.race}/${def.id}`]?.emit?.[state], state);
  }

  /** How far a painted turret reaches in front of its pivot, in board pixels. */
  reach(def: TowerDef, state: TowerState): number {
    return (this.mounts[`${def.race}/${def.id}`]?.reach?.[state] ?? DEFAULT_REACH) * TURRET_PX;
  }

  private toBoard(p: [number, number] | undefined, state: TowerState): Point {
    if (!p) return { ...DEFAULT_MOUNT };
    const s = bodyScale(state);
    return { x: (p[0] - 128) * s, y: (p[1] - 168) * s };
  }
}

let current: SpriteIndex | null = null;
let pending: Promise<SpriteIndex> | null = null;
const listeners = new Set<(index: SpriteIndex) => void>();

/** The index once loaded, else null. */
export function spriteIndexNow(): SpriteIndex | null {
  return current;
}

/** Load the index once; later calls share the same promise. A missing file means "no art yet", never an error. */
export function loadSpriteIndex(): Promise<SpriteIndex> {
  if (pending) return pending;
  pending = (async () => {
    let sprites: string[] = [];
    let ui: string[] = [];
    let mounts: Record<string, MountEntry> = {};
    try {
      const res = await fetch('/sprites/manifest.json', { cache: 'no-cache' });
      if (res.ok) {
        const m = (await res.json()) as Manifest;
        if (Array.isArray(m.sprites)) sprites = m.sprites;
        if (Array.isArray(m.ui)) ui = m.ui;
      }
    } catch {
      // offline first run: no art, vector stand-ins carry the game
    }
    try {
      const res = await fetch('/sprites/mounts.json', { cache: 'no-cache' });
      if (res.ok) {
        const m = (await res.json()) as { towers?: Record<string, MountEntry> };
        if (m.towers && typeof m.towers === 'object') mounts = m.towers;
      }
    } catch {
      // default mounts
    }
    current = new SpriteIndex(sprites, ui, mounts);
    for (const fn of listeners) fn(current);
    listeners.clear();
    return current;
  })();
  return pending;
}

/** Call fn once the index is loaded (at once when it already is). Returns an unsubscribe. */
export function onSpriteIndex(fn: (index: SpriteIndex) => void): () => void {
  if (current) {
    fn(current);
    return () => undefined;
  }
  listeners.add(fn);
  void loadSpriteIndex();
  return () => {
    listeners.delete(fn);
  };
}
