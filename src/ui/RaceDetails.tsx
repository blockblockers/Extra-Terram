// Extra Terram — src/ui/RaceDetails.tsx v0.3.0 — the precise picture: special ability in numbers, damage against every race, currency (with its icon), every tower
// The race picker says it in plain English; this panel gives the numbers behind it.
import { content, currencyOf, matchupsFor, towersForRace } from '../content';
import { TICK_RATE, towerStats, type RaceDef, type TowerDef } from '../engine';
import { TowerIcon } from './TowerIcon';
import { Money, UiIcon, currencyIcon } from './UiIcon';

const ROLE: Record<string, string> = { starter: 'Starter', heavy: 'Heavy', control: 'Slow field', splash: 'Splash', range: 'Sniper', economy: 'Income', support: 'Buff', trap: 'Trap' };

/** Short traits a tower has from tier 1: "chains to 2", "wounds bleed", "ignores armour", "splash 1.2". */
function traits(t: TowerDef, currency: string): string[] {
  const s = towerStats(t, 1, null);
  const out: string[] = [];
  if (t.attack === 'projectile' || t.attack === 'beam') {
    out.push(`${Math.round((s.damage * TICK_RATE) / s.cooldownTicks)} dps · range ${s.range.toFixed(1)}`);
    if (t.attack === 'beam') out.push('beam');
    if (s.splash > 0) out.push(`splash ${s.splash.toFixed(1)}`);
    if (s.chain > 0) out.push(`chains to ${s.chain + 1}`);
    if (s.bleedPerSecond > 0) out.push('wounds keep hurting');
    if (s.slowOnHit > 0) out.push(`hits slow ${Math.round(s.slowOnHit * 100)}%`);
    if (s.armorPierce) out.push('ignores armour');
  } else if (t.attack === 'aura') {
    out.push(`slow ${Math.round(s.slow * 100)}% · range ${s.range.toFixed(1)}`);
    if (s.dotPerSecond > 0) out.push(`${s.dotPerSecond} damage/s`);
  } else if (t.attack === 'economy') out.push(`+${s.income} ${currency} per wave`);
  else if (t.attack === 'support' && s.buff) out.push(`+${Math.round((s.buff.damageMult - 1) * 100)}% damage, ${Math.round((1 - s.buff.cooldownMult) * 100)}% faster nearby`);
  return out;
}

export function RaceDetails({ race }: { race: RaceDef }) {
  const { multiplier } = matchupsFor(race.id);
  const currency = currencyOf(race.id);
  return (
    <div className="mt-2 border-t border-grove-700/60 pt-2 text-xs">
      <p className="text-grove-300/90">{race.description}</p>

      <div className="mt-2 rounded-md bg-grove-950/60 px-2 py-1.5">
        <div className="text-[10px] uppercase tracking-wide text-grove-300/60">Special ability</div>
        <p className="text-grove-300">
          <span className="font-semibold text-sap">{race.passive.name}.</span> {race.passive.description}
        </p>
      </div>

      <div className="mt-2 rounded-md bg-grove-950/60 px-2 py-1.5">
        <div className="text-[10px] uppercase tracking-wide text-grove-300/60">
          {race.damageTypes.join(' & ')} damage against each race's creeps
        </div>
        <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
          {content.races.map((r) => {
            const m = multiplier[r.id];
            const tone = m > 1.05 ? 'text-grove-300' : m < 0.95 ? 'text-rust' : 'text-grove-300/70';
            return (
              <li key={r.id} className="flex justify-between gap-2">
                <span className="truncate">{r.id === race.id ? `${r.name} (mirror)` : r.name}</span>
                <span className={`tabular-nums font-semibold ${tone}`}>
                  ×{m.toFixed(2).replace(/0$/, '')}
                  {m > 1.05 ? ' strong' : m < 0.95 ? ' weak' : ''}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-1 text-grove-300/60">Towers that ignore armour never drop below ×1.</p>
      </div>

      <div className="mt-2 rounded-md bg-grove-950/60 px-2 py-1.5">
        <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-grove-300/60">
          Money: <UiIcon name={currencyIcon(currency)} size={14} /> {currency}
        </div>
        <p className="text-grove-300/80">Earned from kills, from every wave cleared and by calling a wave early.</p>
      </div>

      <h3 className="mt-2 text-[10px] uppercase tracking-wide text-grove-300/60">Towers</h3>
      <ul className="mt-1 flex flex-col gap-1">
        {towersForRace(race.id).map((t) => (
          <li key={t.id} className="flex items-start gap-2 rounded-md bg-grove-800/60 px-2 py-1">
            <TowerIcon tower={t} size={30} state="t1" />
            <span className="min-w-0">
              <span className="font-semibold">{t.name}</span>{' '}
              <span className="text-grove-300/60">
                · {ROLE[t.role] ?? t.role} · <Money amount={t.cost} currency={currency} size={12} />
              </span>
              <span className="block text-grove-300/80">{t.description}</span>
              <span className="block text-sap/80">{traits(t, currency).join(' · ')}</span>
              <span className="block text-grove-300/60">
                Tier 3: {t.branches.a.name} or {t.branches.b.name}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
