// Extra Terram — scripts/art-preview/preview.ts v0.3.0 — the real sim and renderer with towers and creeps chosen by URL, to look at new art in motion (dev only, never built into the app); versus maps too
// ?level=<id>&towers=<id>:<state>,...&creeps=<id>,...&speed=1&waves=1&flat=1&unlit=1
// Versus maps (Lanes, King of the Maze) open with every seat filled (&seats=N for fewer); the towers go
// on seat 0's pads, or on every seat's with &all=1.
import { content, levelById } from '../../src/content';
import { TICK_RATE, applyInput, createContext, createSim, stepSim, type SimInput } from '../../src/engine';
import { PixiRenderer } from '../../src/render/PixiRenderer';

const q = new URLSearchParams(location.search);
const level = levelById(q.get('level') ?? 'assembly-scrap-01');
if (!level) throw new Error(`no level ${q.get('level')}`);
const ctx = createContext(content, level.map, level.waves);
const versus = level.map.mode;
const seats = versus ? Math.max(1, Math.min(level.map.slots ?? 2, Number(q.get('seats') ?? level.map.slots ?? 2))) : 1;
const state = createSim(ctx, q.get('seed') ?? 'qa', { rounds: Number(q.get('rounds') ?? 0) || undefined, ...(versus ? { versus, seats } : {}) });
state.wallets.fill(1_000_000);

const log: string[] = [];
const towerSpecs = (q.get('towers') ?? '').split(',').filter(Boolean);
const builders = versus && q.get('all') === '1' ? [...Array(seats).keys()] : [0];
for (const seat of builders) {
  // pads closest to the middle of the seat's route first, so the towers face traffic (seat n walks route n)
  const route = state.routes[Math.min(seat, state.routes.length - 1)];
  const mid = route[Math.floor(route.length * Number(q.get('at') ?? 0.35))];
  const pads: Array<{ c: number; r: number; d: number }> = [];
  for (let r = 0; r < state.rows; r++)
    for (let c = 0; c < state.cols; c++) {
      if (ctx.map.legend[ctx.map.grid[r][c]] !== 'pad') continue;
      pads.push({ c, r, d: (c + 0.5 - mid.x) ** 2 + (r + 0.5 - mid.y) ** 2 });
    }
  pads.sort((a, b) => a.d - b.d);
  let next = 0;
  for (const spec of towerSpecs) {
    const [id, st = 't1'] = spec.split(':');
    // the nearest free pad this seat may build on (versus pads belong to a lane or base)
    let res: ReturnType<typeof applyInput> = { ok: false, reason: 'no pad left' };
    while (next < pads.length && !res.ok) {
      const pad = pads[next++];
      res = applyInput(state, ctx, { type: 'place', tower: id, col: pad.c, row: pad.r }, seat);
    }
    if (!res.ok) { log.push(`place ${id} (seat ${seat}): ${res.reason}`); break; }
    const t = state.towers[state.towers.length - 1];
    if (st !== 't1') {
      res = applyInput(state, ctx, { type: 'upgrade', towerId: t.id }, seat);
      if (!res.ok) log.push(`upgrade ${id}: ${res.reason}`);
    }
    if (st === 't3a' || st === 't3b') {
      res = applyInput(state, ctx, { type: 'upgrade', towerId: t.id, branch: st === 't3a' ? 'a' : 'b' }, seat);
      if (!res.ok) log.push(`branch ${id}: ${res.reason}`);
    }
  }
}
for (const id of (q.get('creeps') ?? '').split(',').filter(Boolean)) {
  const res = applyInput(state, ctx, { type: 'receive', creep: id, count: Number(q.get('count') ?? 1), from: -1 } as SimInput);
  if (!res.ok) log.push(`receive ${id}: ${res.reason}`);
}
if (q.get('waves') !== '0') applyInput(state, ctx, { type: 'start-wave' });

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new PixiRenderer();
const overlay = { hover: null, placing: null, selected: null, showPads: false, seat: -1, pending: null, padPick: null };
const speed = Number(q.get('speed') ?? 1);
let frozen = false;
(window as unknown as { __qa: unknown }).__qa = {
  ready: false,
  log,
  tick: () => state.tick,
  towers: () => state.towers.map((t) => `${t.def}:${t.tier}${t.branch ?? ''}`),
  cells: () => state.towers.map((t) => [t.col, t.row]),
  board: () => [state.cols, state.rows],
  creeps: () => state.creeps.map((c) => c.def),
  freeze: (v: boolean) => (frozen = v),
};
await renderer.mount(canvas, window.innerWidth, window.innerHeight, ctx);
// &flat=1 looks straight down as before; &unlit=1 shows the painting without the ground lighting
renderer.setCamera({ tilt: q.get('flat') === null, lighting: q.get('unlit') === null });
window.addEventListener('resize', () => renderer.resize(window.innerWidth, window.innerHeight));
(window as unknown as { __qa: { ready: boolean } }).__qa.ready = true;
let last = performance.now();
let acc = 0;
const tickMs = 1000 / TICK_RATE;
function frame(now: number): void {
  if (!frozen) {
    acc += Math.min(250, now - last) * speed;
    while (acc >= tickMs) {
      acc -= tickMs;
      if (state.phase === 'won' || state.phase === 'lost') break;
      stepSim(state, ctx);
      renderer.pushEvents(state.events, ctx, state);
    }
  }
  last = now;
  renderer.draw({ state, ctx, alpha: frozen ? 1 : acc / tickMs, overlay });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
