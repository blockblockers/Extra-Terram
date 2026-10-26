// Extra Terram — src/engine/sim.ts v0.7.0 — seats (wallets, owners, co-op wave scaling) and creep sends; race passives, splash, beams, economy, support, crits
// The deterministic simulation: 20 Hz fixed tick, plain-JSON state, no wall clock, no Math.random.
// Everything here runs identically in the browser, in Node (scripts/sim-smoke.ts) and, later,
// on the server for replay verification. Keep it that way.
import { createRng, nextFloat, nextInt } from './rng';
import { parseMap, cellIndex } from './map';
import {
  COOP_COUNT_PER_PLAYER,
  COOP_HP_PER_PLAYER,
  ENGINE_VERSION,
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
  type MapDef,
  type RaceDef,
  type RacePassive,
  type SimContext,
  type SimOptions,
  type SimResult,
  type SimState,
  type SimView,
  type Tower,
  type TowerDef,
  type WaveScaling,
  type WaveScript,
  DEFAULT_SCALING,
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
  return { content, map, waves, towerIndex, creepIndex, raceIndex };
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
  const stats: TowerStats = {
    ...base,
    damage: base.damage * mods.damageMult,
    range: base.range * mods.rangeMult,
    cooldownTicks: Math.max(1, Math.round(base.cooldownTicks * mods.cooldownMult)),
    dotPerSecond: base.dotPerSecond * mods.damageMult,
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
    wallets: new Array<number>(seats).fill(ctx.waves.startingResources),
    sendIncome: new Array<number>(seats).fill(0),
    lives: ctx.waves.lives,
    score: 0,
    rng: createRng(seed),
    nextId: 1,
    cols: parsed.cols,
    rows: parsed.rows,
    grid: parsed.grid,
    waypoints: parsed.waypoints,
    occupied: new Array(parsed.cols * parsed.rows).fill(-1),
    creeps: [],
    towers: [],
    projectiles: [],
    spawnQueue: [],
    inputLog: [],
    events: [],
    stats: { kills: 0, leaks: 0, spent: 0, earned: 0, damageDealt: 0, sent: 0, received: 0 },
    result: null,
  };
}

// ---------------------------------------------------------------- sends (Mirror)

/** What one creep costs to send to a rival. */
export function sendCost(def: CreepDef): number {
  return Math.max(1, Math.round(def.bounty * SEND_COST_MULT));
}

/** Income per wave a sender earns for every creep of this kind sent. */
export function sendIncomeFor(def: CreepDef): number {
  return Math.max(1, Math.ceil(sendCost(def) / SEND_INCOME_DIV));
}

