// Extra Terram — src/engine/types.ts v0.4.0 — splash, beam, economy, support towers; more branch effects
// Content types (mirroring src/content/schemas) and simulation state.
// Everything in SimState is plain JSON so a snapshot is just JSON.stringify(state).
import type { RngState } from './rng';

export const ENGINE_VERSION = '0.1.0';
export const TICK_RATE = 20; // sim ticks per second
export const TICK_SEC = 1 / TICK_RATE; // seconds per tick
export const SELL_REFUND = 0.7;

// ---------------------------------------------------------------- content

export type DamageType = 'kinetic' | 'energy' | 'bio';
export type ArmorType = 'organic' | 'plated' | 'shielded';
export type TowerRole = 'starter' | 'heavy' | 'control' | 'splash' | 'range' | 'economy' | 'trap' | 'support';
export type CreepArchetype = 'rusher' | 'workhorse' | 'tank' | 'tower-attacker' | 'flyer' | 'path-skipper' | 'buffer' | 'boss';

export interface RaceDef {
  id: string;
  name: string;
  description: string;
  damageTypes: DamageType[];
  creepArmor: ArmorType;
  palette: { primary: string; secondary: string };
}

export interface DamageMatrix {
  content_version: string;
  multipliers: Record<DamageType, Record<ArmorType, number>>;
}

export interface TierDef {
  upgradeCost: number;
  damageMult: number;
  rangeMult: number;
  cooldownMult: number;
}

export interface BranchEffects {
  armorPierce?: boolean;
  multishot?: number;
  rangeMult?: number;
  damageMult?: number;
  cooldownMult?: number;
  slowBonus?: number;
  stunTicksOnEntry?: number;
  bleedPerSecond?: number;
  bleedTicks?: number;
  /** Splash radius multiplier (splash towers). */
  splashMult?: number;
  /** Extra targets a beam jumps to (beam towers). */
  chain?: number;
  /** Chance per hit of double damage, 0..1, rolled on the sim RNG. */
  critChance?: number;
  /** Slow applied on hit (fraction) for slowTicks. */
  slowOnHit?: number;
  slowTicks?: number;
  /** Income multiplier (economy towers). */
  incomeMult?: number;
  /** Added to every buff multiplier (support towers), e.g. 0.1 = +10% more. */
  buffBonus?: number;
}

export interface BranchDef {
  id: string;
  name: string;
  description: string;
  effects: BranchEffects;
}

export interface AuraDef {
  slow: number;
  dotPerSecond: number;
  dotType: DamageType;
}

/** Support towers buff every tower in range: multipliers on damage, range and fire rate. */
export interface BuffDef {
  damageMult: number;
  rangeMult: number;
  cooldownMult: number;
}

export type AttackKind = 'projectile' | 'aura' | 'beam' | 'economy' | 'support';

export interface TowerDef {
  id: string;
  race: string;
  name: string;
  role: TowerRole;
  description: string;
  cost: number;
  range: number; // tiles
  damage: number; // per hit; 0 for aura towers
  damageType: DamageType;
  cooldownTicks: number;
  attack: AttackKind;
  projectileSpeed?: number; // tiles per second
  aura?: AuraDef;
  /** Splash radius in tiles around a projectile's impact (projectile towers). */
  splash?: number;
  /** Extra targets a beam chains to after the first (beam towers). */
  chain?: number;
  /** Sap paid at the end of every wave (economy towers). */
  income?: number;
  /** Buff for towers in range (support towers). */
  buff?: BuffDef;
  tiers: TierDef[]; // index 0 = tier 1
  branches: { a: BranchDef; b: BranchDef };
  color: string;
}

export interface CreepDef {
  id: string;
  race: string;
  name: string;
  archetype: CreepArchetype;
  hp: number;
  speed: number; // tiles per second
  armor: ArmorType;
  bounty: number;
  leakCost: number;
  radius: number;
  color: string;
}

export type TileKindName = 'scenery' | 'path' | 'pad' | 'spawn' | 'exit' | 'water';

export interface MapDef {
  id: string;
  name: string;
  world: string;
  difficulty: 'easy' | 'normal' | 'hard';
  cols: number;
  rows: number;
  legend: Record<string, TileKindName>;
  grid: string[];
  background: string;
  content_version: string;
}

export interface WaveGroup {
  creep: string;
  count: number;
  intervalTicks: number;
  delayTicks: number;
}

export interface WaveDef {
  name?: string;
  groups: WaveGroup[];
}

export interface WaveScript {
  id: string;
  map: string;
  startingResources: number;
  lives: number;
  firstBuildTicks: number;
  buildTicks: number;
  waveBonus: number;
  waves: WaveDef[];
  content_version: string;
}

export interface ContentPack {
  version: string;
  races: RaceDef[];
  towers: TowerDef[];
  creeps: CreepDef[];
  damage: DamageMatrix;
}

