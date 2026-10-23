// Extra Terram — src/engine/inputs.ts v0.2.0 — emits place/upgrade/sell events
// Player inputs: validate, apply, and log with the tick they applied on.
// The log is the replay, the lockstep payload (Phase 4) and the verification record in one.
import { cellIndex } from './map';
import { beginWave, createSim, stepSim } from './sim';
import { SELL_REFUND, TICK_RATE, TILE, type LoggedInput, type SimContext, type SimInput, type SimState, type Tower } from './types';

export type InputResult = { ok: true } | { ok: false; reason: string };

/** Sell value of a tower right now. */
export function sellValue(tower: Tower): number {
  return Math.floor(tower.invested * SELL_REFUND);
}

/** Cost of the next tier, or null at tier 3. */
export function upgradeCost(ctx: SimContext, tower: Tower): number | null {
  if (tower.tier >= 3) return null;
  return ctx.towerIndex[tower.def].tiers[tower.tier - 1].upgradeCost;
}

/** Can this input be applied to the state as it stands? Pure. */
export function validateInput(state: SimState, ctx: SimContext, input: SimInput): InputResult {
  if (state.phase === 'won' || state.phase === 'lost') return { ok: false, reason: 'The run is over.' };
  switch (input.type) {
    case 'place': {
      const def = ctx.towerIndex[input.tower];
      if (!def) return { ok: false, reason: `Unknown tower ${input.tower}.` };
      if (input.col < 0 || input.row < 0 || input.col >= state.cols || input.row >= state.rows) return { ok: false, reason: 'Off the map.' };
      const i = cellIndex(state.cols, input.col, input.row);
      if (state.grid[i] !== TILE.pad) return { ok: false, reason: 'Towers only grow on build pads.' };
      if (state.occupied[i] !== -1) return { ok: false, reason: 'That pad is taken.' };
      if (state.resources < def.cost) return { ok: false, reason: `Needs ${def.cost} sap.` };
      return { ok: true };
    }
    case 'upgrade': {
      const tower = state.towers.find((t) => t.id === input.towerId);
      if (!tower) return { ok: false, reason: 'No such tower.' };
      const cost = upgradeCost(ctx, tower);
      if (cost === null) return { ok: false, reason: 'Already at the top tier.' };
      if (tower.tier === 2 && input.branch !== 'a' && input.branch !== 'b') return { ok: false, reason: 'Tier 3 needs a branch choice.' };
      if (state.resources < cost) return { ok: false, reason: `Needs ${cost} sap.` };
      return { ok: true };
    }
    case 'sell': {
      if (!state.towers.some((t) => t.id === input.towerId)) return { ok: false, reason: 'No such tower.' };
      return { ok: true };
    }
    case 'start-wave': {
      if (state.phase !== 'build') return { ok: false, reason: 'A wave is already running.' };
      return { ok: true };
    }
  }
}

/** Validate, apply and log an input at the current tick. */
export function applyInput(state: SimState, ctx: SimContext, input: SimInput, seat = 0): InputResult {
  const check = validateInput(state, ctx, input);
  if (!check.ok) return check;

  switch (input.type) {
    case 'place': {
      const def = ctx.towerIndex[input.tower];
      const tower: Tower = {
        id: state.nextId++,
        def: input.tower,
        col: input.col,
        row: input.row,
        tier: 1,
        branch: null,
        cooldown: 0,
        placedTick: state.tick,
        invested: def.cost,
        kills: 0,
        damageDealt: 0,
      };
      state.towers.push(tower);
      state.occupied[cellIndex(state.cols, input.col, input.row)] = tower.id;
      state.resources -= def.cost;
      state.stats.spent += def.cost;
      state.events.push({ kind: 'place', tower: tower.id, x: input.col + 0.5, y: input.row + 0.5 });
      break;
    }
    case 'upgrade': {
      const tower = state.towers.find((t) => t.id === input.towerId)!;
      const cost = upgradeCost(ctx, tower)!;
      state.resources -= cost;
      state.stats.spent += cost;
      tower.invested += cost;
      tower.tier = (tower.tier + 1) as 2 | 3;
      if (tower.tier === 3) tower.branch = input.branch!;
      state.events.push({ kind: 'upgrade', tower: tower.id, x: tower.col + 0.5, y: tower.row + 0.5, tier: tower.tier });
      break;
    }
    case 'sell': {
      const tower = state.towers.find((t) => t.id === input.towerId)!;
      state.resources += sellValue(tower);
      state.occupied[cellIndex(state.cols, tower.col, tower.row)] = -1;
      state.towers = state.towers.filter((t) => t.id !== tower.id);
      state.events.push({ kind: 'sell', x: tower.col + 0.5, y: tower.row + 0.5 });
      break;
    }
    case 'start-wave': {
      // Calling a wave early pays one sap per second left on the clock.
      const bonus = Math.floor(state.buildTimer / TICK_RATE);
      state.resources += bonus;
      state.score += bonus;
      state.stats.earned += bonus;
      beginWave(state, ctx);
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
export function replay(ctx: SimContext, seed: string, log: LoggedInput[], untilTick?: number): SimState {
  const state = createSim(ctx, seed);
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
