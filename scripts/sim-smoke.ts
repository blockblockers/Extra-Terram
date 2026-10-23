// Extra Terram — scripts/sim-smoke.ts v0.1.0 — Phase 1 scaffold
// Headless smoke test: runs the Phase 1 level with a simple scripted builder and checks that
//   1. the same seed + same inputs give a bit-identical state hash (determinism),
//   2. replaying the input log reproduces that hash (the log is a complete record),
//   3. a different seed gives a different hash (the seed matters),
// then prints a wave-by-wave summary so balance changes are visible at a glance.
// Run with: npm run sim
import { content, levels } from '../src/content';
import { applyInput, createContext, createSim, hashState, replay, stepSim, tileAt, TILE, type SimContext, type SimState } from '../src/engine';

const MAX_TICKS = 40_000;
// Optional cap on tower count, e.g. `npm run sim -- --max-towers 8`, to probe the difficulty floor.
const capArg = process.argv.indexOf('--max-towers');
const MAX_TOWERS = capArg !== -1 ? Number(process.argv[capArg + 1]) : Infinity;

/** Pads ranked by how much path sits within a starter tower's reach. */
function rankedPads(ctx: SimContext, state: SimState, range: number): Array<{ col: number; row: number; coverage: number }> {
  const pads: Array<{ col: number; row: number; coverage: number }> = [];
  for (let row = 0; row < state.rows; row++) {
    for (let col = 0; col < state.cols; col++) {
      if (tileAt(state, col, row) !== TILE.pad) continue;
      let coverage = 0;
      for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
          if (tileAt(state, c, r) !== TILE.path) continue;
          const dx = c - col;
          const dy = r - row;
          if (dx * dx + dy * dy <= range * range) coverage++;
        }
      }
      pads.push({ col, row, coverage });
    }
  }
  pads.sort((a, b) => b.coverage - a.coverage || a.row - b.row || a.col - b.col);
  void ctx;
  return pads;
}

/** A deliberately simple builder: buy what it can afford at the start of each build phase. */
function buildPhase(state: SimState, ctx: SimContext, pads: ReturnType<typeof rankedPads>): void {
  let placed = true;
  while (placed) {
    placed = false;
    const hasWeepvine = state.towers.some((t) => t.def === 'weepvine');
    let pick: string | null = null;
    const needles = state.towers.filter((t) => t.def === 'needlespire').length;
    if (state.resources >= 110 && needles >= 3 && state.towers.filter((t) => t.def === 'ironbark').length < 3) pick = 'ironbark';
    else if (state.resources >= 90 && needles >= 2 && !hasWeepvine) pick = 'weepvine';
    else if (state.resources >= 60) pick = 'needlespire';
    if (!pick || state.towers.length >= MAX_TOWERS) break;
    const pad = pads.find((p) => state.occupied[p.row * state.cols + p.col] === -1);
    if (!pad) break;
    const res = applyInput(state, ctx, { type: 'place', tower: pick, col: pad.col, row: pad.row });
    if (res.ok) placed = true;
  }
  for (const tower of [...state.towers]) {
    if (tower.tier >= 3) continue;
    const res = applyInput(state, ctx, { type: 'upgrade', towerId: tower.id, branch: tower.tier === 2 ? 'a' : undefined });
    if (!res.ok) break;
  }
}

function runLevel(seed: string, verbose: boolean): SimState {
  const level = levels[0];
  const ctx = createContext(content, level.map, level.waves);
  const state = createSim(ctx, seed);
  const pads = rankedPads(ctx, state, 2.2);
  let lastPhase: string | null = null;
  let lastWave = -1;
  while (state.phase !== 'won' && state.phase !== 'lost' && state.tick < MAX_TICKS) {
    if (state.phase === 'build' && lastPhase !== 'build') buildPhase(state, ctx, pads);
    lastPhase = state.phase;
    stepSim(state, ctx);
    if (verbose && state.waveIndex !== lastWave && state.phase === 'wave') {
      lastWave = state.waveIndex;
      console.log(`  wave ${state.waveIndex + 1}/${ctx.waves.waves.length} "${ctx.waves.waves[state.waveIndex].name}" starts at tick ${state.tick}: lives ${state.lives}, sap ${state.resources}, towers ${state.towers.length}`);
    }
  }
  return state;
}

function finishReplay(ctx: SimContext, state: SimState): SimState {
  while (state.phase !== 'won' && state.phase !== 'lost' && state.tick < MAX_TICKS) stepSim(state, ctx);
  return state;
}

console.log(`Extra Terram sim smoke test — content ${content.version}`);
console.log('Run A (seed smoke-1):');
const a = runLevel('smoke-1', true);
const hashA = hashState(a);
console.log(`  result: ${a.phase} after ${a.tick} ticks (${(a.tick / 20).toFixed(0)} s), lives ${a.lives}, score ${a.score}, kills ${a.stats.kills}, leaks ${a.stats.leaks}, stars ${a.result?.stars ?? 0}, hash ${hashA}`);

const b = runLevel('smoke-1', false);
const hashB = hashState(b);
console.log(`Run B (same seed): hash ${hashB} ${hashB === hashA ? 'OK identical' : 'MISMATCH'}`);

const level = levels[0];
const ctx = createContext(content, level.map, level.waves);
const replayed = finishReplay(ctx, replay(ctx, 'smoke-1', a.inputLog));
const hashR = hashState(replayed);
console.log(`Replay from input log (${a.inputLog.length} inputs): hash ${hashR} ${hashR === hashA ? 'OK identical' : 'MISMATCH'}`);

const c = runLevel('smoke-2', false);
const hashC = hashState(c);
console.log(`Run C (seed smoke-2): ${c.phase} at tick ${c.tick}, lives ${c.lives}, hash ${hashC} ${hashC !== hashA ? 'OK differs' : 'UNEXPECTEDLY identical'}`);

const failed = hashB !== hashA || hashR !== hashA || hashC === hashA;
if (failed) {
  console.error('SMOKE TEST FAILED');
  process.exit(1);
}
console.log('SMOKE TEST PASSED');
