// Extra Terram — scripts/calibrate.ts v0.1.0 — scan difficulty factors per level with the smoke builder
// Usage: npm run calibrate   (edit `factors` or `scalingFor` below, then copy the chosen numbers into the wave script)
// A single factor d drives all five scaling knobs; the table shows lives left per race at each d.
import { levels } from '../src/content';

process.env.SIM_LIB = '1'; // the smoke script must not run its own main when imported
const { runLevel } = await import('./sim-smoke');

const RACES = ['rootkin', 'assembly', 'chitin', 'lumenari'];
const factors = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

export function scalingFor(d: number) {
  return {
    hpMult: 1 + 0.35 * d,
    speedMult: 1 + 0.1 * d,
    countMult: 1 + 0.15 * d,
    hpPerWave: 0.05 * d,
    speedPerWave: 0.015 * d,
  };
}

for (const level of levels) {
  console.log(`\n${level.id} (lives ${level.waves.lives})`);
  console.log('  d     ' + RACES.map((r) => r.padStart(9)).join(''));
  for (const d of factors) {
    const cells = RACES.map((race) => {
      const s = runLevel(level.id, race, 'smoke-1', false, scalingFor(d));
      return `${s.phase === 'won' ? 'W' : 'L'}${String(s.lives).padStart(3)}@${String(s.waveIndex + 1).padStart(2)}`.padStart(9);
    });
    console.log(`  ${d.toFixed(2)}  ${cells.join('')}`);
  }
}
