// Extra Terram — src/engine/types.ts v0.8.0 — base weapon effects per tower (`effects`), seats, sends
// Content types (mirroring src/content/schemas) and simulation state.
// Everything in SimState is plain JSON so a snapshot is just JSON.stringify(state).
import type { RngState } from './rng';

export const ENGINE_VERSION = '0.4.0';
export const TICK_RATE = 20; // sim ticks per second
export const TICK_SEC = 1 / TICK_RATE; // seconds per tick
export const SELL_REFUND = 0.7;

/**
 * Sends (Mirror mode): a player pays sap to drop extra creeps into a rival's lane and earns a
 * little income on every later wave for it. cost = bounty × SEND_COST_MULT; income per wave =
 * ceil(cost / SEND_INCOME_DIV). A rusher costs 13 and pays 2 a wave, a tank 75 and pays 10.
 */
export const SEND_COST_MULT = 2.5;
export const SEND_INCOME_DIV = 8;
export const SEND_INTERVAL_TICKS = 6; // spacing between creeps of one send on the receiving board
export const SEND_MAX_COUNT = 10;

/**
 * Co-op (one shared board): every seat has its own wallet and the full starting sap, so the waves
 * grow with the party: hp × (1 + HP × (players − 1)), count × (1 + COUNT × (players − 1)).
 */
export const COOP_HP_PER_PLAYER = 0.3;
export const COOP_COUNT_PER_PLAYER = 0.25;

// ---------------------------------------------------------------- content

export type DamageType = 'kinetic' | 'energy' | 'bio';
export type ArmorType = 'organic' | 'plated' | 'shielded';
export type TowerRole = 'starter' | 'heavy' | 'control' | 'splash' | 'range' | 'economy' | 'trap' | 'support';
export type CreepArchetype = 'rusher' | 'workhorse' | 'tank' | 'tower-attacker' | 'flyer' | 'path-skipper' | 'buffer' | 'boss';

/**
 * What makes a race play differently from the others. One passive per race; every field is optional
 * so a race's JSON only states what it uses. Effects are applied in the sim (src/engine/sim.ts,
 * `passiveFor` and the call sites named below) and shown in the tower panel.
 */
export interface RacePassive {
  id: 'rooted' | 'spin-up' | 'hive' | 'overcharge';
  name: string;
  description: string;
  /** Rooted (Rootkin): towers start weaker and gain damage and range for every wave they stand through. */
  startDamageMult?: number;
  growthDamagePerWave?: number;
  growthRangePerWave?: number;
  growthCapWaves?: number;
  /** Spin-up (Assembly): each shot within `spinUpResetTicks` of the last speeds the next; kills pay more; upgrades cost more. */
  spinUpPerShot?: number;
  spinUpMax?: number;
  spinUpResetTicks?: number;
  bountyMult?: number;
  upgradeCostMult?: number;
  /** Hive (Chitin): towers near other towers fire faster; acid stacks; selling refunds less. */
  hiveRadius?: number;
  hiveCooldownPerNeighbour?: number;
  hiveMaxNeighbours?: number;
  bleedStacks?: number;
  sellRefund?: number;
  /** Overcharge (Lumenari): the first shot after idling hits harder; beams pierce; everything costs and cools slower. */
  alphaIdleTicks?: number;
  alphaMult?: number;
  beamPierce?: number;
  cooldownMult?: number;
  costMult?: number;
}

