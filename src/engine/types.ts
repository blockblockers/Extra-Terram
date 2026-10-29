// Extra Terram — src/engine/types.ts v0.13.0 — WaveScaling.rampWaves; versus boards: Lanes and King of the Maze (routes per slot, sides with their own lives, eliminations, placements)
// Content types (mirroring src/content/schemas) and simulation state.
// Everything in SimState is plain JSON so a snapshot is just JSON.stringify(state).
import type { RngState } from './rng';

export const ENGINE_VERSION = '0.8.0';
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
/** A mini-boss can be sent from this round on (1-based), one at a time; it arrives at the round's boss strength. */
export const BOSS_SEND_FROM_ROUND = 8;
/** A sent mini-boss pays its sender less income per wave than its cost would suggest: cost / (SEND_INCOME_DIV × this). */
export const BOSS_SEND_INCOME_DIV_MULT = 2;

/**
 * Co-op (one shared board): every seat has its own wallet and the full starting sap, so the waves
 * grow with the party: hp × (1 + HP × (players − 1)), count × (1 + COUNT × (players − 1)).
 */
export const COOP_HP_PER_PLAYER = 0.3;
export const COOP_COUNT_PER_PLAYER = 0.2;
/**
 * Two players can only build on the pads there are, so the party scaling above applies in full on a
 * map with COOP_PADS_FULL pads or more and fades to nothing at COOP_PADS_NONE: f = clamp((pads - none) / (full - none)).
 */
export const COOP_PADS_FULL = 40;
export const COOP_PADS_NONE = 10;

/**
 * Versus boards (one board, rivals). Lanes: every live lane gets the full wave; a 2 v 2 team shares
 * one life pool of lives × members. King of the Maze: one wave comes down the shared trail and every
 * creep picks a live base in turn; the wave grows with the players defending it:
 * count × (1 + KING_COUNT_PER_PLAYER × (players − 1)), hp × (1 + KING_HP_PER_PLAYER × (players − 1)).
 */
export const KING_COUNT_PER_PLAYER = 0.7;
export const KING_HP_PER_PLAYER = 0.1;

/**
 * Run rules, chosen before a game (single player on the menu, the host in a lobby).
 *   rounds      1..MAX_ROUNDS. Rounds past the level's script are generated from its second half,
 *               growing in hp, numbers and a little speed (each with a ceiling), with raids by other
 *               races every third generated round. Shorter than the script ends the run early.
 *   bossEvery   a mini-boss closes every Nth round (0 = never): the race's tank grown huge, big bounty.
 *   difficulty  index into DIFFICULTIES (offered for co-op): more hp, more creeps, a touch faster.
 * Score grows with the round: kills and wave bonuses count SCORE_PER_ROUND more per round reached.
 */
export const MAX_ROUNDS = 100;
/**
 * Reinforce: once a tower is at tier 3, each level adds REINFORCE_STEP of its damage (and field
 * damage), up to MAX_REINFORCE levels. Level n costs REINFORCE_COST x (1 + n / 2) x what tiers 1-3
 * cost. It keeps long runs winnable on maps with few pads, where money piles up with nowhere to go;
 * the cap sits above what a 100-round run usually affords, so late money always has a use.
 */
export const REINFORCE_STEP = 0.15;
export const MAX_REINFORCE = 25;
export const REINFORCE_COST = 0.35;
export const SCORE_PER_ROUND = 0.05;
export const BOSS_SCORE_MULT = 3;
/**
 * Mini-bosses grow into their strength: hp x round / BOSS_FULL_ROUND (full from round 15), so an early
 * boss is a test, not the end of a run. Past the script they take BOSS_POST_GROWTH of the regular hp
 * growth, or they would outgrow any defence. Their bounty grows with them from BOSS_BOUNTY_FLOOR.
 */
export const BOSS_FULL_ROUND = 15;
export const BOSS_POST_GROWTH = 0.5;
export const BOSS_BOUNTY_FLOOR = 0.4;
/** Past the script: hp x (1 + POST_HP_MAX * x / (x + POST_HP_K)), x = rounds past the script; same shape for counts and speed. */
export const POST_HP_MAX = 3;
export const POST_HP_K = 30;
export const POST_COUNT_MAX = 1.5;
export const POST_COUNT_K = 30;
export const POST_SPEED_MAX = 0.25;
export const POST_SPEED_K = 40;

/**
 * A difficulty tier raises the level's own difficulty factor by `delta` — the same five knobs the
 * levels are tuned with (hp +0.35, speed +0.1, count +0.15 per unit; and per-wave ramps +0.05 hp,
 * +0.015 speed) — so Hard on an easy map plays about like a normal map, and Brutal like a hard one.
 */
