// Extra Terram — src/ui/TowerPanel.tsx v0.7.0 — every upgrade button spells out what changes (damage, range, rate, extras)
// Replaces the build bar while a tower is selected: stats, the next upgrade (a branch choice at tier 2), sell.
import { TICK_RATE, towerStats, type PassiveMods, type RacePassive, type TowerDef, type TowerStats } from '../engine';
import { TowerIcon } from './TowerIcon';

export interface SelectedTower {
  id: number;
  name: string;
  def: TowerDef;
  tier: 1 | 2 | 3;
  branch: 'a' | 'b' | null;
  stats: TowerStats;
  mods: PassiveMods;
  passive: RacePassive;
  kills: number;
  damageDealt: number;
  upgradeCost: number | null;
  sellValue: number;
  /** Shared boards: who built it; null when it is yours (or single player). */
  ownerName: string | null;
}

/** One line on what the race passive is doing to this tower right now. */
export function passiveLine(passive: RacePassive, mods: PassiveMods, attacks: boolean): string | null {
  switch (passive.id) {
    case 'rooted': {
      const pct = Math.round((mods.damageMult - 1) * 100);
      return `Rooted ${mods.wavesStood} wave${mods.wavesStood === 1 ? '' : 's'}: ${pct >= 0 ? '+' : ''}${pct}% damage, +${Math.round((mods.rangeMult - 1) * 100)}% range`;
    }
    case 'spin-up':
      return attacks ? (mods.heat > 0 ? `Spun up ×${mods.heat}: fires ${Math.round((1 - mods.cooldownMult) * 100)}% faster` : 'Spin-up: fires faster with every shot in a row') : null;
    case 'hive':
      return attacks ? (mods.neighbours > 0 ? `Hive link ×${mods.neighbours}: fires ${Math.round((1 - mods.cooldownMult) * 100)}% faster` : 'Hive link: build towers within 1.5 tiles to fire faster') : null;
    case 'overcharge':
      return attacks ? (mods.alphaReady ? 'Overcharged: the next shot deals double' : 'Recharging: 2 s idle for an overcharged shot') : null;
    default:
      return null;
  }
}

/**
 * What the next tier (or a tier-3 branch) changes, as short tokens: "damage 7→10", "range 2.2→2.4",
 * "fires 10% faster", "+ bleeds 4/s". Compares the base stats of the two states, so the race passive
 * and support buffs (which apply to both alike) stay out of it.
 */
export function upgradeChanges(def: TowerDef, fromTier: 1 | 2 | 3, fromBranch: 'a' | 'b' | null, toTier: 1 | 2 | 3, toBranch: 'a' | 'b' | null): string[] {
  const a = towerStats(def, fromTier, fromBranch);
  const b = towerStats(def, toTier, toBranch);
  const out: string[] = [];
  const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  const attacks = def.attack === 'projectile' || def.attack === 'beam';
  if (attacks) {
    if (Math.round(b.damage) !== Math.round(a.damage)) out.push(`damage ${Math.round(a.damage)}→${Math.round(b.damage)}`);
    const dpsA = (a.damage * TICK_RATE) / a.cooldownTicks;
    const dpsB = (b.damage * TICK_RATE) / b.cooldownTicks;
    if (b.cooldownTicks !== a.cooldownTicks) out.push(`fires ${Math.round((1 - b.cooldownTicks / a.cooldownTicks) * 100)}% faster`);
    if (Math.round(dpsB) !== Math.round(dpsA)) out.push(`${Math.round(dpsA)}→${Math.round(dpsB)} dps`);
  }
  if (b.range.toFixed(1) !== a.range.toFixed(1)) out.push(`range ${num(a.range)}→${num(b.range)}`);
  if (def.attack === 'aura') {
    if (b.slow !== a.slow) out.push(`slow ${Math.round(a.slow * 100)}%→${Math.round(b.slow * 100)}%`);
    if (b.dotPerSecond.toFixed(1) !== a.dotPerSecond.toFixed(1)) out.push(`${num(a.dotPerSecond)}→${num(b.dotPerSecond)} ${b.dotType}/s`);
    if (b.stunTicksOnEntry > a.stunTicksOnEntry) out.push(`+ holds creeps ${num(b.stunTicksOnEntry / TICK_RATE)} s on entry`);
  }
  if (def.attack === 'economy' && b.income !== a.income) out.push(`income ${a.income}→${b.income} per wave`);
  if (def.attack === 'support' && a.buff && b.buff) {
    if (b.buff.damageMult !== a.buff.damageMult) out.push(`buff damage +${Math.round((a.buff.damageMult - 1) * 100)}%→+${Math.round((b.buff.damageMult - 1) * 100)}%`);
    if (b.buff.cooldownMult !== a.buff.cooldownMult) out.push(`buff rate ${Math.round((1 - a.buff.cooldownMult) * 100)}%→${Math.round((1 - b.buff.cooldownMult) * 100)}%`);
  }
  if (b.splash > a.splash) out.push(`splash ${num(a.splash)}→${num(b.splash)}`);
  if (b.multishot > a.multishot) out.push(`+ hits ${b.multishot} targets`);
  if (b.chain > a.chain) out.push(`+ chains ${b.chain}`);
  if (b.critChance > a.critChance) out.push(`+ ${Math.round(b.critChance * 100)}% crits ×2`);
  if (b.slowOnHit > a.slowOnHit) out.push(`+ hits slow ${Math.round(b.slowOnHit * 100)}%`);
  if (b.armorPierce && !a.armorPierce) out.push('+ pierces plating');
  if (b.bleedPerSecond > a.bleedPerSecond) out.push(`+ bleeds ${num(b.bleedPerSecond)}/s for ${num(b.bleedTicks / TICK_RATE)} s`);
  return out;
}

