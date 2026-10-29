// Extra Terram — src/engine/sim.ts v0.11.0 — early-wave ramp (rampWaves eases the level multipliers in); versus boards: Lanes (a lane per player, sends into rivals' lanes) and King of the Maze (a shared trail forking to bases)
// The deterministic simulation: 20 Hz fixed tick, plain-JSON state, no wall clock, no Math.random.
// Everything here runs identically in the browser, in Node (scripts/sim-smoke.ts) and, later,
// on the server for replay verification. Keep it that way.
import { createRng, nextFloat, nextInt } from './rng';
import { parseMap, parseZones, cellIndex, sharedPrefix } from './map';
import {
  BOSS_BOUNTY_FLOOR,
  BOSS_FULL_ROUND,
  BOSS_POST_GROWTH,
  BOSS_SCORE_MULT,
  COOP_COUNT_PER_PLAYER,
  COOP_HP_PER_PLAYER,
  COOP_PADS_FULL,
  COOP_PADS_NONE,
  DIFFICULTIES,
  ENGINE_VERSION,
  KING_COUNT_PER_PLAYER,
  KING_HP_PER_PLAYER,
  MAX_ROUNDS,
  POST_COUNT_K,
  POST_COUNT_MAX,
  POST_HP_K,
  POST_HP_MAX,
  POST_SPEED_K,
  POST_SPEED_MAX,
  REINFORCE_STEP,
  SCORE_PER_ROUND,
  BOSS_SEND_FROM_ROUND,
  BOSS_SEND_INCOME_DIV_MULT,
  SEND_COST_MULT,
  SEND_INCOME_DIV,
  SEND_INTERVAL_TICKS,
  TICK_SEC,
  TILE,
  type BranchEffects,
  type ContentPack,
  type Creep,
  type CreepDef,
  type DamageType,
  type EndlessGrowth,
  type MapDef,
  type RaceDef,
  type RacePassive,
  type RunRules,
  type Side,
  type SimContext,
  type SimOptions,
  type SimResult,
  type SimState,
  type SimView,
  type SpawnEntry,
  type Tower,
  type TowerDef,
  type WaveDef,
  type WaveScaling,
  type WaveScript,
  DEFAULT_SCALING,
  type WavePreview,
} from './types';

/** Bundle content, map and waves into the static context the sim reads from. */
export function createContext(content: ContentPack, map: MapDef, waves: WaveScript): SimContext {
  const towerIndex: Record<string, TowerDef> = {};
  for (const t of content.towers) towerIndex[t.id] = t;
  const creepIndex: Record<string, CreepDef> = {};
  for (const c of content.creeps) creepIndex[c.id] = c;
  for (const w of waves.waves) for (const g of w.groups) if (!creepIndex[g.creep]) throw new Error(`wave script ${waves.id}: unknown creep ${g.creep}`);
  const raceIndex: Record<string, RaceDef> = {};
  for (const r of content.races) raceIndex[r.id] = r;
  let padCount = 0;
  for (const row of map.grid) for (const ch of row) if (map.legend[ch] === 'pad') padCount++;
  return { content, map, waves, towerIndex, creepIndex, raceIndex, padCount, zones: parseZones(map) };
}

// ---------------------------------------------------------------- race passives

const NO_PASSIVE: RacePassive = { id: 'rooted', name: '', description: '' };

/** The passive of the race a tower belongs to (an empty one for content without races). */
export function passiveFor(ctx: SimContext, def: TowerDef): RacePassive {
  return ctx.raceIndex[def.race]?.passive ?? NO_PASSIVE;
}

/** What a tower costs to place for its race. */
export function towerCost(ctx: SimContext, def: TowerDef): number {
  return Math.round(def.cost * (passiveFor(ctx, def).costMult ?? 1));
}

/** What the race's passive is doing to this tower right now; the sim applies it, the panel shows it. */
export interface PassiveMods {
  damageMult: number;
  rangeMult: number;
  cooldownMult: number;
  /** Rooted: waves stood through (capped). */
  wavesStood: number;
  /** Spin-up: current stacks. */
  heat: number;
  /** Hive: neighbours counted. */
  neighbours: number;
  /** Overcharge: the next shot is the alpha strike. */
  alphaReady: boolean;
}

export function passiveMods(state: SimState, ctx: SimContext, tower: Tower): PassiveMods {
  const def = ctx.towerIndex[tower.def];
  const p = passiveFor(ctx, def);
  const mods: PassiveMods = { damageMult: 1, rangeMult: 1, cooldownMult: 1, wavesStood: 0, heat: 0, neighbours: 0, alphaReady: false };
  if (p.growthDamagePerWave || p.growthRangePerWave || p.startDamageMult) {
    const stood = Math.min(p.growthCapWaves ?? 99, Math.max(0, state.waveIndex - tower.placedWave - 1));
    mods.wavesStood = stood;
    mods.damageMult *= (p.startDamageMult ?? 1) * (1 + (p.growthDamagePerWave ?? 0) * stood);
    mods.rangeMult *= 1 + (p.growthRangePerWave ?? 0) * stood;
  }
  if (p.spinUpPerShot) {
    const idle = tower.lastFireTick < 0 || state.tick - tower.lastFireTick > (p.spinUpResetTicks ?? 20);
    mods.heat = idle ? 0 : tower.heat;
    mods.cooldownMult *= 1 - Math.min(p.spinUpMax ?? 0.4, p.spinUpPerShot * mods.heat);
  }
  if (p.hiveCooldownPerNeighbour) {
    const r2 = (p.hiveRadius ?? 1.5) ** 2;
    let n = 0;
    for (const other of state.towers) {
      if (other.id === tower.id) continue;
      if (!sameLaneSide(state, tower, other)) continue;
      const dx = other.col - tower.col;
      const dy = other.row - tower.row;
      if (dx * dx + dy * dy <= r2) n++;
    }
    mods.neighbours = Math.min(p.hiveMaxNeighbours ?? 3, n);
    mods.cooldownMult *= 1 - p.hiveCooldownPerNeighbour * mods.neighbours;
  }
  if (p.cooldownMult) mods.cooldownMult *= p.cooldownMult;
  if (p.alphaMult) mods.alphaReady = tower.lastFireTick < 0 || state.tick - tower.lastFireTick >= (p.alphaIdleTicks ?? 40);
  return mods;
}

/** Tower stats with the support buff and the race passive applied: what the sim actually fires with. */
export function effectiveStats(state: SimState, ctx: SimContext, tower: Tower): { stats: TowerStats; mods: PassiveMods } {
  const def = ctx.towerIndex[tower.def];
  const base = towerStats(def, tower.tier, tower.branch, buffFor(state, ctx, tower));
  const mods = passiveMods(state, ctx, tower);
  const reinforced = 1 + REINFORCE_STEP * (tower.boost ?? 0);
  const stats: TowerStats = {
    ...base,
    damage: base.damage * mods.damageMult * reinforced,
    range: base.range * mods.rangeMult,
    cooldownTicks: Math.max(1, Math.round(base.cooldownTicks * mods.cooldownMult)),
    dotPerSecond: base.dotPerSecond * mods.damageMult * reinforced,
  };
  return { stats, mods };
}

