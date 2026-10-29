// Extra Terram — scripts/calibrate-endless.ts v0.1.0 — scan a level's growth past its script: rounds the builder reaches in a 100-round run
// Usage: npm run calibrate:endless -- --level chitin-hive-01 --hp 1,2,3 [--count 1.5] [--k 40] [--rounds 100]
// Prints rounds reached / lives per race for each hpMax; copy the chosen numbers into the level's `endless` block.
import { content, levels } from '../src/content';

process.env.SIM_LIB = '1';
const { runLevel } = await import('./sim-smoke');

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const only = arg('--level');
const hps = (arg('--hp') ?? '1,2,3,4').split(',').map(Number);
const countMax = arg('--count') !== undefined ? Number(arg('--count')) : undefined;
const k = arg('--k') !== undefined ? Number(arg('--k')) : undefined;
const rounds = Number(arg('--rounds') ?? 100);
const RACES = content.races.map((r) => r.id);

for (const level of levels.filter((l) => !only || l.id === only)) {
  console.log(`\n${level.id} — ${rounds} rounds (rounds reached / lives)`);
  console.log('  hpMax  ' + RACES.map((r) => r.padStart(11)).join(''));
  const original = level.waves.endless;
  for (const hpMax of hps) {
    level.waves.endless = { ...(original ?? {}), hpMax, ...(countMax !== undefined ? { countMax } : {}), ...(k !== undefined ? { hpK: k } : {}) };
    const cells = RACES.map((race) => {
      const s = runLevel(level.id, race, 'smoke-1', false, undefined, { rounds });
      return `${s.phase === 'won' ? 'W' : ''}${s.phase === 'won' ? s.rules.rounds : s.waveIndex + 1}/${s.lives}`.padStart(11);
    });
    console.log(`  ${hpMax.toFixed(2).padStart(5)}  ${cells.join('')}`);
  }
  level.waves.endless = original;
}
