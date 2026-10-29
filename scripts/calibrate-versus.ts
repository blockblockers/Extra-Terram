// Extra Terram — scripts/calibrate-versus.ts v0.1.0 — how Lanes and King of the Maze matches play out between scripted builders
// Usage: npx tsx scripts/calibrate-versus.ts [--map id] [--sends 3] [--seed s]
// For every versus map: a mirror match (every seat the same race), a mixed match, and 2 v 2 where the
// map allows it. Prints, per side, the round it fell in (or its lives at the end) and its score.
import { content, versusLevels } from '../src/content';
import type { SimState } from '../src/engine';

process.env.SIM_LIB = '1';
const { runLevel } = await import('./sim-smoke');

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const only = arg('--map');
const sendEvery = Number(arg('--sends') ?? 0);
const seed = arg('--seed') ?? 'smoke-1';
const RACES = content.races.map((r) => r.id);

function describe(s: SimState): string {
  const order = s.result?.placements;
  return s.sides
    .map((sd, i) => {
      const who = sd.seats.map((seat) => `s${seat}`).join('+');
      const fate = sd.out ? `fell r${sd.outWave + 1}` : `held ${sd.lives}♥`;
      return `${order ? `#${order[i]} ` : ''}${who} ${fate} ${sd.score}`;
    })
    .join(' | ');
}

for (const level of versusLevels.filter((l) => !only || l.id === only)) {
  const slots = level.map.slots ?? 2;
  const mode = level.map.mode!;
  console.log(`\n${level.id} (${mode}, ${slots} slots, ${level.waves.waves.length} rounds${sendEvery ? `, sends every ${sendEvery}` : ''})`);
  const runs: Array<{ label: string; races: string[]; teams?: boolean }> = [];
  for (const r of RACES) runs.push({ label: `all ${r}`, races: new Array(slots).fill(r) });
  runs.push({ label: 'mixed', races: RACES.slice(0, slots) });
  if (mode === 'lanes' && slots === 4) runs.push({ label: '2v2 mixed', races: RACES.slice(0, 4), teams: true });
  if (mode === 'king' && slots === 2) {
    runs.push({ label: '2v2 rootkin+assembly vs chitin+lumenari', races: ['rootkin', 'chitin', 'assembly', 'lumenari'], teams: true });
    runs.push({ label: '2v2 all assembly', races: new Array(4).fill('assembly'), teams: true });
  }
  for (const run of runs) {
    const seats = run.races.length;
    const s = runLevel(level.id, run.races[0], seed, false, undefined, { versus: mode, seats, party: seats, teams: run.teams, races: run.races, sendEvery });
    console.log(`  ${run.label.padEnd(40)} ${s.phase.padEnd(4)} r${s.waveIndex + 1}  ${describe(s)}`);
  }
}