/** After a shot: spin-up heat and the idle clock. */
function noteShot(state: SimState, ctx: SimContext, tower: Tower, def: TowerDef): void {
  const p = passiveFor(ctx, def);
  if (p.spinUpPerShot) {
    const idle = tower.lastFireTick < 0 || state.tick - tower.lastFireTick > (p.spinUpResetTicks ?? 20);
    const maxStacks = Math.floor((p.spinUpMax ?? 0.4) / p.spinUpPerShot);
    tower.heat = idle ? 1 : Math.min(maxStacks, tower.heat + 1);
  }
  tower.lastFireTick = state.tick;
}

export function createSim(ctx: SimContext, seed: string, opts: SimOptions = {}): SimState {
  const parsed = parseMap(ctx.map);
  const seats = Math.max(1, Math.floor(opts.seats ?? 1));
  const party = Math.min(seats, Math.max(1, Math.floor(opts.party ?? 1)));
  const rules = runRules(ctx, opts);
  const versus = opts.versus ?? null;
  if (versus && ctx.map.mode !== versus) throw new Error(`map ${ctx.map.id} is not a ${versus} map`);
  const rng = createRng(seed);
  const board = versus ? versusSetup(ctx, parsed.slots, seats, versus, !!opts.teams, opts.present) : { sides: [] as Side[], slotSide: [] as number[], seatSide: [] as number[] };
  return {
    engineVersion: ENGINE_VERSION,
    contentVersion: ctx.content.version,
    mapId: ctx.map.id,
    seed,
    tick: 0,
    phase: 'build',
    waveIndex: -1,
    buildTimer: ctx.waves.firstBuildTicks,
    waveStartTick: 0,
    seats,
    party,
    coop: !!opts.coop && seats > 1,
    rules,
    wallets: new Array<number>(seats).fill(ctx.waves.startingResources),
    sendIncome: new Array<number>(seats).fill(0),
    lives: ctx.waves.lives,
    score: 0,
    rng,
    nextId: 1,
    cols: parsed.cols,
    rows: parsed.rows,
    grid: parsed.grid,
    routes: parsed.routes,
    forkWp: parsed.forkWp,
    versus,
    teams: !!versus && !!opts.teams,
    sides: board.sides,
    slotSide: board.slotSide,
    seatSide: board.seatSide,
    // King: which base the first creep goes for is seeded, then every creep takes the next live base
    turn: versus === 'king' ? nextInt(rng, 0, Math.max(0, parsed.slots - 1)) : 0,
    occupied: new Array(parsed.cols * parsed.rows).fill(-1),
    creeps: [],
    towers: [],
    projectiles: [],
    spawnQueue: [],
    inputLog: [],
    events: [],
    stats: { kills: 0, leaks: 0, spent: 0, earned: 0, damageDealt: 0, sent: 0, received: 0, bosses: 0 },
    result: null,
  };
}

// ---------------------------------------------------------------- run rules: rounds, mini-bosses, difficulty

/** The rules a run is played under: the options given, clamped, each defaulting to the level as written. */
export function runRules(ctx: SimContext, opts: SimOptions = {}): RunRules {
  const script = ctx.waves.waves.length;
  const clampInt = (v: number | undefined, lo: number, hi: number, dflt: number) => (v === undefined || !Number.isFinite(v) ? dflt : Math.min(hi, Math.max(lo, Math.floor(v))));
  return {
    rounds: clampInt(opts.rounds, 1, MAX_ROUNDS, script),
    bossEvery: clampInt(opts.bossEvery, 0, MAX_ROUNDS, 0),
    difficulty: clampInt(opts.difficulty, 0, DIFFICULTIES.length - 1, 0),
  };
}

// ---------------------------------------------------------------- versus boards: sides, slots, eliminations

/**
 * Who defends what. Free-for-all: seat n is a side holding slot n (its lane, or base n). 2 v 2: seats 0
 * and 2 are one side, 1 and 3 the other; in Lanes each player keeps a lane (a team's two lanes side by
 * side: seats 0, 2 → lanes 0, 1; seats 1, 3 → lanes 2, 3) and the team shares one life pool; in King a
 * team defends one base (team n → base n). Seats not playing leave their slot closed.
 */
function versusSetup(ctx: SimContext, slots: number, seats: number, mode: 'lanes' | 'king', teams: boolean, present?: number[]): { sides: Side[]; slotSide: number[]; seatSide: number[] } {
  const playing = (present ?? Array.from({ length: seats }, (_, i) => i)).filter((s) => Number.isInteger(s) && s >= 0 && s < seats).sort((a, b) => a - b);
  const slotSide = new Array<number>(slots).fill(-1);
  const seatSide = new Array<number>(seats).fill(-1);
  const sides: Side[] = [];
  const side = (seatsOf: number[], slotsOf: number[]): void => {
    const idx = sides.length;
    sides.push({ seats: seatsOf, slots: slotsOf, lives: ctx.waves.lives * seatsOf.length, out: false, outTick: -1, outWave: -1, score: 0 });
    for (const s of seatsOf) seatSide[s] = idx;
    for (const sl of slotsOf) slotSide[sl] = idx;
  };
  if (!teams) {
    if (seats > slots) throw new Error(`map ${ctx.map.id} has ${slots} ${mode === 'lanes' ? 'lanes' : 'bases'} for ${seats} seats`);
    for (const s of playing) side([s], [s]);
  } else {
    for (const team of [0, 1]) {
      const members = playing.filter((s) => s % 2 === team);
      if (!members.length) continue;
      if (mode === 'lanes') {
        if (slots < 4) throw new Error(`map ${ctx.map.id}: 2 v 2 Lanes needs 4 lanes`);
        side(members, members.map((s) => team * 2 + Math.floor(s / 2)));
      } else {
        if (slots < 2) throw new Error(`map ${ctx.map.id}: 2 v 2 King of the Maze needs 2 bases`);
        side(members, [team]);
      }
    }
  }
  return { sides, slotSide, seatSide };
}

/** Slots still defended (open lanes, standing bases), in slot order. */
export function liveSlots(state: SimState): number[] {
  const out: number[] = [];
  for (let s = 0; s < state.slotSide.length; s++) if (state.slotSide[s] >= 0 && !state.sides[state.slotSide[s]].out) out.push(s);
  return out;
}

/** Sides still standing. */
export function liveSides(state: SimState): number[] {
  return state.sides.map((_, i) => i).filter((i) => !state.sides[i].out);
}

/** The side a seat plays on (-1 when it is not playing or the board is not versus). */
export function sideOf(state: SimState, seat: number): number {
  return state.versus ? (state.seatSide[seat] ?? -1) : -1;
}

/**
 * Final order: sides still standing by lives, then score; then fallen sides, the last to fall first
 * (a later fall is a longer survival), then score. Index breaks exact ties, so every client agrees.
 */
export function rankSides(state: SimState): number[] {
  const idx = state.sides.map((_, i) => i);
  return idx.sort((a, b) => {
    const A = state.sides[a];
    const B = state.sides[b];
    if (A.out !== B.out) return A.out ? 1 : -1;
    if (!A.out) return B.lives - A.lives || B.score - A.score || a - b;
    return B.outTick - A.outTick || B.score - A.score || a - b;
  });
}

