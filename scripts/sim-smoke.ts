// Extra Terram — scripts/sim-smoke.ts v0.5.0 — the builder also spends during waves (a fairer floor for tuning)
// Headless smoke test:
//   1. determinism: same seed + same inputs give a bit-identical state hash,
//   2. replay: the input log reproduces that hash,
//   3. the seed matters: a different seed gives a different hash,
//   4. balance table: a simple role-based builder plays every level with every race.
// Run with: npm run sim        (add `-- --max-towers 8` to cap the builder, `-- --verbose` for wave logs)
import { content, levels, towersForRace } from '../src/content';
import { applyInput, createContext, createSim, hashState, replay, stepSim, tileAt, TILE, type SimContext, type SimState, type TowerDef, type WaveScaling } from '../src/engine';

const MAX_TICKS = 60_000;
const capArg = process.argv.indexOf('--max-towers');
const MAX_TOWERS = capArg !== -1 ? Number(process.argv[capArg + 1]) : Infinity;
const VERBOSE = process.argv.includes('--verbose');

interface Pad {
  col: number;
  row: number;
  coverage: number;
}

/** Pads ranked by how much path sits within a starter tower's reach. */
function rankedPads(state: SimState, range: number): Pad[] {
  const pads: Pad[] = [];
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
  return pads;
}

/**
 * A simple builder that works for any race, meant as the floor a human should beat: starters on the
 * best-covered pads first, then a heavy and a field, then it keeps upgrading what it has (upgrades
 * are the best sap per damage in this game) and only adds splash, range, support and economy
 * towers once the core is upgraded. It spends bounty during waves like a player would.
 */
function buildPhase(state: SimState, ctx: SimContext, roster: TowerDef[], pads: Pad[]): void {
  const byRole = (role: string) => roster.find((t) => t.role === role);
  const count = (role: string) => state.towers.filter((t) => ctx.towerIndex[t.def].role === role).length;
  const freePad = (worst = false) => {
    const list = worst ? [...pads].reverse() : pads;
    return list.find((p) => state.occupied[p.row * state.cols + p.col] === -1);
  };
  const place = (role: string): boolean => {
    const def = byRole(role);
    if (!def || state.resources < def.cost || state.towers.length >= MAX_TOWERS) return false;
    const pad = freePad(role === 'economy');
    if (!pad) return false;
    return applyInput(state, ctx, { type: 'place', tower: def.id, col: pad.col, row: pad.row }).ok;
  };
  // Upgrade the best-placed tower that can be upgraded: cheaper than a new tower for the damage.
  const upgradeOne = (): boolean => {
    const candidates = [...state.towers]
      .filter((t) => t.tier < 3 && ctx.towerIndex[t.def].attack !== 'economy')
      .sort((a, b) => a.tier - b.tier || a.id - b.id);
    for (const tower of candidates) {
      const res = applyInput(state, ctx, { type: 'upgrade', towerId: tower.id, branch: tower.tier === 2 ? (tower.id % 2 ? 'a' : 'b') : undefined });
      if (res.ok) return true;
    }
    return false;
  };
  const plan: Array<[string, number]> = [
    ['starter', 2],
    ['heavy', 1],
    ['control', 1],
    ['starter', 3],
    ['splash', 1],
    ['heavy', 2],
    ['range', 1],
    ['starter', 4],
    ['support', 1],
    ['economy', 1],
    ['splash', 2],
    ['heavy', 3],
    ['starter', 6],
    ['range', 2],
    ['heavy', 5],
    ['splash', 4],
    ['starter', 9],
    ['control', 2],
    ['heavy', 7],
    ['range', 3],
    ['splash', 6],
    ['starter', 12],
  ];
  for (let guard = 0; guard < 40; guard++) {
    let acted = false;
    // core first: the first four plan entries before any upgrade
    for (const [role, want] of plan.slice(0, 4)) {
      if (count(role) < want && place(role)) {
        acted = true;
        break;
      }
    }
    if (!acted && state.waveIndex >= 1 && upgradeOne()) acted = true;
    if (!acted) {
      for (const [role, want] of plan.slice(4)) {
        if (count(role) < want && place(role)) {
          acted = true;
          break;
        }
      }
    }
    if (!acted) break;
  }
}