export interface DifficultyDef {
  id: 'standard' | 'hard' | 'brutal';
  name: string;
  delta: number;
}

export const DIFFICULTIES: DifficultyDef[] = [
  { id: 'standard', name: 'Standard', delta: 0 },
  { id: 'hard', name: 'Hard', delta: 0.5 },
  { id: 'brutal', name: 'Brutal', delta: 1.0 },
];

export interface RunRules {
  rounds: number;
  bossEvery: number;
  difficulty: number;
}

// ---------------------------------------------------------------- content

/**
 * Every race deals its own damage type and its creeps wear their own armour. The damage matrix makes a
 * cycle — Rootkin beat the Assembly, the Assembly beat the Lumenari, the Lumenari beat the Chitin, the
 * Chitin beat the Rootkin — so every race has one race it is strong against and one it is weak against.
 */
export type DamageType = 'thorn' | 'kinetic' | 'acid' | 'energy';
export type ArmorType = 'bark' | 'plated' | 'carapace' | 'shielded';
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
  /** The precise version, for Race details: weapons, the passive in numbers, the price. */
  description: string;
  /** One line: how it plays. */
  tagline: string;
  /** Plain English for the race picker: what kind of aliens, how they fight. */
  blurb: string;
  /** Two or three short plain-English upsides and downsides. */
  pros: string[];
  cons: string[];
  /** What this race's money is called (lower case): sap, scrap, resin, lumen. */
  currency: string;
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
  /** Draw with another creep's art (mini-bosses reuse their race's tank, drawn larger). */
  art?: string;
}

export type TileKindName = 'scenery' | 'path' | 'pad' | 'spawn' | 'exit' | 'water';

/** One board, rivals: a lane per player, or a shared trail forking to a base per player or team. */
export type VersusMode = 'lanes' | 'king';

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
  /** Versus maps only: the mode they are built for. Solo and co-op maps leave it out. */
  mode?: VersusMode;
  /** Versus maps: lanes (lanes) or bases (king). */
  slots?: number;
  /** Versus maps: like `grid`, a digit per cell owned by that lane or base (its pads are that player's), '.' shared. */
  zones?: string[];
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
  /** hpMult and speedMult phase in over this many waves: wave 1 gets a 1/(n+1) share of the extra, wave n+1 the full amount. 0 = from wave 1. Counts are never eased. */
  rampWaves: number;
}

export const DEFAULT_SCALING: WaveScaling = { hpMult: 1, speedMult: 1, countMult: 1, hpPerWave: 0, speedPerWave: 0, rampWaves: 0 };

/** How rounds past the script grow, per level (each growth is 1 + max * x / (x + k), x = rounds past the script). */
export interface EndlessGrowth {
  hpMax: number;
  hpK: number;
  countMax: number;
  countK: number;
  speedMax: number;
  speedK: number;
}

export interface WaveScript {
  id: string;
  map: string;
  startingResources: number;
  lives: number;
  firstBuildTicks: number;
  buildTicks: number;
  waveBonus: number;
  scaling?: Partial<WaveScaling>;
  /** Growth past the script when a run is set longer than the level; defaults to the POST_* constants. */
  endless?: Partial<EndlessGrowth>;
  /** This level's steps for the Hard and Brutal tiers (in level-factor units); defaults to DIFFICULTIES. */
  difficulty?: { hard?: number; brutal?: number };
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
  /** Build pads on the map (co-op scales the waves less on maps with few pads: there is less room to build). */
  padCount: number;
  /** Per cell: the lane or base it belongs to, -1 shared (versus maps; all -1 elsewhere). */
  zones: number[];
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
  bleedType: DamageType; // the damage type of whatever made it bleed
  bleedOwner: number; // tower id that made it bleed (its owner gets the bounty), -1 none
  sentBy: number; // seat that sent this creep (Mirror, versus), -1 for the level's own waves
  route: number; // the route it walks: its lane, or the way to the base it attacks (0 on solo maps)
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
  boost: number; // Reinforce levels bought at tier 3 (0..MAX_REINFORCE)
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
  sentBy?: number; // seat that sent it (Mirror, versus); absent for the level's waves
  route?: number; // versus: its lane or base; King creeps without one pick a base when they spawn
  atWp?: number; // start at this waypoint of its route (King sends land at the target's fork)
}

export type Phase = 'build' | 'wave' | 'won' | 'lost';

