// Extra Terram — src/engine/inputs.ts v0.8.0 — sends name their target side; mini-boss sends from round 8; versus boards: pads by lane or base, waves on the clock, sends that pick a rival on the board
// Player inputs: validate, apply, and log with the tick they applied on.
// The log is the replay, the lockstep payload (shared boards) and the verification record in one.
import { cellIndex } from './map';
import { nextInt } from './rng';
import { beginWave, createSim, liveSides, passiveFor, sendAllowed, sendCost, sendIncomeFor, stepSim, towerCost, wallet } from './sim';
import { MAX_REINFORCE, REINFORCE_COST, SELL_REFUND, SEND_INTERVAL_TICKS, SEND_MAX_COUNT, TICK_RATE, TILE, type LoggedInput, type SimContext, type SimInput, type SimOptions, type SimState, type Tower } from './types';

/** On a refusal for money, `need` is the price: the UI says it in the player's currency ("Needs 60 scrap."). */
export type InputResult = { ok: true } | { ok: false; reason: string; need?: number };

/** Sell value of a tower right now (the race's refund rate, 70% by default). */
export function sellValue(ctx: SimContext, tower: Tower): number {
  const refund = passiveFor(ctx, ctx.towerIndex[tower.def]).sellRefund ?? SELL_REFUND;
  return Math.floor(tower.invested * refund);
}

/** Cost of the next tier for this race, or null at tier 3. */
export function upgradeCost(ctx: SimContext, tower: Tower): number | null {
  if (tower.tier >= 3) return null;
  const def = ctx.towerIndex[tower.def];
  return Math.round(def.tiers[tower.tier - 1].upgradeCost * (passiveFor(ctx, def).upgradeCostMult ?? 1));
}

/** What tiers 1-3 of this tower cost its race (the base for Reinforce prices). */
function tierInvestment(ctx: SimContext, def: Tower['def']): number {
  const d = ctx.towerIndex[def];
  const mult = passiveFor(ctx, d).upgradeCostMult ?? 1;
  return towerCost(ctx, d) + Math.round(d.tiers[0].upgradeCost * mult) + Math.round(d.tiers[1].upgradeCost * mult);
}

/** Price of the next Reinforce level, or null when the tower cannot take one (below tier 3, maxed, or no damage to boost). */
export function reinforceCost(ctx: SimContext, tower: Tower): number | null {
  const def = ctx.towerIndex[tower.def];
  if (tower.tier < 3 || (tower.boost ?? 0) >= MAX_REINFORCE) return null;
  if (def.attack !== 'projectile' && def.attack !== 'beam' && !(def.attack === 'aura' && (def.aura?.dotPerSecond ?? 0) > 0)) return null;
  return Math.round(tierInvestment(ctx, tower.def) * REINFORCE_COST * (1 + (tower.boost ?? 0) / 2));
}