/** The creeps a race can send: its own units, cheapest first. */
export function sendableCreeps(ctx: SimContext, raceId: string): CreepDef[] {
  return ctx.content.creeps.filter((c) => c.race === raceId).sort((a, b) => sendCost(a) - sendCost(b));
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

/** The strongest support buff reaching a tower. Pure; the UI shows it too. */
export function buffFor(state: SimState, ctx: SimContext, tower: Tower): Buff {
  let best: Buff = NO_BUFF;
  let bestScore = 1;
  for (const s of state.towers) {
    if (s.id === tower.id) continue;
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

/** Damage multiplier from the matrix; armor-piercing never does worse than 1.0 against Plated. */
export function damageMultiplier(ctx: SimContext, type: DamageType, armor: CreepDef['armor'], pierce: boolean): number {
  const m = ctx.content.damage.multipliers[type][armor];
  return pierce && armor === 'plated' ? Math.max(1, m) : m;
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
  const wave = ctx.waves.waves[state.waveIndex];
  const queue = state.spawnQueue;
  // sends that arrived during the build phase lead this wave, however early it was called
  let lead = state.tick + 1;
  for (const q of queue) {
    if (q.sentBy === undefined) continue;
    q.tick = lead;
    lead += SEND_INTERVAL_TICKS;
  }
  const scaling = levelScaling(ctx, state);
  for (const g of wave.groups) {
    const count = Math.ceil(g.count * scaling.countMult);
    for (let i = 0; i < count; i++) {
      // A little seeded jitter keeps identical scripts from feeling metronomic; still deterministic.
      queue.push({ creep: g.creep, tick: state.tick + g.delayTicks + i * g.intervalTicks + nextInt(state.rng, 0, 2) });
    }
  }
  queue.sort((a, b) => a.tick - b.tick); // Array.prototype.sort is stable, so ties keep script order
}

function spawnDue(state: SimState, ctx: SimContext): void {
  const q = state.spawnQueue;
  let n = 0;
  while (n < q.length && q[n].tick <= state.tick) n++;
  if (n === 0) return;
  for (let i = 0; i < n; i++) spawnCreep(state, ctx, q[i].creep, q[i].sentBy ?? -1);
  q.splice(0, n);
}

/** The level's scaling, grown for a co-op party when `state` is a shared board. */
export function levelScaling(ctx: SimContext, state?: Pick<SimState, 'coop' | 'party'>): WaveScaling {
  const base = { ...DEFAULT_SCALING, ...(ctx.waves.scaling ?? {}) };
  if (!state?.coop || state.party <= 1) return base;
  const extra = state.party - 1;
  return { ...base, hpMult: base.hpMult * (1 + COOP_HP_PER_PLAYER * extra), countMult: base.countMult * (1 + COOP_COUNT_PER_PLAYER * extra) };
}

/** hp and speed multipliers for creeps spawned in wave `waveIndex` (0-based). */
export function waveMultipliers(ctx: SimContext, waveIndex: number, state?: Pick<SimState, 'coop' | 'party'>): { hp: number; speed: number } {
  const s = levelScaling(ctx, state);
  return { hp: s.hpMult * (1 + s.hpPerWave * waveIndex), speed: s.speedMult * (1 + s.speedPerWave * waveIndex) };
}

function spawnCreep(state: SimState, ctx: SimContext, defId: string, sentBy = -1): Creep {
  const def = ctx.creepIndex[defId];
  const start = state.waypoints[0];
  const mult = waveMultipliers(ctx, Math.max(0, state.waveIndex), state);
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
    wp: 1,
    dist: 0,
    slowTicks: 0,
    slowFactor: 1,
    stunTicks: 0,
    stunnedBy: -1,
    bleedPerSecond: 0,
    bleedTicks: 0,
    bleedStacks: 0,
    sentBy,
    alive: true,
  };
  state.creeps.push(creep);
  return creep;
}

function completeWave(state: SimState, ctx: SimContext): void {
  // every seat banks the wave bonus; the score counts it once
  for (let seat = 0; seat < state.seats; seat++) {
    state.wallets[seat] += ctx.waves.waveBonus + state.sendIncome[seat];
    state.stats.earned += ctx.waves.waveBonus + state.sendIncome[seat];
  }
  state.score += ctx.waves.waveBonus;
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
  if (state.waveIndex >= ctx.waves.waves.length - 1) {
    finish(state, ctx, 'won');
  } else {
    state.phase = 'build';
    state.buildTimer = ctx.waves.buildTicks;
  }
}

function finish(state: SimState, ctx: SimContext, outcome: 'won' | 'lost'): void {
  state.phase = outcome;
  const wavesCleared = outcome === 'won' ? ctx.waves.waves.length : Math.max(0, state.waveIndex);
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

/** Creeps within `range` tiles of (cx, cy), scanning only the cells the circle can touch. */
function creepsInRange(state: SimState, buckets: Buckets, cx: number, cy: number, range: number, out: Creep[]): Creep[] {
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

function updateTowers(state: SimState, ctx: SimContext, buckets: Buckets): void {
  for (const tower of state.towers) {
    const def = ctx.towerIndex[tower.def];
    if (def.attack === 'economy' || def.attack === 'support') continue;
    const { stats, mods } = effectiveStats(state, ctx, tower);
    const passive = passiveFor(ctx, def);
    const cx = tower.col + 0.5;
    const cy = tower.row + 0.5;

    if (def.attack === 'aura') {
      const targets = creepsInRange(state, buckets, cx, cy, stats.range, scratch);
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
    const targets = creepsInRange(state, buckets, cx, cy, stats.range, scratch);
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
      const victims: Creep[] = p.splash > 0 ? creepsInRange(state, buckets, p.x, p.y, p.splash, scratch).slice() : [target];
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
  const wps = state.waypoints;
  for (const c of state.creeps) {
    if (!c.alive) continue;
    const def = ctx.creepIndex[c.def];

    if (c.bleedTicks > 0) {
      c.bleedTicks--;
      if (c.bleedTicks === 0) c.bleedStacks = 0;
      applyDamage(state, ctx, c, c.bleedPerSecond * TICK_SEC, 'bio', false, undefined);
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
  state.lives = Math.max(0, state.lives - def.leakCost);
  state.stats.leaks++;
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
    const bounty = Math.round(def.bounty * (owner ? (passiveFor(ctx, ctx.towerIndex[owner.def]).bountyMult ?? 1) : 1));
    state.wallets[owner?.owner ?? 0] += bounty;
    state.score += bounty;
    state.stats.kills++;
    state.stats.earned += bounty;
    if (owner) owner.kills++;
  }
}

// ---------------------------------------------------------------- view

export function simView(state: SimState, ctx: SimContext, seat = 0): SimView {
  const wave = ctx.waves.waves[state.waveIndex];
  return {
    tick: state.tick,
    phase: state.phase,
    wave: state.waveIndex + 1,
    waves: ctx.waves.waves.length,
    waveName: wave?.name ?? '',
    buildTimer: state.buildTimer,
    seat,
    resources: wallet(state, seat),
    wallets: state.wallets.slice(),
    sendIncome: state.sendIncome[seat] ?? 0,
    lives: state.lives,
    score: state.score,
    creepsAlive: state.creeps.length,
    towers: state.towers.length,
    stats: { ...state.stats },
    result: state.result ? { ...state.result } : null,
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
