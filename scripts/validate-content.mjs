// Extra Terram — scripts/validate-content.mjs v0.1.0 — Phase 1 scaffold
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
  if (spawns !== 1) fail(file, `expected exactly 1 spawn, found ${spawns}`);
  if (exits !== 1) fail(file, `expected exactly 1 exit, found ${exits}`);
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