/** Can this input be applied to the state as it stands, by this seat? Pure. */
export function validateInput(state: SimState, ctx: SimContext, input: SimInput, seat = 0): InputResult {
  if (state.phase === 'won' || state.phase === 'lost') return { ok: false, reason: 'The run is over.' };
  if (seat < 0 || seat >= state.seats) return { ok: false, reason: 'No such seat on this board.' };
  const sap = wallet(state, seat); // whatever this seat's race calls its money
  const mySide = state.versus ? (state.seatSide[seat] ?? -1) : -1;
  if (state.versus && (mySide < 0 || state.sides[mySide].out)) return { ok: false, reason: 'You are out of this match.' };
  switch (input.type) {
    case 'place': {
      const def = ctx.towerIndex[input.tower];
      if (!def) return { ok: false, reason: `Unknown tower ${input.tower}.` };
      if (input.col < 0 || input.row < 0 || input.col >= state.cols || input.row >= state.rows) return { ok: false, reason: 'Off the map.' };
      const i = cellIndex(state.cols, input.col, input.row);
      if (state.grid[i] !== TILE.pad) return { ok: false, reason: 'Towers only grow on build pads.' };
      if (state.occupied[i] !== -1) return { ok: false, reason: 'That pad is taken.' };
      if (state.versus) {
        // a digit in the map's zones makes a pad that lane's or that base's; '.' pads are anyone's
        const zone = ctx.zones[i] ?? -1;
        if (zone >= 0 && state.slotSide[zone] !== mySide) {
          return { ok: false, reason: state.slotSide[zone] < 0 ? 'That ground is closed.' : state.versus === 'lanes' ? 'That pad is in a rival’s lane.' : 'That pad guards a rival’s base.' };
        }
      }
      const cost = towerCost(ctx, def);
      if (sap < cost) return { ok: false, reason: `Needs ${cost}.`, need: cost };
      return { ok: true };
    }
    case 'upgrade': {
      const tower = state.towers.find((t) => t.id === input.towerId);
      if (!tower) return { ok: false, reason: 'No such tower.' };
      if (tower.owner !== seat) return { ok: false, reason: 'That tower belongs to another player.' };
      const cost = upgradeCost(ctx, tower);
      if (cost === null) return { ok: false, reason: 'Already at the top tier.' };
      if (tower.tier === 2 && input.branch !== 'a' && input.branch !== 'b') return { ok: false, reason: 'Tier 3 needs a branch choice.' };
      if (sap < cost) return { ok: false, reason: `Needs ${cost}.`, need: cost };
      return { ok: true };
    }
    case 'sell': {
      const tower = state.towers.find((t) => t.id === input.towerId);
      if (!tower) return { ok: false, reason: 'No such tower.' };
      if (tower.owner !== seat) return { ok: false, reason: 'That tower belongs to another player.' };
      return { ok: true };
    }
    case 'reinforce': {
      const tower = state.towers.find((t) => t.id === input.towerId);
      if (!tower) return { ok: false, reason: 'No such tower.' };
      if (tower.owner !== seat) return { ok: false, reason: 'That tower belongs to another player.' };
      const cost = reinforceCost(ctx, tower);
      if (cost === null) return { ok: false, reason: tower.tier < 3 ? 'Reinforce opens at tier 3.' : 'Fully reinforced.' };
      if (sap < cost) return { ok: false, reason: `Needs ${cost}.`, need: cost };
      return { ok: true };
    }
    case 'start-wave': {
      if (state.versus) return { ok: false, reason: 'In a versus match the waves come on the clock.' };
      if (state.phase !== 'build') return { ok: false, reason: 'A wave is already running.' };
      return { ok: true };
    }
    case 'send': {
      const def = ctx.creepIndex[input.creep];
      if (!def) return { ok: false, reason: `Unknown creep ${input.creep}.` };
      if (!Number.isInteger(input.count) || input.count < 1 || input.count > SEND_MAX_COUNT) return { ok: false, reason: `Send 1 to ${SEND_MAX_COUNT} at a time.` };
      const allowed = sendAllowed(def, state.waveIndex, input.count);
      if (!allowed.ok) return allowed;
      const cost = sendCost(def) * input.count;
      if (state.versus && !liveSides(state).some((sd) => sd !== mySide)) return { ok: false, reason: 'No rival left to send to.' };
      if (state.versus && input.target !== undefined && (!Number.isInteger(input.target) || input.target === mySide || !liveSides(state).includes(input.target))) return { ok: false, reason: 'That side cannot receive a send.' };
      if (sap < cost) return { ok: false, reason: `Needs ${cost}.`, need: cost };
      return { ok: true };
    }
    case 'receive': {
      const def = ctx.creepIndex[input.creep];
      if (!def) return { ok: false, reason: `Unknown creep ${input.creep}.` };
      if (!Number.isInteger(input.count) || input.count < 1 || input.count > SEND_MAX_COUNT) return { ok: false, reason: 'Bad send.' };
      return { ok: true };
    }
  }
}

