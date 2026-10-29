// Extra Terram — src/app/rules.ts v0.1.0 — the run rules a player (or a lobby host) picks: rounds, mini-bosses, co-op difficulty
// The engine owns what the rules do (src/engine/sim.ts runRules); this file owns how they are offered,
// remembered, described and checked when they arrive from another player.
import type { LevelEntry } from '../content';
import { DIFFICULTIES, MAX_ROUNDS, type RunRules, type SimOptions } from '../engine';

/** What the player picked. `rounds` 0 means the level as written; `bossEvery` 0 means no mini-bosses. */
export interface RulePick {
  rounds: number;
  bossEvery: number;
  difficulty: number;
}

export const STANDARD_PICK: RulePick = { rounds: 0, bossEvery: 0, difficulty: 0 };

/** Round counts offered besides the level's own. */
export const ROUND_CHOICES = [5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100].filter((n) => n <= MAX_ROUNDS);

/** Mini-boss intervals offered: off, then rarer to more often. */
export const BOSS_CHOICES: Array<{ every: number; label: string }> = [
  { every: 0, label: 'Off' },
  { every: 10, label: 'Every 10 rounds' },
  { every: 5, label: 'Every 5 rounds' },
  { every: 3, label: 'Every 3 rounds' },
];

/** The level's own wave count. */
export function standardRounds(level: LevelEntry): number {
  return level.waves.waves.length;
}

/** The concrete rules for a level: "Standard" resolves to the level's own count. */
export function resolveRules(pick: RulePick | undefined, level: LevelEntry): RunRules {
  const p = pick ?? STANDARD_PICK;
  return {
    rounds: p.rounds > 0 ? Math.min(MAX_ROUNDS, Math.floor(p.rounds)) : standardRounds(level),
    bossEvery: Math.max(0, Math.floor(p.bossEvery)),
    difficulty: Math.min(DIFFICULTIES.length - 1, Math.max(0, Math.floor(p.difficulty))),
  };
}

/** The options createSim takes for these rules. */
export function simRules(rules: RunRules | undefined): Pick<SimOptions, 'rounds' | 'bossEvery' | 'difficulty'> {
  return rules ? { rounds: rules.rounds, bossEvery: rules.bossEvery, difficulty: rules.difficulty } : {};
}

/** True when the rules are the level exactly as written: only these earn stars and count for its top scores. */
export function isCustomRun(rules: RunRules | undefined, level: LevelEntry): boolean {
  if (!rules) return false;
  return rules.rounds !== standardRounds(level) || rules.bossEvery > 0 || rules.difficulty > 0;
}

/** Will a mini-boss actually turn up? (Every 10 rounds in a 5-round run never does.) */
export function bossesHappen(rules: RunRules): boolean {
  return rules.bossEvery > 0 && rules.bossEvery <= rules.rounds;
}

/** "30 rounds · mini-boss every 5 rounds · Hard"; the level as written reads "Standard · 14 rounds". */
export function describeRules(rules: RunRules | undefined, level: LevelEntry): string {
  const r = rules ?? resolveRules(undefined, level);
  if (!isCustomRun(r, level)) return `Standard · ${r.rounds} rounds`;
  const parts = [`${r.rounds} round${r.rounds === 1 ? '' : 's'}`];
  if (bossesHappen(r)) parts.push(r.bossEvery === 1 ? 'a mini-boss every round' : `mini-boss every ${r.bossEvery} rounds`);
  if (r.difficulty > 0) parts.push(DIFFICULTIES[r.difficulty].name);
  return parts.join(' · ');
}

/** Rules that came over the wire (another player's presence, a start event): clamp or drop. */
export function sanitizeRules(raw: unknown): RunRules | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null);
  const rounds = num(o.rounds);
  const bossEvery = num(o.bossEvery);
  const difficulty = num(o.difficulty);
  if (rounds === null || bossEvery === null || difficulty === null) return null;
  return {
    rounds: Math.min(MAX_ROUNDS, Math.max(1, rounds)),
    bossEvery: Math.min(MAX_ROUNDS, Math.max(0, bossEvery)),
    difficulty: Math.min(DIFFICULTIES.length - 1, Math.max(0, difficulty)),
  };
}

/** The pick a resolved rule set came from (for selects that show "Standard"). */
export function pickFor(rules: RunRules, level: LevelEntry): RulePick {
  return { rounds: rules.rounds === standardRounds(level) ? 0 : rules.rounds, bossEvery: rules.bossEvery, difficulty: rules.difficulty };
}
