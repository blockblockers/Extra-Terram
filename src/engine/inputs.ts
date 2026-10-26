// Extra Terram — src/engine/inputs.ts v0.5.0 — 'not enough money' is a coded result (the UI names the race's currency); seats, owners, sends
// Player inputs: validate, apply, and log with the tick they applied on.
// The log is the replay, the lockstep payload (shared boards) and the verification record in one.
import { cellIndex } from './map';
import { beginWave, createSim, passiveFor, sendCost, sendIncomeFor, stepSim, towerCost, wallet } from './sim';
import { SELL_REFUND, SEND_INTERVAL_TICKS, SEND_MAX_COUNT, TICK_RATE, TILE, type LoggedInput, type SimContext, type SimInput, type SimOptions, type SimState, type Tower } from './types';

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

/** Can this input be applied to the state as it stands, by this seat? Pure. */
export function validateInput(state: SimState, ctx: SimContext, input: SimInput, seat = 0): InputResult {
  if (state.phase === 'won' || state.phase === 'lost') return { ok: false, reason: 'The run is over.' };
  if (seat < 0 || seat >= state.seats) return { ok: false, reason: 'No such seat on this board.' };
  const sap = wallet(state, seat); // whatever this seat's race calls its money
  switch (input.type) {
    case 'place': {
      const def = ctx.towerIndex[input.tower];
      if (!def) return { ok: false, reason: `Unknown tower ${input.tower}.` };
      if (input.col < 0 || input.row < 0 || input.col >= state.cols || input.row >= state.rows) return { ok: false, reason: 'Off the map.' };
      const i = cellIndex(state.cols, input.col, input.row);
      if (state.grid[i] !== TILE.pad) return { ok: false, reason: 'Towers only grow on build pads.' };
      if (state.occupied[i] !== -1) return { ok: false, reason: 'That pad is taken.' };
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
    case 'start-wave': {
      if (state.phase !== 'build') return { ok: false, reason: 'A wave is already running.' };
      return { ok: true };
    }
    case 'send': {
      const def = ctx.creepIndex[input.creep];
      if (!def) return { ok: false, reason: `Unknown creep ${input.creep}.` };
      if (!Number.isInteger(input.count) || input.count < 1 || input.count > SEND_MAX_COUNT) return { ok: false, reason: `Send 1 to ${SEND_MAX_COUNT} at a time.` };
      const cost = sendCost(def) * input.count;
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
      state.events.push({ kind: 'send', creep: input.creep, count: input.count, seat });
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