/** A side's lives ran out: close its lanes or base, clear what was coming for it, remove its towers. */
function eliminate(state: SimState, sideIdx: number): void {
  const side = state.sides[sideIdx];
  if (side.out) return;
  side.out = true;
  side.outTick = state.tick;
  side.outWave = state.waveIndex;
  for (const slot of side.slots) state.slotSide[slot] = -1;
  const closed = new Set(side.slots);
  // creeps on the way to it: in King those still on the shared trail go for another base
  const open = liveSlots(state);
  for (const c of state.creeps) {
    if (!c.alive || !closed.has(c.route)) continue;
    let moved = false;
    if (state.versus === 'king' && open.length) {
      for (let k = 0; k < open.length && !moved; k++) {
        const to = open[(state.turn + k) % open.length];
        if (sharedPrefix(state.routes[c.route], state.routes[to]) >= c.wp + 1) {
          c.route = to;
          moved = true;
        }
      }
      if (moved) state.turn++;
    }
    if (!moved) c.alive = false;
  }
  state.creeps = state.creeps.filter((c) => c.alive);
  state.spawnQueue = state.spawnQueue.filter((q) => q.route === undefined || !closed.has(q.route));
  // its towers come down; their pads stay empty
  for (const t of state.towers) {
    if (side.seats.includes(t.owner)) {
      state.occupied[cellIndex(state.cols, t.col, t.row)] = -1;
      state.events.push({ kind: 'sell', x: t.col + 0.5, y: t.row + 0.5 });
    }
  }
  state.towers = state.towers.filter((t) => !side.seats.includes(t.owner));
  state.events.push({ kind: 'out', side: sideIdx });
  if (state.sides.length > 1 && liveSides(state).length <= 1) finishVersus(state);
  else if (state.sides.length === 1) finishVersus(state);
}

/** End a versus board: everyone's placement from rankSides. */
function finishVersus(state: SimState): void {
  if (state.phase === 'won' || state.phase === 'lost') return;
  const order = rankSides(state);
  const placements = new Array<number>(state.sides.length).fill(0);
  order.forEach((sideIdx, i) => (placements[sideIdx] = i + 1));
  const anyStanding = state.sides.some((s) => !s.out);
  state.phase = anyStanding ? 'won' : 'lost';
  for (const s of state.sides) if (!s.out) s.score += s.lives * 25;
  state.result = { outcome: state.phase, stars: 0, wavesCleared: Math.max(0, state.waveIndex + (anyStanding ? 1 : 0)), score: state.score, ticks: state.tick, placements };
}

/** True when a run is the level exactly as written (campaign stars and top scores count only these). */
export function isStandardRun(ctx: SimContext, rules: RunRules): boolean {
  return rules.rounds === ctx.waves.waves.length && rules.bossEvery === 0 && rules.difficulty === 0;
}

/** The race a wave belongs to: the race of its first group. */
function waveRace(ctx: SimContext, wave: WaveDef): string {
  return ctx.creepIndex[wave.groups[0]?.creep]?.race ?? ctx.content.races[0].id;
}

/**
 * Round `index` (0-based): the script's wave while it lasts, then a generated round. Generated rounds
 * cycle through the script's second half (its harder waves); every third one brings a raid by another
 * race. Counts, hp and speed grow on top of this in beginWave / waveMultipliers.
 */
export function waveAt(ctx: SimContext, index: number): WaveDef {
  const script = ctx.waves.waves;
  const L = script.length;
  if (index < L) return script[Math.max(0, index)];
  const half = Math.floor(L / 2);
  const span = Math.max(1, L - half);
  const x = index - L;
  const template = script[half + (x % span)];
  const groups = template.groups.map((g) => ({ ...g }));
  if (x % 3 === 2) {
    const main = waveRace(ctx, template);
    const others = ctx.content.races.filter((r) => r.id !== main);
    const raider = others[Math.floor(x / 3) % others.length];
    const raid = ctx.content.creeps.find((c) => c.race === raider.id && c.archetype === 'workhorse') ?? ctx.content.creeps.find((c) => c.race === raider.id && c.archetype !== 'boss');
    if (raid) groups.push({ creep: raid.id, count: 6 + Math.floor(x / 6), intervalTicks: 22, delayTicks: 140 });
  }
  return { name: template.name ?? `Round ${index + 1}`, groups };
}

/** Early mini-bosses come at part strength (a third-round boss must not end a run): full from round 15. */
export function bossScale(index: number): number {
  return Math.min(1, Math.max(1, index + 1) / BOSS_FULL_ROUND);
}

/** A mini-boss's bounty share in round `index`: it grows with the boss, from BOSS_BOUNTY_FLOOR. */
export function bossBountyScale(index: number): number {
  return BOSS_BOUNTY_FLOOR + (1 - BOSS_BOUNTY_FLOOR) * bossScale(index);
}

/** Does round `index` (0-based) end with a mini-boss? */
export function hasBoss(rules: RunRules, index: number): boolean {
  return rules.bossEvery > 0 && (index + 1) % rules.bossEvery === 0;
}

/** A race's mini-boss, if the content has one. */
export function bossFor(ctx: SimContext, raceId: string): CreepDef | undefined {
  return ctx.content.creeps.find((c) => c.race === raceId && c.archetype === 'boss');
}

/** Growth past the script: 1 + max * x / (x + k), rising quickly at first and levelling off toward 1 + max. */
function post(x: number, max: number, k: number): number {
  return x <= 0 ? 1 : 1 + (max * x) / (x + k);
}

/** The level's growth curves for rounds past its script (its `endless` block over the defaults). */
export function endlessGrowth(ctx: SimContext): EndlessGrowth {
  return { hpMax: POST_HP_MAX, hpK: POST_HP_K, countMax: POST_COUNT_MAX, countK: POST_COUNT_K, speedMax: POST_SPEED_MAX, speedK: POST_SPEED_K, ...(ctx.waves.endless ?? {}) };
}

/** Score multiplier for something earned in round `index` (0-based): later rounds count for more. */
export function roundScoreMult(index: number): number {
  return 1 + SCORE_PER_ROUND * Math.max(0, index);
}

// ---------------------------------------------------------------- sends (Mirror)

/** What one creep costs to send to a rival. */
export function sendCost(def: CreepDef): number {
  return Math.max(1, Math.round(def.bounty * SEND_COST_MULT));
}

/** Income per wave a sender earns for every creep of this kind sent. */
export function sendIncomeFor(def: CreepDef): number {
  return Math.max(1, Math.ceil(sendCost(def) / (SEND_INCOME_DIV * (def.archetype === 'boss' ? BOSS_SEND_INCOME_DIV_MULT : 1))));
}

/** The creeps a race can send: its own units, cheapest first, its mini-boss last (sendable from BOSS_SEND_FROM_ROUND). */
export function sendableCreeps(ctx: SimContext, raceId: string): CreepDef[] {
  return ctx.content.creeps.filter((c) => c.race === raceId).sort((a, b) => (a.archetype === 'boss' ? 1 : 0) - (b.archetype === 'boss' ? 1 : 0) || sendCost(a) - sendCost(b));
}

/** Whether `def` may be sent now: a mini-boss waits for BOSS_SEND_FROM_ROUND and goes one at a time. */
export function sendAllowed(def: CreepDef, waveIndex: number, count: number): { ok: true } | { ok: false; reason: string } {
  if (def.archetype !== 'boss') return { ok: true };
  if (waveIndex + 1 < BOSS_SEND_FROM_ROUND) return { ok: false, reason: `A mini-boss can be sent from round ${BOSS_SEND_FROM_ROUND}.` };
  if (count !== 1) return { ok: false, reason: 'Mini-bosses go one at a time.' };
  return { ok: true };
}

/** Sap in a seat's wallet (0 for a seat the board does not have). */
export function wallet(state: SimState, seat: number): number {
  return state.wallets[seat] ?? 0;
}

// ---------------------------------------------------------------- derived tower stats

