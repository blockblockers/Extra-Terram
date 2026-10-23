// Extra Terram — src/ui/BuildBar.tsx v0.1.0 — Phase 1 scaffold
// Bottom shop bar. Inset by the bottom safe area. Tap a tower, then tap a build pad on the board.
import type { TowerDef } from '../engine';

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
              className={`flex min-w-0 flex-1 flex-col items-start rounded-lg border px-3 py-2 text-left ${
                active ? 'border-grove-300 bg-grove-700' : affordable ? 'border-grove-700 bg-grove-800 hover:bg-grove-700' : 'border-grove-800 bg-grove-900 opacity-50'
              }`}
              title={`${t.description} (key ${i + 1})`}
            >
              <span className="flex w-full items-center gap-2">
                <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="truncate font-semibold">{t.name}</span>
              </span>
              <span className="text-xs text-grove-300/80">
                {t.role} · <span className="text-sap">{t.cost} sap</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 truncate text-xs text-grove-300/60">{placing ? 'Tap a build pad to plant. Tap the tower again to cancel.' : 'Pick a tower, then tap a build pad. Tap a planted tower to upgrade or sell it.'}</p>
    </footer>
  );
}
