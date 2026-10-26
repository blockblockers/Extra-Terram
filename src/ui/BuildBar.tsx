// Extra Terram — src/ui/BuildBar.tsx v0.6.0 — the shell writes the hint line (confirm step, pad-first building)
// Bottom shop bar. Inset by the bottom safe area. Tap a tower, then tap a build pad on the board.
import type { TowerDef } from '../engine';
import { TowerIcon } from './TowerIcon';

interface Props {
  towers: TowerDef[];
  /** Cost per tower id after the race passive (towerCost). */
  costs: Record<string, number>;
  resources: number;
  placing: string | null;
  /** The one-line hint under the shop; the shell knows the current step. */
  hint?: string;
  onPick(towerId: string | null): void;
}

const ROLE_LABEL: Record<string, string> = {
  starter: 'starter',
  heavy: 'heavy',
  control: 'slow',
  splash: 'splash',
  range: 'sniper',
  economy: 'income',
  support: 'buff',
  trap: 'trap',
};

export function BuildBar({ towers, costs, resources, placing, hint, onPick }: Props) {
  return (
    <footer className="bg-grove-900 pb-[calc(var(--safe-bottom)+0.5rem)] pt-2">
      <div className="flex snap-x gap-2 overflow-x-auto px-[calc(var(--safe-left)+0.75rem)] pr-[calc(var(--safe-right)+0.75rem)] [scrollbar-width:none]">
        {towers.map((t, i) => {
          const cost = costs[t.id] ?? t.cost;
          const affordable = resources >= cost;
          const active = placing === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onPick(t.id)}
              disabled={!affordable && !active}
              className={`flex w-[88px] shrink-0 snap-start flex-col items-center rounded-lg border px-1 py-2 text-center ${
                active ? 'border-grove-300 bg-grove-700' : affordable ? 'border-grove-700 bg-grove-800 hover:bg-grove-700' : 'border-grove-800 bg-grove-900 opacity-50'
              }`}
              title={`${t.description} (key ${i + 1})`}
            >
              <TowerIcon tower={t} size={44} />
              <span className="mt-1 w-full truncate text-xs font-semibold">{t.name}</span>
              <span className="text-[11px] text-grove-300/80">
                {ROLE_LABEL[t.role] ?? t.role} · <span className="text-sap">{cost}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 truncate px-3 text-xs text-grove-300/60">{hint ?? (placing ? 'Tap a build pad to plant. Tap the tower again to cancel.' : 'Pick a tower, then tap a build pad. Swipe for more. Tap a planted tower to upgrade or sell it.')}</p>
    </footer>
  );
}
