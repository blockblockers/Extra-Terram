// Extra Terram — src/ui/BuildBar.tsx v0.3.0 — tower sprite icons
// Bottom shop bar. Inset by the bottom safe area. Tap a tower, then tap a build pad on the board.
import type { TowerDef } from '../engine';
import { TowerIcon } from './TowerIcon';

interface Props {
  towers: TowerDef[];
  resources: number;
  placing: string | null;
  onPick(towerId: string | null): void;
}

export function BuildBar({ towers, resources, placing, onPick }: Props) {
  return (
    <footer className="bg-grove-900 px-3 pb-[calc(var(--safe-bottom)+0.5rem)] pl-[calc(var(--safe-left)+0.75rem)] pr-[calc(var(--safe-right)+0.75rem)] pt-2">
      <div className="flex gap-2">
        {towers.map((t, i) => {
          const affordable = resources >= t.cost;
          const active = placing === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onPick(t.id)}
              disabled={!affordable && !active}
              className={`flex min-w-0 flex-1 flex-col items-center rounded-lg border px-2 py-2 text-center ${
                active ? 'border-grove-300 bg-grove-700' : affordable ? 'border-grove-700 bg-grove-800 hover:bg-grove-700' : 'border-grove-800 bg-grove-900 opacity-50'
              }`}
              title={`${t.description} (key ${i + 1})`}
            >
              <TowerIcon tower={t} size={46} />
              <span className="mt-1 w-full truncate text-xs font-semibold">{t.name}</span>
              <span className="text-[11px] text-grove-300/80">
                {t.role} · <span className="text-sap">{t.cost}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 truncate text-xs text-grove-300/60">{placing ? 'Tap a build pad to plant. Tap the tower again to cancel.' : 'Pick a tower, then tap a build pad. Tap a planted tower to upgrade or sell it.'}</p>
    </footer>
  );
}