export type SimInput =
  | { type: 'place'; tower: string; col: number; row: number }
  | { type: 'upgrade'; towerId: number; branch?: 'a' | 'b' }
  | { type: 'sell'; towerId: number }
  /** Tier 3 only: +REINFORCE_STEP damage, up to MAX_REINFORCE times; where late-game money goes. */
  | { type: 'reinforce'; towerId: number }
  | { type: 'start-wave' }
  /** Mirror: pay to send creeps to a rival (this board only pays and books the income). Versus: the sim queues them on the chosen rival side (`target`), or on one it picks. */
  | { type: 'send'; creep: string; count: number; target?: number }
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
  | { kind: 'boss'; creep: string }
  /** A send paid for by `seat`; on a versus board, `side` is the rival it went to and `slot` the lane or base it lands in. */
  | { kind: 'send'; creep: string; count: number; seat: number; side?: number; slot?: number }
  | { kind: 'incoming'; creep: string; count: number; from: number }
  | { kind: 'out'; side: number };

export interface SimStats {
  kills: number;
  leaks: number;
  spent: number;
  earned: number;
  damageDealt: number;
  sent: number; // creeps this board sent to rivals
  received: number; // creeps rivals sent here
  bosses: number; // mini-bosses defeated
}

/** How a sim is set up beyond the level: seats for a shared board, sends for mirrored ones. */
export interface SimOptions {
  /** Wallets to create (one per seat). 1 in single player; the lobby size in co-op. */
  seats?: number;
  /** Players actually in the party (drives co-op wave scaling). */
  party?: number;
  /** Shared-board co-op: scale the waves for the party. */
  coop?: boolean;
  /** Run rules (see RunRules); each defaults to the level as written. */
  rounds?: number;
  bossEvery?: number;
  difficulty?: number;
  /** One board, rivals (the map must be built for it). Seat n takes slot n; 2 v 2 see `teams`. */
  versus?: VersusMode;
  /** Versus 2 v 2: seats 0 and 2 against seats 1 and 3. */
  teams?: boolean;
  /** Versus: seats actually playing (a missing seat's lane or base is closed). Defaults to every seat. */
  present?: number[];
}

export interface SimResult {
  outcome: 'won' | 'lost';
  stars: 0 | 1 | 2 | 3;
  wavesCleared: number;
  score: number;
  ticks: number;
  /** Versus: placement per side, 1 = the winner. */
  placements?: number[];
}

/** A player, or a 2 v 2 team, on a versus board. */
export interface Side {
  seats: number[];
  /** Lanes (Lanes) or the base (King) it defends. */
  slots: number[];
  lives: number;
  /** Fell: its lives ran out. */
  out: boolean;
  outTick: number; // -1 while standing
  outWave: number; // the round it fell in, 0-based (-1 while standing)
  score: number;
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
  rules: RunRules;
  wallets: number[]; // sap per seat; single player uses wallets[0]
  sendIncome: number[]; // per seat: extra sap paid at the end of every wave, earned by sending
  lives: number;
  score: number;
  rng: RngState;
  nextId: number;
  cols: number;
  rows: number;
  grid: TileKind[];
  /** One waypoint route per slot: lane n, or the way to base n (a single route on solo maps). */
  routes: Point[][];
  /** Per route: its first waypoint inside its own zone (King sends land there); 0 elsewhere. */
  forkWp: number[];
  /** Versus: 'lanes' or 'king'; null in single player and co-op. */
  versus: VersusMode | null;
  teams: boolean;
  /** Versus: the sides (players or teams); empty in single player and co-op. */
  sides: Side[];
  /** Versus: per slot, the side defending it (-1: closed — nobody there, or fallen). */
  slotSide: number[];
  /** Versus: per seat, its side (-1: not playing). */
  seatSide: number[];
  /** King: round-robin counter for the base each creep picks. */
  turn: number;
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
  /** The current round ends with a mini-boss / the next one does (for the HUD). */
  waveBoss: boolean;
  nextBoss: boolean;
  /** A mini-boss is on the board right now. */
  bossAlive: boolean;
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
  /** Versus boards: the sides and which one this seat is on. */
  versus: VersusView | null;
  /** The next wave while the build window is open (null during a wave, or when the run is over). */
  nextWave: WavePreview | null;
}

/** What the next wave brings, for the HUD: the level's groups at this run's counts, rivals' sends that lead it, its mini-boss. */
export interface WavePreview {
  index: number; // 1-based wave number
  name: string;
  /** One entry per creep kind, in spawn order; versus Lanes: per lane. */
  groups: Array<{ creep: string; count: number }>;
  /** Creeps rivals sent that will lead this wave (Mirror, versus). */
  sent: Array<{ creep: string; count: number }>;
  boss: string | null;
  /** Lanes: the groups come down every open lane. */
  perLane: boolean;
}

export interface VersusView {
  mode: VersusMode;
  teams: boolean;
  /** This seat's side (-1: watching). */
  side: number;
  out: boolean;
  sides: Array<{ seats: number[]; slots: number[]; lives: number; out: boolean; outWave: number; score: number }>;
  /** Placement per side once the match is over. */
  placements: number[] | null;
}
