// Extra Terram — scripts/validate-content.mjs v0.5.0 — every path tile must lie on the route the engine walks (no shortcut between two runs, no stray tiles)
// Validates every file under src/content against its JSON Schema, then cross-checks references.
// Runs as part of `npm run build` so a bad balance edit fails the deploy, not the player.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'content');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const schema = (name) => read(join(root, 'schemas', `${name}.schema.json`));

// strictRequired is off because the tower schema's if/then blocks require properties defined one level up.
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
const validators = {
  race: ajv.compile(schema('race')),
  tower: ajv.compile(schema('tower')),
  creep: ajv.compile(schema('creep')),
  damage: ajv.compile(schema('damage-matrix')),
  map: ajv.compile(schema('map')),
  wave: ajv.compile(schema('wave')),
};

const problems = [];
const fail = (file, msg) => problems.push(`${file}: ${msg}`);

function check(kind, file, data) {
  const ok = validators[kind](data);
  if (!ok) for (const e of validators[kind].errors) fail(file, `${e.instancePath || '/'} ${e.message}`);
  return ok;
}

const races = read(join(root, 'races.json'));
const towers = read(join(root, 'towers.json'));
const creeps = read(join(root, 'creeps.json'));
const damage = read(join(root, 'damage-matrix.json'));
check('race', 'races.json', races);
check('tower', 'towers.json', towers);
check('creep', 'creeps.json', creeps);
check('damage', 'damage-matrix.json', damage);

const raceIds = new Set(races.races.map((r) => r.id));
const creepIds = new Set(creeps.creeps.map((c) => c.id));
const towerIds = new Set();
for (const t of towers.towers) {
  if (towerIds.has(t.id)) fail('towers.json', `duplicate tower id ${t.id}`);
  towerIds.add(t.id);
  if (!raceIds.has(t.race)) fail('towers.json', `tower ${t.id} references unknown race ${t.race}`);
}
for (const c of creeps.creeps) if (!raceIds.has(c.race)) fail('creeps.json', `creep ${c.id} references unknown race ${c.race}`);
for (const c of creeps.creeps) if (c.art && !creepIds.has(c.art)) fail('creeps.json', `creep ${c.id} borrows art from unknown creep ${c.art}`);
for (const r of races.races) if (!creeps.creeps.some((c) => c.race === r.id && c.archetype === 'boss')) fail('creeps.json', `race ${r.id} has no mini-boss (archetype "boss")`);

/** A versus map's zone digit at a cell (-1 for '.', or when the map has no zones). */
const zoneAt = (m, c, r) => {
  const ch = m.zones?.[r]?.[c];
  return ch && ch >= '0' && ch <= '9' ? Number(ch) : -1;
};

/**
 * Same walk the engine does at load: 4-neighbour BFS over path/spawn/exit tiles (that `allowed` admits),
 * same neighbour order. Returns the route as "c,r" keys from start to goal, or null when there is none.
 */
function routeOf(m, start = null, goal = null, allowed = () => true) {
  const kind = (c, r) => m.legend[m.grid[r][c]];
  if (!start || !goal) {
    for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
      if (kind(c, r) === 'spawn') start = [c, r];
      if (kind(c, r) === 'exit') goal = [c, r];
    }
  }
  const prev = new Map([[start.join(','), null]]);
  const queue = [start];
  while (queue.length) {
    const [c, r] = queue.shift();
    if (c === goal[0] && r === goal[1]) {
      const out = [];
      for (let k = `${c},${r}`; k !== null; k = prev.get(k)) out.push(k);
      return out.reverse();
    }
    for (const [nc, nr] of [[c, r - 1], [c + 1, r], [c, r + 1], [c - 1, r]]) {
      if (nc < 0 || nr < 0 || nc >= m.cols || nr >= m.rows) continue;
      const k = kind(nc, nr);
      if (!['path', 'spawn', 'exit'].includes(k) || prev.has(`${nc},${nr}`) || !allowed(nc, nr)) continue;
      prev.set(`${nc},${nr}`, `${c},${r}`);
      queue.push([nc, nr]);
    }
  }
  return null;
}
/** Path tiles no route walks: two runs that touch (the creeps take the shortcut) or a stray tile. */
function offRoute(m, walked) {
  const out = [];
  m.grid.forEach((row, r) => [...row].forEach((ch, c) => {
    if (['path', 'spawn', 'exit'].includes(m.legend[ch]) && !walked.has(`${c},${r}`)) out.push(`col ${c} row ${r}`);
  }));
  return out;
}