/** Validate, apply and log an input at the current tick, charged to `seat`. */
export function applyInput(state: SimState, ctx: SimContext, input: SimInput, seat = 0): InputResult {
  const check = validateInput(state, ctx, input, seat);
  if (!check.ok) return check;

  switch (input.type) {
    case 'place': {
      const def = ctx.towerIndex[input.tower];
      const cost = towerCost(ctx, def);
      const tower: Tower = {
        id: state.nextId++,
        def: input.tower,
        owner: seat,
        col: input.col,
        row: input.row,
        tier: 1,
        branch: null,
        cooldown: 0,
        placedTick: state.tick,
        placedWave: state.waveIndex,
        lastFireTick: -1,
        heat: 0,
        boost: 0,
        invested: cost,
        kills: 0,
        damageDealt: 0,
      };
      state.towers.push(tower);
      state.occupied[cellIndex(state.cols, input.col, input.row)] = tower.id;
      state.wallets[seat] -= cost;
      state.stats.spent += cost;
      state.events.push({ kind: 'place', tower: tower.id, x: input.col + 0.5, y: input.row + 0.5 });
      break;
    }
    case 'upgrade': {
      const tower = state.towers.find((t) => t.id === input.towerId)!;
      const cost = upgradeCost(ctx, tower)!;
      state.wallets[seat] -= cost;
      state.stats.spent += cost;
      tower.invested += cost;
      tower.tier = (tower.tier + 1) as 2 | 3;
      if (tower.tier === 3) tower.branch = input.branch!;
      state.events.push({ kind: 'upgrade', tower: tower.id, x: tower.col + 0.5, y: tower.row + 0.5, tier: tower.tier });
      break;
    }
    case 'reinforce': {
      const tower = state.towers.find((t) => t.id === input.towerId)!;
      const cost = reinforceCost(ctx, tower)!;
      state.wallets[seat] -= cost;
      state.stats.spent += cost;
      tower.invested += cost;
      tower.boost = (tower.boost ?? 0) + 1;
      state.events.push({ kind: 'upgrade', tower: tower.id, x: tower.col + 0.5, y: tower.row + 0.5, tier: 3 });
      break;
    }
    case 'sell': {
      const tower = state.towers.find((t) => t.id === input.towerId)!;
      state.wallets[seat] += sellValue(ctx, tower);
      state.occupied[cellIndex(state.cols, tower.col, tower.row)] = -1;
      state.towers = state.towers.filter((t) => t.id !== tower.id);
      state.events.push({ kind: 'sell', x: tower.col + 0.5, y: tower.row + 0.5 });
      break;
    }
    case 'start-wave': {
      // Calling a wave early pays the caller one sap per second left on the clock.
      const bonus = Math.floor(state.buildTimer / TICK_RATE);
      state.wallets[seat] += bonus;
      state.score += bonus;
      state.stats.earned += bonus;
      beginWave(state, ctx);
      break;
    }
    case 'send': {
      const def = ctx.creepIndex[input.creep];
      const cost = sendCost(def) * input.count;
      state.wallets[seat] -= cost;
      state.stats.spent += cost;
      state.sendIncome[seat] += sendIncomeFor(def) * input.count;
      state.stats.sent += input.count;
      if (!state.versus) {
        state.events.push({ kind: 'send', creep: input.creep, count: input.count, seat });
        break;
      }
      // Versus: the board picks a rival on its own seeded RNG (every client agrees), then one of its
      // open lanes, or its base; the creeps lead the next wave, or join this one. King sends skip the
      // shared trail and land where the target's fork begins.
      const me = state.seatSide[seat];
      const rivals = liveSides(state).filter((sd) => sd !== me);
      // the sender's choice when it named one, else a rival drawn on the board's own seeded RNG (every client agrees)
      const target = input.target !== undefined && rivals.includes(input.target) ? input.target : rivals[nextInt(state.rng, 0, rivals.length - 1)];
      const slots = state.sides[target].slots.filter((sl) => state.slotSide[sl] === target);
      const route = slots[nextInt(state.rng, 0, slots.length - 1)];
      const base = state.phase === 'wave' ? state.tick + 1 : state.tick + Math.max(1, state.buildTimer);
      for (let i = 0; i < input.count; i++) state.spawnQueue.push({ creep: input.creep, tick: base + i * SEND_INTERVAL_TICKS, sentBy: seat, route, atWp: state.versus === 'king' ? state.forkWp[route] : 0 });
      state.spawnQueue.sort((a, b) => a.tick - b.tick);
      state.events.push({ kind: 'send', creep: input.creep, count: input.count, seat, side: target, slot: route });
      break;
    }
    case 'receive': {
      // During a wave they join it now; during a build phase they lead the next wave.
      const base = state.phase === 'wave' ? state.tick + 1 : state.tick + Math.max(1, state.buildTimer);
      for (let i = 0; i < input.count; i++) state.spawnQueue.push({ creep: input.creep, tick: base + i * SEND_INTERVAL_TICKS, sentBy: input.from });
      state.spawnQueue.sort((a, b) => a.tick - b.tick);
      state.stats.received += input.count;
      state.events.push({ kind: 'incoming', creep: input.creep, count: input.count, from: input.from });
      break;
    }
  }

  const logged: LoggedInput = { ...input, tick: state.tick, seat, seq: state.inputLog.length };
  state.inputLog.push(logged);
  return { ok: true };
}

/**
 * Rebuild a run from its seed and input log. Inputs apply on their recorded tick, before that
 * tick is stepped, exactly as they did live. Returns the finished state.
 */
export function replay(ctx: SimContext, seed: string, log: LoggedInput[], untilTick?: number, opts: SimOptions = {}): SimState {
  const state = createSim(ctx, seed, opts);
  let i = 0;
  const stop = untilTick ?? (log.length ? Math.max(...log.map((l) => l.tick)) + 1 : 0);
  while (state.tick < stop && state.phase !== 'won' && state.phase !== 'lost') {
    while (i < log.length && log[i].tick === state.tick) {
      const { tick, seat, seq, ...input } = log[i];
      void tick;
      void seq;
      applyInput(state, ctx, input as SimInput, seat);
      i++;
    }
    stepSim(state, ctx);
  }
  return state;
}