export interface TowerStats {
  range: number;
  damage: number;
  cooldownTicks: number;
  multishot: number;
  armorPierce: boolean;
  slow: number;
  dotPerSecond: number;
  dotType: DamageType;
  stunTicksOnEntry: number;
  bleedPerSecond: number;
  bleedTicks: number;
  splash: number;
  chain: number;
  critChance: number;
  slowOnHit: number;
  slowTicks: number;
  income: number;
  buff: { damageMult: number; rangeMult: number; cooldownMult: number } | null;
}

/**
 * A tower's base weapon traits plus its branch: multipliers multiply, counts and chances take the
 * larger, flags OR. So a Prism that chains once at tier 1 and takes Refraction (+1) chains twice.
 */
export function mergeEffects(base: BranchEffects | undefined, branch: BranchEffects | undefined): BranchEffects {
  if (!base) return branch ?? {};
  if (!branch) return base;
  const out: BranchEffects = { ...base };
  const mul = (k: 'rangeMult' | 'damageMult' | 'cooldownMult' | 'splashMult' | 'incomeMult') => {
    if (branch[k] !== undefined) out[k] = (base[k] ?? 1) * branch[k]!;
  };
  mul('rangeMult');
  mul('damageMult');
  mul('cooldownMult');
  mul('splashMult');
  mul('incomeMult');
  const max = (k: 'multishot' | 'stunTicksOnEntry' | 'bleedPerSecond' | 'bleedTicks' | 'critChance' | 'slowOnHit' | 'slowTicks') => {
    if (branch[k] !== undefined) out[k] = Math.max(base[k] ?? 0, branch[k]!);
  };
  max('multishot');
  max('stunTicksOnEntry');
  max('bleedPerSecond');
  max('bleedTicks');
  max('critChance');
  max('slowOnHit');
  max('slowTicks');
  if (branch.chain !== undefined) out.chain = (base.chain ?? 0) + branch.chain;
  if (branch.slowBonus !== undefined) out.slowBonus = (base.slowBonus ?? 0) + branch.slowBonus;
  if (branch.buffBonus !== undefined) out.buffBonus = (base.buffBonus ?? 0) + branch.buffBonus;
  if (branch.armorPierce) out.armorPierce = true;
  return out;
}

/** A support tower's effect on a neighbour. The identity buff means "none". */
export interface Buff {
  damageMult: number;
  rangeMult: number;
  cooldownMult: number;
}
export const NO_BUFF: Buff = { damageMult: 1, rangeMult: 1, cooldownMult: 1 };

/** Effective stats for a tower at its tier and branch, under an optional support buff. Pure; used by the sim and the UI alike. */
export function towerStats(def: TowerDef, tier: 1 | 2 | 3, branch: 'a' | 'b' | null, buff: Buff = NO_BUFF): TowerStats {
  const t = def.tiers[tier - 1];
  const fx = mergeEffects(def.effects, branch ? def.branches[branch].effects : undefined);
  const tierScale = 1 + (tier - 1) * 0.5; // economy and support grow with tier too
  return {
    range: def.range * t.rangeMult * (fx.rangeMult ?? 1) * buff.rangeMult,
    damage: def.damage * t.damageMult * (fx.damageMult ?? 1) * buff.damageMult,
    cooldownTicks: Math.max(1, Math.round(def.cooldownTicks * t.cooldownMult * (fx.cooldownMult ?? 1) * buff.cooldownMult)),
    multishot: fx.multishot ?? 1,
    armorPierce: fx.armorPierce ?? false,
    slow: def.aura ? Math.min(0.9, def.aura.slow + (fx.slowBonus ?? 0)) : 0,
    dotPerSecond: def.aura ? def.aura.dotPerSecond * t.damageMult * (fx.damageMult ?? 1) * buff.damageMult : 0,
    dotType: def.aura ? def.aura.dotType : def.damageType,
    stunTicksOnEntry: fx.stunTicksOnEntry ?? 0,
    bleedPerSecond: fx.bleedPerSecond ?? 0,
    bleedTicks: fx.bleedTicks ?? 0,
    splash: (def.splash ?? 0) * (fx.splashMult ?? 1) * t.rangeMult,
    chain: (def.chain ?? 0) + (fx.chain ?? 0),
    critChance: fx.critChance ?? 0,
    slowOnHit: fx.slowOnHit ?? 0,
    slowTicks: fx.slowTicks ?? 0,
    income: def.income ? Math.round(def.income * tierScale * (fx.incomeMult ?? 1)) : 0,
    buff: def.buff
      ? {
          damageMult: 1 + (def.buff.damageMult - 1) * tierScale + (fx.buffBonus ?? 0),
          rangeMult: 1 + (def.buff.rangeMult - 1) * tierScale + (fx.buffBonus ?? 0),
          cooldownMult: Math.max(0.4, 1 - (1 - def.buff.cooldownMult) * tierScale - (fx.buffBonus ?? 0)),
        }
      : null,
  };
}

/** Lanes: rivals' towers never help yours (no buffs or hive links across lanes). True everywhere else. */
function sameLaneSide(state: SimState, a: Tower, b: Tower): boolean {
  if (state.versus !== 'lanes') return true;
  return (state.seatSide[a.owner] ?? -1) === (state.seatSide[b.owner] ?? -2);
}

/** The strongest support buff reaching a tower. Pure; the UI shows it too. */
export function buffFor(state: SimState, ctx: SimContext, tower: Tower): Buff {
  let best: Buff = NO_BUFF;
  let bestScore = 1;
  for (const s of state.towers) {
    if (s.id === tower.id) continue;
    if (!sameLaneSide(state, tower, s)) continue;
    const def = ctx.towerIndex[s.def];
    if (def.attack !== 'support' || !def.buff) continue;
    const st = towerStats(def, s.tier, s.branch);
    if (!st.buff) continue;
    const dx = s.col - tower.col;
    const dy = s.row - tower.row;
    if (dx * dx + dy * dy > st.range * st.range) continue;
    const score = st.buff.damageMult * st.buff.rangeMult * (2 - st.buff.cooldownMult);
    if (score > bestScore) {
      bestScore = score;
      best = st.buff;
    }
  }
  return best;
}

/** Damage multiplier from the matrix; armour-piercing never does worse than 1.0 against anything. */
export function damageMultiplier(ctx: SimContext, type: DamageType, armor: CreepDef['armor'], pierce: boolean): number {
  const m = ctx.content.damage.multipliers[type][armor];
  return pierce ? Math.max(1, m) : m;
}

// ---------------------------------------------------------------- stepping

/** Advance the simulation by exactly one tick. */
export function stepSim(state: SimState, ctx: SimContext): void {
  if (state.phase === 'won' || state.phase === 'lost') return;
  state.tick++;
  state.events.length = 0;

  if (state.phase === 'build') {
    state.buildTimer--;
    if (state.buildTimer <= 0) beginWave(state, ctx);
  }
  if (state.phase === 'wave') spawnDue(state, ctx);

  // Previous positions feed render interpolation; set them before anything moves.
  for (const c of state.creeps) {
    c.px = c.x;
    c.py = c.y;
  }
  for (const p of state.projectiles) {
    p.px = p.x;
    p.py = p.y;
  }

  const buckets = buildBuckets(state);
  const byId = new Map<number, Creep>();
  for (const c of state.creeps) byId.set(c.id, c);

  updateTowers(state, ctx, buckets);
  updateProjectiles(state, ctx, byId, buckets);
  updateCreeps(state, ctx);

  if (state.creeps.some((c) => !c.alive)) state.creeps = state.creeps.filter((c) => c.alive);
  if (state.projectiles.some((p) => !p.alive)) state.projectiles = state.projectiles.filter((p) => p.alive);

  if (state.phase === 'wave' && state.spawnQueue.length === 0 && state.creeps.length === 0) completeWave(state, ctx);
}

