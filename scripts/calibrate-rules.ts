// Extra Terram — scripts/calibrate-rules.ts v0.1.1 — --level filters the long runs too; prints the highest score (server cap 1,000,000)
// Usage: npm run calibrate:rules                 (everything)
//        npm run calibrate:rules -- --long       (long runs only)   --coop (co-op only)   --rounds 100 --boss 5   --level <id>
// The builder is a floor, not a target: a human who places and upgrades with thought should go further.
import { content, levels } from '../src/content';
import { DIFFICULTIES } from '../src/engine';

process.env.SIM_LIB = '1';
const { runLevel } = await import('./sim-smoke');

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const onlyLong = process.argv.includes('--long');
const onlyCoop = process.argv.includes('--coop');
const rounds = Number(arg('--rounds') ?? 100);
const boss = Number(arg('--boss') ?? 0);
const RACES = content.races.map((r) => r.id);
const deltaScan = arg('--delta');
const scanLevel = arg('--level');

if (!onlyCoop && !deltaScan) {
  console.log(`\nLong runs: ${rounds} rounds${boss ? `, mini-boss every ${boss}` : ''} (rounds reached / lives left, W = all survived)`);
  console.log('  level                  ' + RACES.map((r) => r.padStart(12)).join(''));
  let top = { score: 0, where: '' };
  for (const level of levels.filter((l) => !scanLevel || l.id === scanLevel)) {
    const cells = RACES.map((race) => {
      const s = runLevel(level.id, race, 'smoke-1', false, undefined, { rounds, bossEvery: boss });
      if (s.score > top.score) top = { score: s.score, where: `${level.id} / ${race}` };
      const reached = s.phase === 'won' ? `W${s.rules.rounds}` : `${s.waveIndex + 1}`;
      return `${reached}/${s.lives}`.padStart(12);
    });
    console.log(`  ${level.id.padEnd(22)} ${cells.join('')}`);
  }
  console.log(`  highest score ${top.score} (${top.where}); the server accepts up to 1,000,000`);
}

if (deltaScan) {
  // co-op difficulty scan: try each delta as the 'brutal' tier with every pair
  const deltas = deltaScan.split(',').map(Number);
  const saved = DIFFICULTIES[2].delta;
  const pairs: Array<[string, string]> = [
    ['rootkin', 'assembly'],
    ['chitin', 'lumenari'],
    ['assembly', 'lumenari'],
  ];
  console.log(`\nCo-op delta scan (won-lives / lost@wave):`);
  console.log('  level                  pair                ' + deltas.map((d) => `d+${d}`.padStart(9)).join(''));
  for (const level of levels.filter((l) => !scanLevel || l.id === scanLevel)) {
    for (const [a, b] of pairs) {
      const cells = deltas.map((d) => {
        DIFFICULTIES[2].delta = d;
        const s = runLevel(level.id, a, 'smoke-1', false, undefined, { seats: 2, party: 2, coop: true, races: [a, b], difficulty: 2 });
        return (s.phase === 'won' ? `W-${s.lives}` : `L@${s.waveIndex + 1}`).padStart(9);
      });
      console.log(`  ${level.id.padEnd(22)} ${`${a}+${b}`.padEnd(19)} ${cells.join('')}`);
    }
  }
  DIFFICULTIES[2].delta = saved;
  process.exit(0);
}

if (!onlyLong) {
  const pairs: Array<[string, string]> = [
    ['rootkin', 'assembly'],
    ['chitin', 'lumenari'],
    ['assembly', 'lumenari'],
  ];
  console.log(`\nCo-op, two builders on one board, the level's own rounds (won-lives / lost@wave):`);
  console.log('  level                  pair                ' + DIFFICULTIES.map((d) => d.name.padStart(10)).join(''));
  for (const level of levels) {
    for (const [a, b] of pairs) {
      const cells = DIFFICULTIES.map((_, difficulty) => {
        const s = runLevel(level.id, a, 'smoke-1', false, undefined, { seats: 2, party: 2, coop: true, races: [a, b], difficulty });
        return (s.phase === 'won' ? `W-${s.lives}` : `L@${s.waveIndex + 1}`).padStart(10);
      });
      console.log(`  ${level.id.padEnd(22)} ${`${a}+${b}`.padEnd(19)} ${cells.join('')}`);
    }
  }
}
