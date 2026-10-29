// Extra Terram — src/ui/RulesPicker.tsx v0.1.0 — rounds (up to 100), mini-bosses every N rounds, and co-op difficulty
// The same controls on the menu (single player) and in a lobby (the host). Joiners see RulesSummary.
import { content, type LevelEntry } from '../content';
import { DIFFICULTIES } from '../engine';
import { BOSS_CHOICES, ROUND_CHOICES, bossesHappen, describeRules, isCustomRun, resolveRules, standardRounds, type RulePick } from '../app/rules';

const DIFFICULTY_NOTES = ['The level as written, grown for the party.', 'Tougher and more numerous creeps: about one map harder.', 'Much tougher again: for teams that have the maze down.'];

/** Lives a mini-boss costs when it gets through (all mini-bosses cost the same). */
function bossLeak(): number {
  return content.creeps.find((c) => c.archetype === 'boss')?.leakCost ?? 5;
}

interface Props {
  level: LevelEntry;
  pick: RulePick;
  onChange(next: RulePick): void;
  /** Offer the difficulty tiers (co-op lobbies). */
  difficulty?: boolean;
  disabled?: boolean;
  /** Where the note about stars and top scores applies: single player runs are recorded per level. */
  solo?: boolean;
}

export function RulesPicker({ level, pick, onChange, difficulty = false, disabled = false, solo = false }: Props) {
  const std = standardRounds(level);
  const rules = resolveRules(difficulty ? pick : { ...pick, difficulty: 0 }, level);
  const custom = isCustomRun(rules, level);
  const select = 'w-full rounded-md border border-grove-700 bg-grove-950/80 px-2 py-2 text-sm disabled:opacity-60';

  return (
    <div className="mt-3" aria-label="Run rules">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-grove-300/60">Rounds</span>
          <select aria-label="Rounds" value={pick.rounds} disabled={disabled} onChange={(e) => onChange({ ...pick, rounds: Number(e.target.value) })} className={select}>
            <option value={0}>Standard · {std}</option>
            {ROUND_CHOICES.filter((n) => n !== std).map((n) => (
              <option key={n} value={n}>
                {n} rounds
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-grove-300/60">Mini-bosses</span>
          <select aria-label="Mini-bosses" value={pick.bossEvery} disabled={disabled} onChange={(e) => onChange({ ...pick, bossEvery: Number(e.target.value) })} className={select}>
            {BOSS_CHOICES.map((b) => (
              <option key={b.every} value={b.every}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {difficulty && (
        <div className="mt-2">
          <span className="text-xs text-grove-300/60">Co-op difficulty</span>
          <div className="mt-1 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Co-op difficulty">
            {DIFFICULTIES.map((d, i) => {
              const active = pick.difficulty === i;
              return (
                <button
                  key={d.id}
                  role="radio"
                  aria-checked={active}
                  disabled={disabled}
                  onClick={() => onChange({ ...pick, difficulty: i })}
                  className={`rounded-md border px-2 py-1.5 text-sm font-semibold disabled:opacity-60 ${active ? (i === 2 ? 'border-rust bg-rust/25 text-amber-100' : i === 1 ? 'border-sap bg-sap/20 text-sap' : 'border-grove-500 bg-grove-700 text-white') : 'border-grove-700 bg-grove-800/80 text-grove-300 hover:bg-grove-700'}`}
                >
                  {d.name}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-grove-300/70">{DIFFICULTY_NOTES[pick.difficulty] ?? ''}</p>
        </div>
      )}

      <RulesNotes level={level} rules={rules} solo={solo} custom={custom} />
    </div>
  );
}

function RulesNotes({ level, rules, solo, custom }: { level: LevelEntry; rules: ReturnType<typeof resolveRules>; solo: boolean; custom: boolean }) {
  const std = standardRounds(level);
  const notes: string[] = [];
  if (rules.rounds > std) notes.push(`Rounds after ${std} keep getting harder, and every round counts for more points.`);
  else if (rules.rounds < std) notes.push(`A short run: the first ${rules.rounds} of the level's ${std} waves.`);
  if (rules.bossEvery > 0) {
    notes.push(bossesHappen(rules) ? `A mini-boss ends every ${rules.bossEvery === 1 ? '' : ordinal(rules.bossEvery) + ' '}round: a big payout and triple points, but it costs ${bossLeak()} lives if it gets through.` : 'No mini-boss turns up in a run this short.');
  }
  if (custom && solo) notes.push('Custom runs earn no stars; their scores go on the Ultimate list, not the Standard one.');
  if (!notes.length) return null;
  return (
    <ul className="mt-1.5 flex flex-col gap-0.5 text-[11px] leading-snug text-grove-300/75">
      {notes.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}

/** Read-only rules for players who are not the host. */
export function RulesSummary({ level, rules }: { level: LevelEntry; rules: ReturnType<typeof resolveRules> | null }) {
  const r = rules ?? resolveRules(undefined, level);
  return (
    <div className="mt-3 rounded-md border border-grove-700 bg-grove-950/50 px-3 py-2 text-sm" aria-label="Run rules">
      <span className="text-xs text-grove-300/60">Rules (the host sets these)</span>
      <p className="font-semibold text-grove-300">{describeRules(r, level)}</p>
      <RulesNotes level={level} rules={r} solo={false} custom={isCustomRun(r, level)} />
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