interface Props {
  tower: SelectedTower;
  resources: number;
  onUpgrade(branch?: 'a' | 'b'): void;
  onSell(): void;
  onClose(): void;
}

export function TowerPanel({ tower, resources, onUpgrade, onSell, onClose }: Props) {
  const { def, stats } = tower;
  const canAfford = tower.upgradeCost !== null && resources >= tower.upgradeCost;
  const dps = def.attack === 'aura' ? stats.dotPerSecond : (stats.damage * TICK_RATE) / stats.cooldownTicks;
  const attacks = def.attack === 'projectile' || def.attack === 'beam';
  const passiveNote = passiveLine(tower.passive, tower.mods, attacks);

  return (
    <footer className="bg-grove-900 px-3 pb-[calc(var(--safe-bottom)+0.5rem)] pl-[calc(var(--safe-left)+0.75rem)] pr-[calc(var(--safe-right)+0.75rem)] pt-2 text-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <TowerIcon tower={def} size={30} state={tower.tier === 3 ? (tower.branch === 'b' ? 't3b' : 't3a') : tower.tier === 2 ? 't2' : 't1'} />
            <span className="font-semibold">{tower.name}</span>
            <span className="text-grove-300/70">
              tier {tower.tier}
              {tower.branch && ` · ${def.branches[tower.branch].name}`}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-grove-300/80">
            <span>range {stats.range.toFixed(1)}</span>
            {def.attack === 'aura' && (
              <>
                <span>slow {Math.round(stats.slow * 100)}%</span>
                {stats.dotPerSecond > 0 && (
                  <span>
                    {stats.dotPerSecond.toFixed(1)} {stats.dotType}/s
                  </span>
                )}
                {stats.stunTicksOnEntry > 0 && <span>holds on entry</span>}
              </>
            )}
            {attacks && (
              <>
                <span>
                  {stats.damage.toFixed(0)} {def.damageType}
                  {stats.multishot > 1 && ` × ${stats.multishot}`}
                  {def.attack === 'beam' && ' beam'}
                </span>
                <span>{dps.toFixed(0)} dps</span>
                {stats.splash > 0 && <span>splash {stats.splash.toFixed(1)}</span>}
                {stats.chain > 0 && <span>chains +{stats.chain}</span>}
                {stats.critChance > 0 && <span>crit {Math.round(stats.critChance * 100)}%</span>}
                {stats.slowOnHit > 0 && <span>slows {Math.round(stats.slowOnHit * 100)}%</span>}
                {stats.armorPierce && <span>pierces plating</span>}
              </>
            )}
            {def.attack === 'economy' && <span className="text-sap">+{stats.income} sap per wave</span>}
            {def.attack === 'support' && stats.buff && (
              <>
                <span>+{Math.round((stats.buff.damageMult - 1) * 100)}% damage</span>
                <span>+{Math.round((stats.buff.rangeMult - 1) * 100)}% range</span>
                <span>{Math.round((1 - stats.buff.cooldownMult) * 100)}% faster</span>
              </>
            )}
            {(attacks || def.attack === 'aura') && (
              <>
                <span>kills {tower.kills}</span>
                <span>dealt {tower.damageDealt}</span>
              </>
            )}
          </div>
          {passiveNote && <p className="mt-0.5 truncate text-xs text-sap/90">{passiveNote}</p>}
          {tower.ownerName && <p className="mt-0.5 truncate text-xs text-amber-200/90">{tower.ownerName}'s tower — only they can upgrade or sell it</p>}
        </div>
        <button onClick={onClose} className="rounded-md px-2 py-1 text-grove-300 hover:bg-grove-800" aria-label="Close">
          ✕
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {tower.ownerName && <span className="self-center text-xs text-grove-300/70">Tap a pad to build your own next to it.</span>}
        {!tower.ownerName && tower.tier === 1 && tower.upgradeCost !== null && (
          <button onClick={() => onUpgrade()} disabled={!canAfford} className={`${upgradeClass(canAfford)} min-w-0 flex-1`}>
            <span className="block font-semibold">
              Upgrade to tier 2 · <span className="text-sap">{tower.upgradeCost}</span>
            </span>
            <span className="block truncate text-xs text-grove-300/80">{upgradeChanges(def, 1, null, 2, null).join(' · ') || 'Tougher growth'}</span>
          </button>
        )}
        {!tower.ownerName &&
          tower.tier === 2 &&
          tower.upgradeCost !== null &&
          (['a', 'b'] as const).map((b) => (
            <button key={b} onClick={() => onUpgrade(b)} disabled={!canAfford} className={`${upgradeClass(canAfford)} min-w-0 flex-1 basis-[45%]`} title={def.branches[b].description}>
              <span className="block font-semibold">
                {def.branches[b].name} · <span className="text-sap">{tower.upgradeCost}</span>
              </span>
              <span className="block text-xs text-grove-300/80">{def.branches[b].description}</span>
              <span className="block truncate text-[11px] text-sap/80">{upgradeChanges(def, 2, null, 3, b).join(' · ')}</span>
            </button>
          ))}
        {!tower.ownerName && tower.tier === 3 && <span className="self-center text-xs text-grove-300/70">Fully grown.</span>}
        {!tower.ownerName && (
          <button onClick={onSell} className="ml-auto rounded-lg border border-rust/60 px-3 py-2 text-rust hover:bg-grove-800" title="Refunds part of what you have put into this tower">
            Sell · +{tower.sellValue}
          </button>
        )}
      </div>
    </footer>
  );
}

const upgradeClass = (enabled: boolean) =>
  `rounded-lg border px-3 py-2 text-left ${enabled ? 'border-grove-500 bg-grove-800 hover:bg-grove-700' : 'border-grove-800 bg-grove-900 opacity-50'}`;
