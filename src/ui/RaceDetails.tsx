// Extra Terram — src/ui/RaceDetails.tsx v0.1.0 — the full picture of a race before you pick it
// Play style, the passive, what it is strong and weak against, and every tower with its trait.
import { content, towersForRace } from '../content';
import { towerStats, type ArmorType, type RaceDef, type TowerDef } from '../engine';
import { TowerIcon } from './TowerIcon';

const ROLE: Record<string, string> = { starter: 'Starter', heavy: 'Heavy', control: 'Slow field', splash: 'Splash', range: 'Sniper', economy: 'Income', support: 'Buff', trap: 'Trap' };

/** Short traits a tower has from tier 1: "chains 1", "bleeds", "pierces plating", "splash 1.2". */
function traits(t: TowerDef): string[] {
  const s = towerStats(t, 1, null);
  const out: string[] = [];
  if (t.attack === 'projectile' || t.attack === 'beam') {
    out.push(`${t.damageType} · ${Math.round((s.damage * 20) / s.cooldownTicks)} dps · range ${s.range.toFixed(1)}`);
    if (t.attack === 'beam') out.push('beam');
    if (s.splash > 0) out.push(`splash ${s.splash.toFixed(1)}`);
    if (s.chain > 0) out.push(`chains to ${s.chain + 1}`);
    if (s.bleedPerSecond > 0) out.push('wounds bleed');
    if (s.slowOnHit > 0) out.push(`hits slow ${Math.round(s.slowOnHit * 100)}%`);
    if (s.armorPierce) out.push('pierces plating');
  } else if (t.attack === 'aura') {
    out.push(`slow ${Math.round(s.slow * 100)}% · range ${s.range.toFixed(1)}`);
    if (s.dotPerSecond > 0) out.push(`${s.dotPerSecond} ${s.dotType}/s`);
  } else if (t.attack === 'economy') out.push(`+${s.income} sap per wave`);
  else if (t.attack === 'support' && s.buff) out.push(`+${Math.round((s.buff.damageMult - 1) * 100)}% dmg, ${Math.round((1 - s.buff.cooldownMult) * 100)}% faster nearby`);
  return out;
}

function vs(race: RaceDef): { strong: string[]; weak: string[] } {
  const m = content.damage.multipliers;
  const armours: ArmorType[] = ['organic', 'plated', 'shielded'];
  const enemiesOf = (a: ArmorType) => content.races.filter((r) => r.creepArmor === a).map((r) => r.name);
  const best = (a: ArmorType) => Math.max(...race.damageTypes.map((t) => m[t][a]));
  return {
    strong: armours.filter((a) => best(a) >= 1.2).map((a) => `${a} (${enemiesOf(a).join(', ')})`),
    weak: armours.filter((a) => best(a) <= 0.9).map((a) => `${a} (${enemiesOf(a).join(', ')})`),
  };
}

export function RaceDetails({ race }: { race: RaceDef }) {
  const { strong, weak } = vs(race);
  return (
    <div className="mt-2 border-t border-grove-700/60 pt-2 text-xs">
      <p className="text-grove-300/90">{race.description}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-md bg-grove-950/60 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-grove-300/60">Strong vs</div>
          <div className="text-grove-300">{strong.join(', ') || '—'}</div>
        </div>
        <div className="rounded-md bg-grove-950/60 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-grove-300/60">Weak vs</div>
          <div className="text-rust">{weak.join(', ') || '—'}</div>
        </div>
      </div>
      <h3 className="mt-2 text-[10px] uppercase tracking-wide text-grove-300/60">Towers</h3>
      <ul className="mt-1 flex flex-col gap-1">
        {towersForRace(race.id).map((t) => (
          <li key={t.id} className="flex items-start gap-2 rounded-md bg-grove-800/60 px-2 py-1">
            <TowerIcon tower={t} size={30} state="t1" />
            <span className="min-w-0">
              <span className="font-semibold">{t.name}</span> <span className="text-grove-300/60">· {ROLE[t.role] ?? t.role} · {t.cost}</span>
              <span className="block text-grove-300/80">{t.description}</span>
              <span className="block text-sap/80">{traits(t).join(' · ')}</span>
              <span className="block text-grove-300/60">Tier 3: {t.branches.a.name} or {t.branches.b.name}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
