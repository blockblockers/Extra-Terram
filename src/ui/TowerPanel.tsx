// Extra Terram — src/ui/TowerPanel.tsx v0.4.0 — stats for every attack kind
// Replaces the build bar while a tower is selected: stats, the next upgrade (a branch choice at tier 2), sell.
import { TICK_RATE, type TowerDef, type TowerStats } from '../engine';
import { TowerIcon } from './TowerIcon';

export interface SelectedTower {
  id: number;
  name: string;
  def: TowerDef;
  tier: 1 | 2 | 3;
  branch: 'a' | 'b' | null;
  stats: TowerStats;
  kills: number;
  damageDealt: number;
  upgradeCost: number | null;
  sellValue: number;
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
        </div>
        <button onClick={onClose} className="rounded-md px-2 py-1 text-grove-300 hover:bg-grove-800" aria-label="Close">
          ✕
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {tower.tier === 1 && tower.upgradeCost !== null && (
          <button onClick={() => onUpgrade()} disabled={!canAfford} className={upgradeClass(canAfford)}>
            Upgrade to tier 2 · <span className="text-sap">{tower.upgradeCost}</span>
          </button>
        )}
        {tower.tier === 2 &&
          tower.upgradeCost !== null &&
          (['a', 'b'] as const).map((b) => (
            <button key={b} onClick={() => onUpgrade(b)} disabled={!canAfford} className={upgradeClass(canAfford)} title={def.branches[b].description}>
              <span className="block font-semibold">{def.branches[b].name}</span>
              <span className="block text-xs text-grove-300/80">
                {def.branches[b].description} · <span className="text-sap">{tower.upgradeCost}</span>
              </span>
            </button>
          ))}
        {tower.tier === 3 && <span className="self-center text-xs text-grove-300/70">Fully grown.</span>}
        <button onClick={onSell} className="ml-auto rounded-lg border border-rust/60 px-3 py-2 text-rust hover:bg-grove-800" title="Refunds 70% of what you have put into this tower">
          Sell · +{tower.sellValue}
        </button>
      </div>
    </footer>
  );
}

const upgradeClass = (enabled: boolean) =>
  `rounded-lg border px-3 py-2 text-left ${enabled ? 'border-grove-500 bg-grove-800 hover:bg-grove-700' : 'border-grove-800 bg-grove-900 opacity-50'}`;
