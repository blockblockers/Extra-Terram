// Extra Terram — scripts/calibrate-versus-d.ts v0.1.0 — scan a versus map's difficulty factor d
// Usage: npx tsx scripts/calibrate-versus-d.ts --map lanes-2-hollows --d 1,1.5,2 [--sends 3]
// d drives the five scaling knobs (hp +0.35, speed +0.1, count +0.15 per unit; per-round ramps
// +0.05 hp, +0.015 speed). Mirror matches for every race; prints the round each side fell in.
import { content, versusLevels } from '../src/content';
import type { WaveScaling } from '../src/engine';

process.env.SIM_LIB = '1';
const { runLevel } = await import('./sim-smoke');

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const only = arg('--map');
const ds = (arg('--d') ?? '0.5,1,1.5,2').split(',').map(Number);
const sendEvery = Number(arg('--sends') ?? 0);
const teams = process.argv.includes('--teams');
const scaling = (d: number): WaveScaling => ({ hpMult: 1 + 0.35 * d, speedMult: 1 + 0.1 * d, countMult: 1 + 0.15 * d, hpPerWave: 0.05 * d, speedPerWave: 0.015 * d, rampWaves: 0 });

for (const level of versusLevels.filter((l) => !only || l.id === only)) {
  const mode = level.map.mode!;
  const seats = teams ? 4 : (level.map.slots ?? 2);
  console.log(`\n${level.id} (${mode}, ${seats} seats${teams ? ', 2 v 2' : ''}${sendEvery ? `, sends every ${sendEvery}` : ''}): round each side fell (or ♥ left)`);
  for (const d of ds) {
    const cells = content.races.map((race) => {
      const s = runLevel(level.id, race.id, 'smoke-1', false, scaling(d), { versus: mode, seats, party: seats, teams, races: new Array(seats).fill(race.id), sendEvery });
      return `${race.id.slice(0, 4)}:` + s.sides.map((sd) => (sd.out ? `${sd.outWave + 1}` : `${sd.lives}♥`)).join('/');
    });
    console.log(`  d=${d.toFixed(2)}  ${cells.join('  ')}`);
  }
}