export interface RaceDef {
  id: string;
  name: string;
  description: string;
  /** One line for the race picker: how it plays. */
  tagline: string;
  damageTypes: DamageType[];
  creepArmor: ArmorType;
  palette: { primary: string; secondary: string };
  passive: RacePassive;
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
  /** Weapon traits the tower has from tier 1 (same fields as a branch); a branch adds to or multiplies them. */
  effects?: BranchEffects;
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

/**
 * Difficulty scaling for a level: level-wide multipliers plus a ramp per wave. hp(wave n) =
 * def.hp × hpMult × (1 + hpPerWave × n), same shape for speed; counts are multiplied and rounded up.
 * Bounties are not scaled, so harder levels are harder, not richer.
 */
export interface WaveScaling {
  hpMult: number;
  speedMult: number;
  countMult: number;
  hpPerWave: number;
  speedPerWave: number;
}

export const DEFAULT_SCALING: WaveScaling = { hpMult: 1, speedMult: 1, countMult: 1, hpPerWave: 0, speedPerWave: 0 };

export interface WaveScript {
  id: string;
  map: string;
  startingResources: number;
  lives: number;
  firstBuildTicks: number;
  buildTicks: number;
  waveBonus: number;
  scaling?: Partial<WaveScaling>;
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
  raceIndex: Record<string, RaceDef>;
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
  speedMult: number; // level scaling × wave ramp, fixed at spawn
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
  bleedStacks: number; // hive acid stacks (1 = a single application)
  sentBy: number; // seat that sent this creep (Mirror), -1 for the level's own waves
  alive: boolean;
}

export interface Tower {
  id: number;
  def: string;
  owner: number; // seat that built it (0 in single player); only the owner upgrades or sells it
  col: number;
  row: number;
  tier: 1 | 2 | 3;
  branch: 'a' | 'b' | null;
  cooldown: number;
  placedTick: number;
  placedWave: number; // waveIndex when placed (rooted growth counts waves stood since)
  lastFireTick: number; // -1 until the first shot (spin-up decay, overcharge idle check)
  heat: number; // spin-up stacks
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
  sentBy?: number; // seat that sent it (Mirror); absent for the level's waves
}

export type Phase = 'build' | 'wave' | 'won' | 'lost';

export type SimInput =
  | { type: 'place'; tower: string; col: number; row: number }
  | { type: 'upgrade'; towerId: number; branch?: 'a' | 'b' }
  | { type: 'sell'; towerId: number }
  | { type: 'start-wave' }
  /** Mirror: pay to send creeps to a rival (this board only pays and books the income). */
  | { type: 'send'; creep: string; count: number }
  /** Mirror: creeps a rival sent arrive on this board (queued for now, or for the next wave during a build phase). */
  | { type: 'receive'; creep: string; count: number; from: number };

/** An input as recorded in the log: who sent it and the tick it applied on. */
export type LoggedInput = SimInput & { tick: number; seat: number; seq: number };

/**
 * Transient events raised during one tick, for the renderer only. Cleared at the start of every
 * step, excluded from the state hash, never read by the sim itself.
 */
export type SimEvent =
  | { kind: 'fire'; tower: number; x: number; y: number; tx: number; ty: number; damageType: DamageType; alpha?: boolean }
  | { kind: 'hit'; x: number; y: number; damageType: DamageType; amount: number; kill: boolean; splash?: number }
  | { kind: 'beam'; tower: number; x: number; y: number; tx: number; ty: number; damageType: DamageType; alpha?: boolean }
  | { kind: 'income'; tower: number; x: number; y: number; amount: number }
  | { kind: 'kill'; creep: string; x: number; y: number; armor: ArmorType }
  | { kind: 'leak'; creep: string; x: number; y: number }
  | { kind: 'place'; tower: number; x: number; y: number }
  | { kind: 'upgrade'; tower: number; x: number; y: number; tier: number }
  | { kind: 'sell'; x: number; y: number }
  | { kind: 'wave'; index: number }
  | { kind: 'send'; creep: string; count: number; seat: number }
  | { kind: 'incoming'; creep: string; count: number; from: number };

export interface SimStats {
  kills: number;
  leaks: number;
  spent: number;
  earned: number;
  damageDealt: number;
  sent: number; // creeps this board sent to rivals
  received: number; // creeps rivals sent here
}

/** How a sim is set up beyond the level: seats for a shared board, sends for mirrored ones. */
export interface SimOptions {
  /** Wallets to create (one per seat). 1 in single player; the lobby size in co-op. */
  seats?: number;
  /** Players actually in the party (drives co-op wave scaling). */
  party?: number;
  /** Shared-board co-op: scale the waves for the party. */
  coop?: boolean;
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
  seats: number;
  party: number;
  coop: boolean;
  wallets: number[]; // sap per seat; single player uses wallets[0]
  sendIncome: number[]; // per seat: extra sap paid at the end of every wave, earned by sending
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
  seat: number; // the seat this view is for
  resources: number; // that seat's wallet
  wallets: number[];
  sendIncome: number; // that seat's income from sends, per wave
  lives: number;
  score: number;
  creepsAlive: number;
  towers: number;
  stats: SimStats;
  result: SimResult | null;
}
