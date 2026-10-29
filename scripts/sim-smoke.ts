// Extra Terram — scripts/sim-smoke.ts v0.8.1 — versus builders send once per send round, a pack that grows with the round
// Headless smoke test:
//   1. determinism: same seed + same inputs give a bit-identical state hash,
//   2. replay: the input log reproduces that hash,
//   3. the seed matters: a different seed gives a different hash,
//   4. balance table: a simple role-based builder plays every level with every race.
// Run with: npm run sim        (add `-- --max-towers 8` to cap the builder, `-- --verbose` for wave logs)
import { content, levelById, levels, towersForRace } from '../src/content';
import { applyInput, bossScale, createContext, createSim, hashState, hasBoss, isStandardRun, reinforceCost, replay, sendCost, stepSim, tileAt, TILE, waveAt, waveMultipliers, wallet, type SimContext, type SimOptions, type SimState, type TowerDef, type WaveScaling } from '../src/engine';

const MAX_TICKS = 600_000; // 100 rounds run to about 120k ticks
const capArg = process.argv.indexOf('--max-towers');
const MAX_TOWERS = capArg !== -1 ? Number(process.argv[capArg + 1]) : Infinity;
const VERBOSE = process.argv.includes('--verbose');
/** Versus sends already made, per board: `seat:round`. */
const sentRounds = new WeakMap<SimState, Set<string>>();

interface Pad {
  col: number;
  row: number;
  coverage: number;
}

/**
 * Pads ranked by how much path sits within a starter tower's reach. On a versus board each seat gets
 * only the pads it may build on, ranked by the path that matters to it (its lane; the shared trail and
 * its own fork in King of the Maze).
 */