export function beginWave(state: SimState, ctx: SimContext): void {
  if (state.phase !== 'build') return;
  state.waveIndex++;
  state.phase = 'wave';
  state.waveStartTick = state.tick;
  state.buildTimer = 0;
  state.events.push({ kind: 'wave', index: state.waveIndex });
  const wave = waveAt(ctx, state.waveIndex);
  const queue = state.spawnQueue;
  // sends that arrived during the build phase lead this wave, however early it was called
  let lead = state.tick + 1;
  for (const q of queue) {
    if (q.sentBy === undefined) continue;
    q.tick = lead;
    lead += SEND_INTERVAL_TICKS;
  }
  const scaling = levelScaling(ctx, state);
  const countMult = waveCountMult(ctx, state, state.waveIndex);
  // Lanes: the whole wave comes down every open lane. Solo, co-op and King: one wave (King creeps pick a base as they spawn).
  const lanes: Array<number | undefined> = state.versus === 'lanes' ? liveSlots(state) : [undefined];
  let last = state.tick;
  for (const route of lanes) {
    for (const g of wave.groups) {
      const count = Math.ceil(g.count * countMult);
      // past the script the groups grow; keep them about as long by tightening the spacing a little
      const interval = Math.max(4, Math.round(g.intervalTicks / Math.min(1.6, countMult / scaling.countMult)));
      for (let i = 0; i < count; i++) {
        // A little seeded jitter keeps identical scripts from feeling metronomic; still deterministic.
        const tick = state.tick + g.delayTicks + i * interval + nextInt(state.rng, 0, 2);
        queue.push(route === undefined ? { creep: g.creep, tick } : { creep: g.creep, tick, route });
        last = Math.max(last, tick);
      }
    }
  }
  if (hasBoss(state.rules, state.waveIndex)) {
    const boss = bossFor(ctx, waveRace(ctx, wave));
    if (boss) {
      // versus: one mini-boss for every lane or standing base
      const targets: Array<number | undefined> = state.versus ? liveSlots(state) : [undefined];
      targets.forEach((route, i) => queue.push(route === undefined ? { creep: boss.id, tick: last + 60 + i * 20 } : { creep: boss.id, tick: last + 60 + i * 20, route }));
      state.events.push({ kind: 'boss', creep: boss.id });
    }
  }
  queue.sort((a, b) => a.tick - b.tick); // Array.prototype.sort is stable, so ties keep script order
}

/** How many of each group spawn in wave `waveIndex`: the level's count multiplier, growth past the script, King's players. */
export function waveCountMult(ctx: SimContext, state: SimState, waveIndex: number): number {
  const scaling = levelScaling(ctx, state);
  const extra = waveIndex - ctx.waves.waves.length + 1; // rounds past the script (<= 0 inside it)
  const growth = endlessGrowth(ctx);
  return scaling.countMult * post(extra, growth.countMax, growth.countK) * kingCountMult(state);
}

/** The next wave as the HUD shows it during the build window: groups at this run's counts, sends that lead it, its boss. */
export function previewNextWave(state: SimState, ctx: SimContext): WavePreview | null {
  if (state.phase !== 'build') return null;
  const index = state.waveIndex + 1;
  if (index >= state.rules.rounds) return null;
  const wave = waveAt(ctx, index);
  const mult = waveCountMult(ctx, state, index);
  const groups: WavePreview['groups'] = [];
  for (const g of wave.groups) {
    const count = Math.ceil(g.count * mult);
    const row = groups.find((r) => r.creep === g.creep);
    if (row) row.count += count;
    else groups.push({ creep: g.creep, count });
  }
  const sent: WavePreview['sent'] = [];
  for (const q of state.spawnQueue) {
    if (q.sentBy === undefined) continue;
    const row = sent.find((r) => r.creep === q.creep);
    if (row) row.count += 1;
    else sent.push({ creep: q.creep, count: 1 });
  }
  const boss = hasBoss(state.rules, index) ? (bossFor(ctx, waveRace(ctx, wave))?.id ?? null) : null;
  return { index: index + 1, name: wave.name ?? `Round ${index + 1}`, groups, sent, boss, perLane: state.versus === 'lanes' };
}

/** King of the Maze: the wave grows with the players defending it. */
function kingCountMult(state: SimState): number {
  if (state.versus !== 'king') return 1;
  const players = state.sides.reduce((n, s) => n + (s.out ? 0 : s.seats.length), 0);
  return 1 + KING_COUNT_PER_PLAYER * Math.max(0, players - 1);
}

/** Pick the base the next King creep goes for: the live bases in turn. */
function nextBase(state: SimState): number {
  const open = liveSlots(state);
  if (!open.length) return 0;
  const slot = open[state.turn % open.length];
  state.turn++;
  return slot;
}

function spawnDue(state: SimState, ctx: SimContext): void {
  const q = state.spawnQueue;
  let n = 0;
  while (n < q.length && q[n].tick <= state.tick) n++;
  if (n === 0) return;
  for (let i = 0; i < n; i++) spawnCreep(state, ctx, q[i]);
  q.splice(0, n);
}

/** The level's scaling, grown for a co-op party when `state` is a shared board. */
/** The parts of a board that shape its waves (scripts call the scaling helpers with partial states). */
export type ScalingState = Pick<SimState, 'coop' | 'party'> & { rules?: RunRules; versus?: SimState['versus']; sides?: Side[] };

export function levelScaling(ctx: SimContext, state?: ScalingState): WaveScaling {
  const base = { ...DEFAULT_SCALING, ...(ctx.waves.scaling ?? {}) };
  const tier = DIFFICULTIES[state?.rules?.difficulty ?? 0] ?? DIFFICULTIES[0];
  const delta = tier.id === 'standard' ? 0 : (ctx.waves.difficulty?.[tier.id] ?? tier.delta);
  const out: WaveScaling = {
    rampWaves: base.rampWaves,
    hpMult: base.hpMult + 0.35 * delta,
    speedMult: base.speedMult + 0.1 * delta,
    countMult: base.countMult + 0.15 * delta,
    hpPerWave: base.hpPerWave + 0.05 * delta,
    speedPerWave: base.speedPerWave + 0.015 * delta,
  };
  // King of the Maze: a touch more hp for every player defending (the count grows in beginWave)
  const players = state?.versus === 'king' ? (state.sides ?? []).reduce((n, sd) => n + sd.seats.length, 0) : 0;
  if (players > 1) return { ...out, hpMult: out.hpMult * (1 + KING_HP_PER_PLAYER * (players - 1)) };
  if (!state?.coop || state.party <= 1) return out;
  const extra = state.party - 1;
  const room = Math.min(1, Math.max(0, (ctx.padCount - COOP_PADS_NONE) / (COOP_PADS_FULL - COOP_PADS_NONE)));
  return { ...out, hpMult: out.hpMult * (1 + COOP_HP_PER_PLAYER * extra * room), countMult: out.countMult * (1 + COOP_COUNT_PER_PLAYER * extra * room) };
}