/** Static, read-only context for a run. Never serialized; rebuilt from content on load. */
export interface SimContext {
  content: ContentPack;
  map: MapDef;
  waves: WaveScript;
  towerIndex: Record<string, TowerDef>;
  creepIndex: Record<string, CreepDef>;
}

// ---------------------------------------------------------------- state

/** Tile kinds as stored in SimState.grid. */
export const TILE = { scenery: 0, path: 1, pad: 2, spawn: 3, exit: 4, water: 5 } as const;
export type TileKind = (typeof TILE)[keyof typeof TILE];

export interface Point {
  x: number;
  y: number;
}

export interface Creep {
  id: number;
  def: string;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  px: number; // position at the previous tick, for render interpolation
  py: number;
  wp: number; // index of the next waypoint
  dist: number; // distance travelled along the path (targeting priority)
  slowTicks: number;
  slowFactor: number;
  stunTicks: number;
  stunnedBy: number; // tower id that last entangled this creep
  bleedPerSecond: number;
  bleedTicks: number;
  alive: boolean;
}

export interface Tower {
  id: number;
  def: string;
  col: number;
  row: number;
  tier: 1 | 2 | 3;
  branch: 'a' | 'b' | null;
  cooldown: number;
  placedTick: number;
  invested: number;
  kills: number;
  damageDealt: number;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  px: number;
  py: number;
  target: number; // creep id
  speed: number; // tiles per second
  damage: number;
  damageType: DamageType;
  armorPierce: boolean;
  bleedPerSecond: number;
  bleedTicks: number;
  splash: number; // tiles; 0 = single target
  slowOnHit: number;
  slowTicks: number;
  critChance: number;
  owner: number; // tower id
  alive: boolean;
}

export interface SpawnEntry {
  creep: string;
  tick: number;
}

export type Phase = 'build' | 'wave' | 'won' | 'lost';

export type SimInput =
  | { type: 'place'; tower: string; col: number; row: number }
  | { type: 'upgrade'; towerId: number; branch?: 'a' | 'b' }
  | { type: 'sell'; towerId: number }
  | { type: 'start-wave' };

/** An input as recorded in the log: who sent it and the tick it applied on. */
export type LoggedInput = SimInput & { tick: number; seat: number; seq: number };

/**
 * Transient events raised during one tick, for the renderer only. Cleared at the start of every
 * step, excluded from the state hash, never read by the sim itself.
 */
export type SimEvent =
  | { kind: 'fire'; tower: number; x: number; y: number; tx: number; ty: number; damageType: DamageType }
  | { kind: 'hit'; x: number; y: number; damageType: DamageType; amount: number; kill: boolean; splash?: number }
  | { kind: 'beam'; tower: number; x: number; y: number; tx: number; ty: number; damageType: DamageType }
  | { kind: 'income'; tower: number; x: number; y: number; amount: number }
  | { kind: 'kill'; creep: string; x: number; y: number; armor: ArmorType }
  | { kind: 'leak'; creep: string; x: number; y: number }
  | { kind: 'place'; tower: number; x: number; y: number }
  | { kind: 'upgrade'; tower: number; x: number; y: number; tier: number }
  | { kind: 'sell'; x: number; y: number }
  | { kind: 'wave'; index: number };

export interface SimStats {
  kills: number;
  leaks: number;
  spent: number;
  earned: number;
  damageDealt: number;
}

export interface SimResult {
  outcome: 'won' | 'lost';
  stars: 0 | 1 | 2 | 3;
  wavesCleared: number;
  score: number;
  ticks: number;
}

export interface SimState {
  engineVersion: string;
  contentVersion: string;
  mapId: string;
  seed: string;
  tick: number;
  phase: Phase;
  waveIndex: number; // -1 before the first wave
  buildTimer: number; // ticks until the next wave auto-starts
  waveStartTick: number;
  resources: number;
  lives: number;
  score: number;
  rng: RngState;
  nextId: number;
  cols: number;
  rows: number;
  grid: TileKind[];
  waypoints: Point[];
  occupied: number[]; // tower id per cell, -1 when empty
  creeps: Creep[];
  towers: Tower[];
  projectiles: Projectile[];
  spawnQueue: SpawnEntry[];
  inputLog: LoggedInput[];
  events: SimEvent[];
  stats: SimStats;
  result: SimResult | null;
}

/** The HUD's view of the sim: small, cheap to build, updated at human speed. */
export interface SimView {
  tick: number;
  phase: Phase;
  wave: number; // 1-based current wave (0 before the first)
  waves: number;
  waveName: string;
  buildTimer: number;
  resources: number;
  lives: number;
  score: number;
  creepsAlive: number;
  towers: number;
  stats: SimStats;
  result: SimResult | null;
}