function rankedPads(state: SimState, ctx: SimContext, range: number, seat = 0): Pad[] {
  const side = state.versus ? state.seatSide[seat] : -1;
  const mineZone = (z: number) => z < 0 || state.slotSide[z] === side;
  const pads: Pad[] = [];
  for (let row = 0; row < state.rows; row++) {
    for (let col = 0; col < state.cols; col++) {
      if (tileAt(state, col, row) !== TILE.pad) continue;
      if (state.versus && !mineZone(ctx.zones[row * state.cols + col])) continue;
      let coverage = 0;
      for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
          if (tileAt(state, c, r) !== TILE.path) continue;
          const z = ctx.zones[r * state.cols + c];
          if (state.versus && !mineZone(z)) continue;
          const dx = c - col;
          const dy = r - row;
          // King: the builder's own fork counts triple, so it guards its base before the shared trail
          if (dx * dx + dy * dy <= range * range) coverage += state.versus === 'king' && z >= 0 ? 3 : 1;
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
function buildPhase(state: SimState, ctx: SimContext, roster: TowerDef[], pads: Pad[], seat = 0, sendEvery = 0): void {
  if (state.versus && (state.seatSide[seat] < 0 || state.sides[state.seatSide[seat]].out)) return;
  // versus pressure: every few rounds (staggered by seat), once in that round, a pack of workhorses
  // that grows with the round goes at a rival as soon as the builder can pay for one, before it builds
  if (sendEvery > 0 && state.versus && state.waveIndex >= 2 && (state.waveIndex + seat) % sendEvery === 0) {
    const done = sentRounds.get(state) ?? new Set<string>();
    sentRounds.set(state, done);
    const key = `${seat}:${state.waveIndex}`;
    const race = roster[0]?.race;
    const pack = ctx.content.creeps.find((c) => c.race === race && c.archetype === 'workhorse');
    if (pack && !done.has(key)) {
      const count = Math.min(2 + Math.floor(state.waveIndex / 4), Math.floor(wallet(state, seat) / sendCost(pack)));
      if (count >= 1 && applyInput(state, ctx, { type: 'send', creep: pack.id, count }, seat).ok) done.add(key);
    }
  }
  const byRole = (role: string) => roster.find((t) => t.role === role);
  const mine = () => state.towers.filter((t) => t.owner === seat);
  const count = (role: string) => mine().filter((t) => ctx.towerIndex[t.def].role === role).length;
  const freePad = (worst = false) => {
    const list = worst ? [...pads].reverse() : pads;
    return list.find((p) => state.occupied[p.row * state.cols + p.col] === -1);
  };
  const place = (role: string): boolean => {
    const def = byRole(role);
    if (!def || wallet(state, seat) < def.cost || mine().length >= MAX_TOWERS) return false;
    const pad = freePad(role === 'economy');
    if (!pad) return false;
    return applyInput(state, ctx, { type: 'place', tower: def.id, col: pad.col, row: pad.row }, seat).ok;
  };
  // Upgrade the best-placed tower that can be upgraded: cheaper than a new tower for the damage.
  const upgradeOne = (): boolean => {
    const candidates = mine()
      .filter((t) => t.tier < 3 && ctx.towerIndex[t.def].attack !== 'economy')
      .sort((a, b) => a.tier - b.tier || a.id - b.id);
    for (const tower of candidates) {
      // tier 3 branch: alternate by tower id (on a versus board by the seat's own count, so seats with
      // different id parities do not end up with different branches)
      const pick = state.versus ? mine().filter((t) => t.tier === 3).length % 2 === 0 : tower.id % 2 === 1;
      const res = applyInput(state, ctx, { type: 'upgrade', towerId: tower.id, branch: tower.tier === 2 ? (pick ? 'a' : 'b') : undefined }, seat);
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
  // long runs: once the plan is built and upgraded, keep filling pads with damage
  const fill = ['heavy', 'splash', 'range', 'starter', 'support'];
  for (let guard = 0; guard < 60; guard++) {
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
    if (!acted && state.waveIndex >= ctx.waves.waves.length - 1) {
      const role = fill[mine().length % fill.length];
      if (place(role)) acted = true;
    }
    if (!acted && (!freePad() || state.waveIndex >= ctx.waves.waves.length - 1)) {
      // pads full (or a long run past the script) and nothing left to upgrade: Reinforce the least reinforced tier-3 tower
      const ready = mine()
        .filter((t) => reinforceCost(ctx, t) !== null)
        .sort((a, b) => (a.boost ?? 0) - (b.boost ?? 0) || a.id - b.id);
      for (const t of ready) {
        if (applyInput(state, ctx, { type: 'reinforce', towerId: t.id }, seat).ok) {
          acted = true;
          break;
        }
      }
    }
    if (!acted) break;
  }
}

/**
 * Play a level with the scripted builder. `opts` are the run rules (rounds, bossEvery, difficulty) and,
 * for a shared board, `seats` / `party` / `coop` with one race per seat in `races` (one builder each).
 */
export function runLevel(levelId: string, raceId: string, seed: string, verbose: boolean, scaling?: Partial<WaveScaling>, opts: SimOptions & { races?: string[]; sendEvery?: number } = {}): SimState {
  const level = levelById(levelId)!;
  const waves = scaling ? { ...level.waves, scaling } : level.waves;
  const ctx = createContext(content, level.map, waves);
  const { races, sendEvery = 0, ...simOpts } = opts;
  const state = createSim(ctx, seed, simOpts);
  const seatRaces = races ?? [raceId];
  const rosters = seatRaces.map((r) => towersForRace(r));
  const seatPads = rosters.map((roster, seat) => rankedPads(state, ctx, roster[0]?.range ?? 2.2, seat));
  let lastPhase: string | null = null;
  let lastWave = -1;
  while (state.phase !== 'won' && state.phase !== 'lost' && state.tick < MAX_TICKS) {
    // Like a player: build at the start of every build phase, and keep spending bounty during waves.
    if ((state.phase === 'build' && lastPhase !== 'build') || state.tick % 20 === 0) {
      // versus: take turns at the shared pads (the seat that builds first changes every tick)
      const first = state.versus ? state.tick % rosters.length : 0;
      for (let k = 0; k < rosters.length; k++) {
        const seat = (first + k) % rosters.length;
        buildPhase(state, ctx, rosters[seat], seatPads[seat], seat, sendEvery);
      }
    }
    lastPhase = state.phase;
    stepSim(state, ctx);
    if (verbose && state.waveIndex !== lastWave && state.phase === 'wave') {
      lastWave = state.waveIndex;
      console.log(`    wave ${state.waveIndex + 1}/${state.rules.rounds} "${waveAt(ctx, state.waveIndex).name}" at tick ${state.tick}: lives ${state.lives}, money ${state.wallets.join('/')}, towers ${state.towers.length}`);
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

// 5: run rules — a 20-round run with a mini-boss every 5 rounds on the first level
const rulesFail: string[] = [];
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) rulesFail.push(what);
};
console.log('\nRun rules:');
const opts: SimOptions = { rounds: 20, bossEvery: 5 };
const long = runLevel(first.id, 'assembly', 'smoke-1', false, undefined, opts);
check(long.rules.rounds === 20 && long.rules.bossEvery === 5, 'rules are kept on the state');
check(!isStandardRun(ctx0, long.rules) && isStandardRun(ctx0, createSim(ctx0, 'x').rules), 'a custom run is told apart from the level as written');
check(long.phase === 'won' ? long.result?.wavesCleared === 20 : long.waveIndex < 20, `the run lasts 20 rounds (${long.phase} at ${long.waveIndex + 1}, ${long.stats.bosses} mini-bosses down)`);
check(long.stats.bosses >= 1 && long.stats.bosses <= 4, 'mini-bosses came and were counted (at most 4 in 20 rounds)');
const rounds = [...Array(20).keys()].filter((i) => hasBoss(long.rules, i)).map((i) => i + 1);
check(rounds.join(',') === '5,10,15,20', `mini-bosses close rounds ${rounds.join(', ')}`);
check(bossScale(2) < bossScale(9) && bossScale(14) === 1 && bossScale(40) === 1, 'early mini-bosses come at part strength, full from round 15');
const reg = waveMultipliers(ctx0, 40, long).hp;
const boss = waveMultipliers(ctx0, 40, long, true).hp;
check(boss < reg, 'past the script mini-bosses grow more slowly than the regular creeps');
const ctxR = createContext(content, first.map, first.waves);
const again = finishReplay(ctxR, replay(ctxR, 'smoke-1', long.inputLog, undefined, opts));
check(hashState(again) === hashState(long), 'the input log replays the custom run exactly (with its rules)');

const failed = hashB !== hashA || hashR !== hashA || hashC === hashA || rulesFail.length > 0;
if (failed) {
  console.error(`\nSMOKE TEST FAILED (${rulesFail.length ? 'run rules' : 'determinism'})`);
  process.exit(1);
}
console.log(anyUnwinnable ? '\nSMOKE TEST PASSED (some level/race pairs are lost by the scripted builder; see the table)' : '\nSMOKE TEST PASSED');
}