/**
 * The share of a level's extra hp and speed that wave `waveIndex` (0-based) carries: a level with rampWaves = 3
 * gives wave 1 a quarter of its extra hp and speed, wave 2 half, wave 4 and later all of it. The counts are not
 * eased (they carry the bounties a player builds from), and the per-wave ramps (hpPerWave, speedPerWave) already
 * start from nothing.
 */
export function rampShare(s: WaveScaling, waveIndex: number): number {
  return s.rampWaves > 0 ? Math.min(1, (waveIndex + 1) / (s.rampWaves + 1)) : 1;
}

/** A level-wide multiplier eased by the early-wave ramp. */
function eased(mult: number, share: number): number {
  return 1 + (mult - 1) * share;
}

/** hp and speed multipliers for creeps spawned in wave `waveIndex` (0-based); `boss` for a mini-boss. */
export function waveMultipliers(ctx: SimContext, waveIndex: number, state?: ScalingState, boss = false): { hp: number; speed: number } {
  const s = levelScaling(ctx, state);
  const L = ctx.waves.waves.length;
  const inScript = Math.min(waveIndex, L - 1);
  const extra = waveIndex - L + 1;
  const g = endlessGrowth(ctx);
  const share = rampShare(s, waveIndex);
  const hp = eased(s.hpMult, share) * (1 + s.hpPerWave * inScript) * post(extra, g.hpMax * (boss ? BOSS_POST_GROWTH : 1), g.hpK);
  return {
    hp: boss ? hp * bossScale(waveIndex) : hp,
    speed: eased(s.speedMult, share) * (1 + s.speedPerWave * inScript) * post(extra, g.speedMax, g.speedK),
  };
}

function spawnCreep(state: SimState, ctx: SimContext, entry: SpawnEntry): Creep {
  const defId = entry.creep;
  const sentBy = entry.sentBy ?? -1;
  const def = ctx.creepIndex[defId];
  const route = entry.route ?? (state.versus === 'king' ? nextBase(state) : 0);
  const wps = state.routes[route] ?? state.routes[0];
  const at = Math.min(Math.max(0, entry.atWp ?? 0), wps.length - 2);
  const start = wps[at];
  let dist = 0;
  for (let i = 1; i <= at; i++) dist += Math.sqrt((wps[i].x - wps[i - 1].x) ** 2 + (wps[i].y - wps[i - 1].y) ** 2);
  const mult = waveMultipliers(ctx, Math.max(0, state.waveIndex), state, def.archetype === 'boss');
  const hp = Math.round(def.hp * mult.hp);
  const creep: Creep = {
    id: state.nextId++,
    def: defId,
    hp,
    maxHp: hp,
    speedMult: Math.round(mult.speed * 1000) / 1000,
    x: start.x,
    y: start.y,
    px: start.x,
    py: start.y,
    wp: at + 1,
    dist,
    slowTicks: 0,
    slowFactor: 1,
    stunTicks: 0,
    stunnedBy: -1,
    bleedPerSecond: 0,
    bleedTicks: 0,
    bleedStacks: 0,
    bleedType: def.armor === 'carapace' ? 'acid' : 'thorn',
    bleedOwner: -1,
    sentBy,
    route,
    alive: true,
  };
  state.creeps.push(creep);
  return creep;
}

function completeWave(state: SimState, ctx: SimContext): void {
  // every seat banks the wave bonus (versus: every seat still standing); the score counts it once
  for (let seat = 0; seat < state.seats; seat++) {
    if (state.versus) {
      const side = state.seatSide[seat];
      if (side < 0 || state.sides[side].out) continue;
    }
    state.wallets[seat] += ctx.waves.waveBonus + state.sendIncome[seat];
    state.stats.earned += ctx.waves.waveBonus + state.sendIncome[seat];
  }
  const bonus = Math.round(ctx.waves.waveBonus * roundScoreMult(state.waveIndex));
  state.score += bonus;
  for (const side of state.sides) if (!side.out) side.score += bonus;
  // economy towers pay their owner at the end of every wave
  for (const t of state.towers) {
    const def = ctx.towerIndex[t.def];
    if (def.attack !== 'economy') continue;
    const income = towerStats(def, t.tier, t.branch).income;
    if (income <= 0) continue;
    state.wallets[t.owner] += income;
    state.stats.earned += income;
    state.events.push({ kind: 'income', tower: t.id, x: t.col + 0.5, y: t.row + 0.5, amount: income });
  }
  if (state.waveIndex >= state.rules.rounds - 1) {
    if (state.versus) finishVersus(state);
    else finish(state, ctx, 'won');
  } else {
    state.phase = 'build';
    state.buildTimer = ctx.waves.buildTicks;
  }
}

function finish(state: SimState, ctx: SimContext, outcome: 'won' | 'lost'): void {
  state.phase = outcome;
  const wavesCleared = outcome === 'won' ? state.rules.rounds : Math.max(0, state.waveIndex);
  state.score += state.lives * 25;
  let stars: SimResult['stars'] = 0;
  if (outcome === 'won') {
    const ratio = state.lives / ctx.waves.lives;
    stars = ratio >= 0.9 ? 3 : ratio >= 0.5 ? 2 : 1;
  }
  state.result = { outcome, stars, wavesCleared, score: state.score, ticks: state.tick };
}

// ---------------------------------------------------------------- spatial buckets

type Buckets = Map<number, Creep[]>;

function buildBuckets(state: SimState): Buckets {
  const buckets: Buckets = new Map();
  for (const c of state.creeps) {
    const key = cellIndex(state.cols, Math.floor(c.x), Math.floor(c.y));
    const list = buckets.get(key);
    if (list) list.push(c);
    else buckets.set(key, [c]);
  }
  return buckets;
}

/**
 * Creeps within `range` tiles of (cx, cy), scanning only the cells the circle can touch. With `side`
 * (Lanes), only creeps in the lanes that side defends: a tower never reaches into a rival's lane.
 */