const PAD_REACH = 1.5;
const maps = new Map();
for (const f of readdirSync(join(root, 'maps')).filter((f) => f.endsWith('.json'))) {
  const m = read(join(root, 'maps', f));
  const file = `maps/${f}`;
  if (!check('map', file, m)) continue;
  maps.set(m.id, m);
  if (m.grid.length !== m.rows) fail(file, `grid has ${m.grid.length} rows, expected ${m.rows}`);
  let spawns = 0, exits = 0, pads = 0;
  m.grid.forEach((row, r) => {
    if (row.length !== m.cols) fail(file, `row ${r} has ${row.length} columns, expected ${m.cols}`);
    for (const ch of row) {
      const kind = m.legend[ch];
      if (!kind) fail(file, `row ${r}: character '${ch}' is not in the legend`);
      if (kind === 'spawn') spawns++;
      if (kind === 'exit') exits++;
      if (kind === 'pad') pads++;
    }
  });
  const versus = !!m.mode;
  const walked = new Set();
  if (!versus && spawns === 1 && exits === 1) {
    const route = routeOf(m);
    if (!route) fail(file, 'no walkable path from spawn to exit (path tiles must touch edge to edge)');
    else route.forEach((k) => walked.add(k));
  }
  if (versus) {
    // a route per slot: lanes run spawn → exit inside their own zone; King runs from the one shared
    // spawn over shared cells into the base's own fork
    if (m.zones.length !== m.rows || m.zones.some((z) => z.length !== m.cols)) fail(file, 'zones must have the same size as grid');
    const cells = (want) => {
      const out = [];
      m.grid.forEach((row, r) => [...row].forEach((ch, c) => { if (m.legend[ch] === want) out.push([c, r]); }));
      return out;
    };
    const spawnCells = cells('spawn');
    const exitCells = cells('exit');
    for (let s = 0; s < m.slots; s++) {
      const exit = exitCells.find(([c, r]) => zoneAt(m, c, r) === s);
      const spawn = m.mode === 'lanes' ? spawnCells.find(([c, r]) => zoneAt(m, c, r) === s) : spawnCells.find(([c, r]) => zoneAt(m, c, r) === -1);
      if (!exit) fail(file, `slot ${s} has no exit in its zone`);
      if (!spawn) fail(file, m.mode === 'lanes' ? `lane ${s} has no spawn in its zone` : 'King maps need one spawn on a shared cell');
      if (!exit || !spawn) continue;
      const allowed = m.mode === 'lanes' ? (c, r) => zoneAt(m, c, r) === s : (c, r) => zoneAt(m, c, r) === -1 || zoneAt(m, c, r) === s;
      const route = routeOf(m, spawn, exit, allowed);
      if (!route) fail(file, `slot ${s}: no walkable route from its spawn to its exit`);
      else route.forEach((k) => walked.add(k));
      const own = cells('pad').filter(([c, r]) => zoneAt(m, c, r) === s).length;
      if (own < 4) fail(file, `slot ${s} owns only ${own} build pads`);
    }
    if (m.mode === 'lanes' && (spawns !== m.slots || exits !== m.slots)) fail(file, `a ${m.slots}-lane map needs ${m.slots} spawns and ${m.slots} exits`);
    if (m.mode === 'king' && (spawns !== 1 || exits !== m.slots)) fail(file, `a ${m.slots}-base King map needs 1 spawn and ${m.slots} exits`);
    m.zones.forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== '.' && Number(ch) >= m.slots) fail(file, `zones row ${r}, col ${c}: '${ch}' but the map has ${m.slots} slots`); }));
  }
  // Every pad must be useful: the shortest attack range in the game is 1.8 tiles, so a pad more than
  // 1.5 tiles (centre to centre) from the nearest path cell can hold nothing that reaches the creeps.
  const pathCells = [];
  m.grid.forEach((row, r) => [...row].forEach((ch, c) => { if (['path', 'spawn', 'exit'].includes(m.legend[ch])) pathCells.push([c, r]); }));
  m.grid.forEach((row, r) => [...row].forEach((ch, c) => {
    if (m.legend[ch] !== 'pad') return;
    // a versus pad must reach the trail it belongs to: its own zone's cells or shared ones
    const z = zoneAt(m, c, r);
    const reachable = versus && z >= 0 ? pathCells.filter(([pc, pr]) => zoneAt(m, pc, pr) === z || (m.mode === 'king' && zoneAt(m, pc, pr) === -1)) : pathCells;
    const d = Math.min(...reachable.map(([pc, pr]) => Math.hypot(pc - c, pr - r)));
    if (d > PAD_REACH) fail(file, `pad at col ${c}, row ${r} is ${d.toFixed(2)} tiles from ${versus && z >= 0 ? 'its own trail' : 'the path'} (max ${PAD_REACH}); no tower can reach the creeps from there`);
  }));
  // every path tile must be walked: a tile off the route is a shortcut the creeps take between two runs
  // that touch, or a stray tile the art would paint as trail that nobody walks
  if (walked.size) {
    const stray = offRoute(m, walked);
    if (stray.length) fail(file, `${stray.length} path tile${stray.length === 1 ? ' is' : 's are'} off the route the creeps walk (two runs touching make a shortcut; keep a tile between them): ${stray.slice(0, 6).join(', ')}${stray.length > 6 ? ', …' : ''}`);
  }
  if (!versus && spawns !== 1) fail(file, `expected exactly 1 spawn, found ${spawns}`);
  if (!versus && exits !== 1) fail(file, `expected exactly 1 exit, found ${exits}`);
  if (pads < 4) fail(file, `only ${pads} build pads`);
  if (!raceIds.has(m.world)) fail(file, `world ${m.world} is not a race id`);
}

for (const f of readdirSync(join(root, 'waves')).filter((f) => f.endsWith('.json'))) {
  const w = read(join(root, 'waves', f));
  const file = `waves/${f}`;
  if (!check('wave', file, w)) continue;
  if (!maps.has(w.map)) fail(file, `references unknown map ${w.map}`);
  w.waves.forEach((wave, i) => {
    for (const g of wave.groups) if (!creepIds.has(g.creep)) fail(file, `wave ${i + 1} references unknown creep ${g.creep}`);
  });
}

const versions = new Set([races.content_version, towers.content_version, creeps.content_version, damage.content_version, ...[...maps.values()].map((m) => m.content_version)]);
if (versions.size > 1) console.warn(`warning: mixed content_version values: ${[...versions].join(', ')}`);

if (problems.length) {
  console.error(`Content validation failed (${problems.length} problem${problems.length === 1 ? '' : 's'}):`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`Content OK: ${races.races.length} races, ${towers.towers.length} towers, ${creeps.creeps.length} creeps, ${maps.size} map(s), content_version ${[...versions][0]}`);