export function runLevel(levelId: string, raceId: string, seed: string, verbose: boolean, scaling?: Partial<WaveScaling>): SimState {
  const level = levels.find((l) => l.id === levelId)!;
  const waves = scaling ? { ...level.waves, scaling } : level.waves;
  const ctx = createContext(content, level.map, waves);
  const state = createSim(ctx, seed);
  const roster = towersForRace(raceId);
  const pads = rankedPads(state, roster[0]?.range ?? 2.2);
  let lastPhase: string | null = null;
  let lastWave = -1;
  while (state.phase !== 'won' && state.phase !== 'lost' && state.tick < MAX_TICKS) {
    // Like a player: build at the start of every build phase, and keep spending bounty during waves.
    if ((state.phase === 'build' && lastPhase !== 'build') || state.tick % 20 === 0) buildPhase(state, ctx, roster, pads);
    lastPhase = state.phase;
    stepSim(state, ctx);
    if (verbose && state.waveIndex !== lastWave && state.phase === 'wave') {
      lastWave = state.waveIndex;
      console.log(`    wave ${state.waveIndex + 1}/${ctx.waves.waves.length} "${ctx.waves.waves[state.waveIndex].name}" at tick ${state.tick}: lives ${state.lives}, sap ${state.resources}, towers ${state.towers.length}`);
    }
  }
  return state;
}

function finishReplay(ctx: SimContext, state: SimState): SimState {
  while (state.phase !== 'won' && state.phase !== 'lost' && state.tick < MAX_TICKS) stepSim(state, ctx);
  return state;
}

if (!process.env.SIM_LIB) main();

function main(): void {
console.log(`Extra Terram sim smoke test — content ${content.version}`);

// 1–3: determinism on the first level with the first race
const first = levels[0];
const a = runLevel(first.id, 'rootkin', 'smoke-1', VERBOSE);
const hashA = hashState(a);
const b = runLevel(first.id, 'rootkin', 'smoke-1', false);
const hashB = hashState(b);
const ctx0 = createContext(content, first.map, first.waves);
const replayed = finishReplay(ctx0, replay(ctx0, 'smoke-1', a.inputLog));
const hashR = hashState(replayed);
const c = runLevel(first.id, 'rootkin', 'smoke-2', false);
const hashC = hashState(c);
console.log(`Determinism: run A ${hashA}, run B ${hashB} ${hashB === hashA ? 'OK' : 'MISMATCH'}; replay ${hashR} ${hashR === hashA ? 'OK' : 'MISMATCH'}; other seed ${hashC} ${hashC !== hashA ? 'OK differs' : 'UNEXPECTEDLY identical'}`);

// 4: balance table
console.log('\nBalance (scripted builder, seed smoke-1):');
console.log('  level                  race       result   wave  lives  towers  score  ticks');
let anyUnwinnable = false;
for (const level of levels) {
  for (const race of content.races) {
    const s = runLevel(level.id, race.id, 'smoke-1', false);
    const won = s.phase === 'won';
    if (!won) anyUnwinnable = true;
    console.log(
      `  ${level.id.padEnd(22)} ${race.id.padEnd(10)} ${(won ? 'won' : 'lost').padEnd(8)} ${String(s.waveIndex + 1).padStart(4)}  ${String(s.lives).padStart(5)}  ${String(s.towers.length).padStart(6)}  ${String(s.score).padStart(5)}  ${String(s.tick).padStart(5)}`,
    );
  }
}

const failed = hashB !== hashA || hashR !== hashA || hashC === hashA;
if (failed) {
  console.error('\nSMOKE TEST FAILED (determinism)');
  process.exit(1);
}
console.log(anyUnwinnable ? '\nSMOKE TEST PASSED (some level/race pairs are lost by the scripted builder; see the table)' : '\nSMOKE TEST PASSED');
}