function creepsInRange(state: SimState, buckets: Buckets, cx: number, cy: number, range: number, out: Creep[], side = -1): Creep[] {
  out.length = 0;
  const r2 = range * range;
  const c0 = Math.max(0, Math.floor(cx - range));
  const c1 = Math.min(state.cols - 1, Math.floor(cx + range));
  const r0 = Math.max(0, Math.floor(cy - range));
  const r1 = Math.min(state.rows - 1, Math.floor(cy + range));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const list = buckets.get(cellIndex(state.cols, c, r));
      if (!list) continue;
      for (const creep of list) {
        if (!creep.alive) continue;
        if (side >= 0 && state.slotSide[creep.route] !== side) continue;
        const dx = creep.x - cx;
        const dy = creep.y - cy;
        if (dx * dx + dy * dy <= r2) out.push(creep);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- towers

const scratch: Creep[] = [];

/** Lanes: the side whose lanes a tower may shoot into (its owner's); -1 everywhere else. */
function laneSide(state: SimState, tower: Tower | undefined): number {
  if (state.versus !== 'lanes' || !tower) return -1;
  return state.seatSide[tower.owner] ?? -1;
}

function updateTowers(state: SimState, ctx: SimContext, buckets: Buckets): void {
  for (const tower of state.towers) {
    const def = ctx.towerIndex[tower.def];
    if (def.attack === 'economy' || def.attack === 'support') continue;
    const lane = laneSide(state, tower);
    const { stats, mods } = effectiveStats(state, ctx, tower);
    const passive = passiveFor(ctx, def);
    const cx = tower.col + 0.5;
    const cy = tower.row + 0.5;

    if (def.attack === 'aura') {
      const targets = creepsInRange(state, buckets, cx, cy, stats.range, scratch, lane);
      for (const creep of targets) {
        creep.slowTicks = 2;
        creep.slowFactor = Math.min(creep.slowFactor, 1 - stats.slow);
        if (stats.stunTicksOnEntry > 0 && creep.stunnedBy !== tower.id) {
          creep.stunnedBy = tower.id;
          creep.stunTicks = Math.max(creep.stunTicks, stats.stunTicksOnEntry);
        }
        if (stats.dotPerSecond > 0) applyDamage(state, ctx, creep, stats.dotPerSecond * TICK_SEC, stats.dotType, false, tower);
      }
      continue;
    }

    if (tower.cooldown > 0) {
      tower.cooldown--;
      continue;
    }
    const targets = creepsInRange(state, buckets, cx, cy, stats.range, scratch, lane);
    if (targets.length === 0) continue;
    // "First" targeting: the creep furthest along the path. Ties break by id for determinism.
    targets.sort((a, b) => b.dist - a.dist || a.id - b.id);

    if (def.attack === 'beam') {
      // Hitscan: damage lands this tick. The beam may chain to the nearest creeps after the first,
      // and (overcharge races) pierce creeps standing on the line between the tower and the target.
      const first = targets[0];
      const alpha = mods.alphaReady ? (passive.alphaMult ?? 1) : 1;
      state.events.push({ kind: 'fire', tower: tower.id, x: cx, y: cy, tx: first.x, ty: first.y, damageType: def.damageType, alpha: alpha > 1 });
      const hit: Creep[] = [first];
      if (stats.chain > 0) {
        const rest = targets.slice(1).sort((a, b) => dist2(a, first) - dist2(b, first) || a.id - b.id);
        for (let i = 0; i < Math.min(stats.chain, rest.length); i++) hit.push(rest[i]);
      }
      const pierce = passive.beamPierce ?? 0;
      let pierced = 0;
      if (pierce > 0) {
        // creeps within 0.4 tiles of the segment tower→target, nearest to the tower first
        const vx = first.x - cx;
        const vy = first.y - cy;
        const len2 = vx * vx + vy * vy || 1;
        const onLine = targets
          .filter((c) => !hit.includes(c))
          .map((c) => {
            const t = ((c.x - cx) * vx + (c.y - cy) * vy) / len2;
            const px = cx + vx * t;
            const py = cy + vy * t;
            const off2 = (c.x - px) ** 2 + (c.y - py) ** 2;
            return { c, t, off2 };
          })
          .filter((e) => e.t > 0 && e.t < 1 && e.off2 <= 0.16)
          .sort((a, b) => a.t - b.t || a.c.id - b.c.id);
        for (let i = 0; i < Math.min(pierce, onLine.length); i++) {
          hit.push(onLine[i].c);
          pierced++;
        }
      }
      let fromX = cx;
      let fromY = cy;
      for (let i = 0; i < hit.length; i++) {
        const target = hit[i];
        const isPierce = i >= hit.length - pierced;
        const dmg = stats.damage * alpha * (i === 0 ? 1 : isPierce ? 0.5 : 0.6) * rollCrit(state, stats.critChance);
        const hpBefore = target.hp;
        applyDamage(state, ctx, target, dmg, def.damageType, stats.armorPierce, tower);
        if (stats.slowOnHit > 0 && target.alive) applySlow(target, stats.slowOnHit, stats.slowTicks);
        state.events.push({ kind: 'beam', tower: tower.id, x: fromX, y: fromY, tx: target.x, ty: target.y, damageType: def.damageType, alpha: mods.alphaReady && (passive.alphaMult ?? 1) > 1 });
        state.events.push({ kind: 'hit', x: target.x, y: target.y, damageType: def.damageType, amount: hpBefore - target.hp, kill: !target.alive });
        if (!isPierce) {
          fromX = target.x;
          fromY = target.y;
        }
      }
      tower.cooldown = stats.cooldownTicks;
      noteShot(state, ctx, tower, def);
      continue;
    }

    const shots = Math.min(stats.multishot, targets.length);
    const alpha = mods.alphaReady ? (passive.alphaMult ?? 1) : 1;
    state.events.push({ kind: 'fire', tower: tower.id, x: cx, y: cy, tx: targets[0].x, ty: targets[0].y, damageType: def.damageType, alpha: alpha > 1 });
    for (let i = 0; i < shots; i++) {
      const target = targets[i];
      state.projectiles.push({
        id: state.nextId++,
        x: cx,
        y: cy,
        px: cx,
        py: cy,
        target: target.id,
        speed: def.projectileSpeed ?? 8,
        damage: stats.damage * alpha,
        damageType: def.damageType,
        armorPierce: stats.armorPierce,
        bleedPerSecond: stats.bleedPerSecond,
        bleedTicks: stats.bleedTicks,
        splash: stats.splash,
        slowOnHit: stats.slowOnHit,
        slowTicks: stats.slowTicks,
        critChance: stats.critChance,
        owner: tower.id,
        alive: true,
      });
    }
    tower.cooldown = stats.cooldownTicks;
    noteShot(state, ctx, tower, def);
  }
}

function dist2(a: Creep, b: Creep): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** 2x damage on a crit, rolled on the sim RNG so every client agrees. */
function rollCrit(state: SimState, chance: number): number {
  if (chance <= 0) return 1;
  return nextFloat(state.rng) < chance ? 2 : 1;
}

function applySlow(creep: Creep, slow: number, ticks: number): void {
  creep.slowTicks = Math.max(creep.slowTicks, ticks);
  creep.slowFactor = Math.min(creep.slowFactor, 1 - slow);
}

// ---------------------------------------------------------------- projectiles

function updateProjectiles(state: SimState, ctx: SimContext, byId: Map<number, Creep>, buckets: Buckets): void {
  for (const p of state.projectiles) {
    if (!p.alive) continue;
    const target = byId.get(p.target);
    if (!target || !target.alive) {
      p.alive = false; // the target died first; the shot is wasted, which is part of the game
      continue;
    }
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const step = p.speed * TICK_SEC;
    if (d <= step) {
      p.x = target.x;
      p.y = target.y;
      p.alive = false;
      const owner = state.towers.find((t) => t.id === p.owner);
      const dmg = p.damage * rollCrit(state, p.critChance);
      const victims: Creep[] = p.splash > 0 ? creepsInRange(state, buckets, p.x, p.y, p.splash, scratch, laneSide(state, owner)).slice() : [target];
      if (p.splash > 0 && !victims.includes(target)) victims.push(target);
      victims.sort((a, b) => a.id - b.id);
      let dealt = 0;
      let killed = false;
      for (const v of victims) {
        const hpBefore = v.hp;
        applyDamage(state, ctx, v, dmg, p.damageType, p.armorPierce, owner);
        dealt += hpBefore - v.hp;
        if (!v.alive) killed = true;
        if (v.alive) {
          if (p.bleedTicks > 0) {
            // hive races stack acid instead of refreshing it
            const maxStacks = owner ? (passiveFor(ctx, ctx.towerIndex[owner.def]).bleedStacks ?? 1) : 1;
            const stacks = v.bleedTicks > 0 ? Math.min(maxStacks, v.bleedStacks + 1) : 1;
            v.bleedStacks = stacks;
            v.bleedPerSecond = Math.max(v.bleedPerSecond, p.bleedPerSecond * stacks);
            v.bleedTicks = Math.max(v.bleedTicks, p.bleedTicks);
            v.bleedType = p.damageType;
            v.bleedOwner = p.owner;
          }
          if (p.slowOnHit > 0) applySlow(v, p.slowOnHit, p.slowTicks);
        }
      }
      state.events.push({ kind: 'hit', x: p.x, y: p.y, damageType: p.damageType, amount: dealt, kill: killed, splash: p.splash || undefined });
    } else {
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
    }
  }
}

// ---------------------------------------------------------------- creeps

function updateCreeps(state: SimState, ctx: SimContext): void {
  for (const c of state.creeps) {
    if (!c.alive) continue;
    const def = ctx.creepIndex[c.def];
    const wps = state.routes[c.route] ?? state.routes[0];

    if (c.bleedTicks > 0) {
      c.bleedTicks--;
      if (c.bleedTicks === 0) c.bleedStacks = 0;
      const source = c.bleedOwner >= 0 ? state.towers.find((t) => t.id === c.bleedOwner) : undefined;
      applyDamage(state, ctx, c, c.bleedPerSecond * TICK_SEC, c.bleedType, false, source);
      if (!c.alive) continue;
    }

    if (c.stunTicks > 0) {
      c.stunTicks--;
      continue;
    }

    let remaining = def.speed * c.speedMult * TICK_SEC * c.slowFactor;
    if (c.slowTicks > 0) c.slowTicks--;
    else c.slowFactor = 1;

    while (remaining > 0 && c.wp < wps.length) {
      const target = wps[c.wp];
      const dx = target.x - c.x;
      const dy = target.y - c.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= remaining) {
        c.x = target.x;
        c.y = target.y;
        c.dist += d;
        remaining -= d;
        c.wp++;
      } else {
        c.x += (dx / d) * remaining;
        c.y += (dy / d) * remaining;
        c.dist += remaining;
        remaining = 0;
      }
    }

    if (c.wp >= wps.length) leak(state, ctx, c);
  }
}

function leak(state: SimState, ctx: SimContext, c: Creep): void {
  const def = ctx.creepIndex[c.def];
  c.alive = false;
  state.events.push({ kind: 'leak', creep: c.def, x: c.x, y: c.y });
  state.stats.leaks++;
  if (state.versus) {
    const sideIdx = state.slotSide[c.route] ?? -1;
    if (sideIdx < 0) return; // a closed lane or a fallen base: nobody left to hurt
    const side = state.sides[sideIdx];
    side.lives = Math.max(0, side.lives - def.leakCost);
    if (side.lives <= 0) eliminate(state, sideIdx);
    return;
  }
  state.lives = Math.max(0, state.lives - def.leakCost);
  if (state.lives <= 0 && state.phase === 'wave') finish(state, ctx, 'lost');
}

function applyDamage(state: SimState, ctx: SimContext, creep: Creep, amount: number, type: DamageType, pierce: boolean, owner: Tower | undefined): void {
  if (!creep.alive || amount <= 0) return;
  const def = ctx.creepIndex[creep.def];
  const dealt = amount * damageMultiplier(ctx, type, def.armor, pierce);
  creep.hp -= dealt;
  state.stats.damageDealt += dealt;
  if (owner) owner.damageDealt += dealt;
  if (creep.hp <= 0) {
    creep.alive = false;
    state.events.push({ kind: 'kill', creep: creep.def, x: creep.x, y: creep.y, armor: def.armor });
    const boss = def.archetype === 'boss';
    const bounty = Math.round(def.bounty * (owner ? (passiveFor(ctx, ctx.towerIndex[owner.def]).bountyMult ?? 1) : 1) * (boss ? bossBountyScale(state.waveIndex) : 1));
    // versus: the bounty and the points go to the side whose tower made the kill (none for a tower already gone)
    const side = state.versus ? (owner ? (state.seatSide[owner.owner] ?? -1) : -1) : -1;
    if (!state.versus || side >= 0) state.wallets[owner?.owner ?? 0] += bounty;
    if (side >= 0) state.sides[side].score += Math.round(bounty * roundScoreMult(state.waveIndex) * (boss ? BOSS_SCORE_MULT : 1));
    if (boss) state.stats.bosses++;
    state.score += Math.round(bounty * roundScoreMult(state.waveIndex) * (boss ? BOSS_SCORE_MULT : 1));
    state.stats.kills++;
    state.stats.earned += bounty;
    if (owner) owner.kills++;
  }
}

// ---------------------------------------------------------------- view

export function simView(state: SimState, ctx: SimContext, seat = 0): SimView {
  const wave = state.waveIndex >= 0 ? waveAt(ctx, state.waveIndex) : null;
  const sideIdx = sideOf(state, seat);
  const mySide = sideIdx >= 0 ? state.sides[sideIdx] : null;
  const placements = state.result?.placements ?? null;
  const result = state.result
    ? state.versus
      ? { ...state.result, outcome: (placements && sideIdx >= 0 && placements[sideIdx] === 1 ? 'won' : 'lost') as 'won' | 'lost', score: mySide?.score ?? 0 }
      : { ...state.result }
    : null;
  return {
    tick: state.tick,
    phase: state.phase,
    wave: state.waveIndex + 1,
    waves: state.rules.rounds,
    waveName: wave ? (hasBoss(state.rules, state.waveIndex) ? `${wave.name} + mini-boss` : wave.name ?? '') : '',
    waveBoss: state.waveIndex >= 0 && hasBoss(state.rules, state.waveIndex),
    nextBoss: state.waveIndex + 1 < state.rules.rounds && hasBoss(state.rules, state.waveIndex + 1),
    bossAlive: state.creeps.some((c) => ctx.creepIndex[c.def]?.archetype === 'boss'),
    buildTimer: state.buildTimer,
    seat,
    resources: wallet(state, seat),
    wallets: state.wallets.slice(),
    sendIncome: state.sendIncome[seat] ?? 0,
    lives: state.versus ? (mySide?.lives ?? 0) : state.lives,
    score: state.versus ? (mySide?.score ?? 0) : state.score,
    creepsAlive: state.creeps.length,
    towers: state.towers.length,
    stats: { ...state.stats },
    result,
    versus: state.versus
      ? {
          mode: state.versus,
          teams: state.teams,
          side: sideIdx,
          out: mySide ? mySide.out : true,
          sides: state.sides.map((sd) => ({ seats: sd.seats.slice(), slots: sd.slots.slice(), lives: sd.lives, out: sd.out, outWave: sd.outWave, score: sd.score })),
          placements: placements ? placements.slice() : null,
        }
      : null,
    nextWave: previewNextWave(state, ctx),
  };
}

/** True while something on the board is moving, so the renderer can idle between waves. */
export function isAnimating(state: SimState): boolean {
  return state.creeps.length > 0 || state.projectiles.length > 0;
}

/** Tile kind at a cell, or null when out of bounds. */
export function tileAt(state: SimState, col: number, row: number): number | null {
  if (col < 0 || row < 0 || col >= state.cols || row >= state.rows) return null;
  return state.grid[cellIndex(state.cols, col, row)];
}

export function towerAt(state: SimState, col: number, row: number): Tower | undefined {
  if (col < 0 || row < 0 || col >= state.cols || row >= state.rows) return undefined;
  const id = state.occupied[cellIndex(state.cols, col, row)];
  return id === -1 ? undefined : state.towers.find((t) => t.id === id);
}

export { TILE };
