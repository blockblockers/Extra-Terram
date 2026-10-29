// Extra Terram — src/ui/WavePreviewBar.tsx v0.1.0 — what the next wave brings, over the board during the build window
// One strip: the creeps of the next wave with their counts (icons from the sprite index), rivals' sends that
// will lead it, and the mini-boss. Hidden while a wave runs. Static styling only.
import { content } from '../content';
import type { WavePreview } from '../engine';
import { CreepIcon } from './SendBar';

interface Props {
  preview: WavePreview;
  /** Rows of player bars already stacked at the top left of the board; the strip sits below them. */
  offsetRows?: number;
}

export function WavePreviewBar({ preview, offsetRows = 0 }: Props) {
  const creep = (id: string) => content.creeps.find((c) => c.id === id);
  const boss = preview.boss ? creep(preview.boss) : undefined;
  return (
    <div className="pointer-events-none absolute left-2 right-2 flex items-center gap-1.5 overflow-hidden rounded-md bg-black/55 px-2 py-1 text-xs text-grove-100 backdrop-blur-sm" style={{ top: 8 + offsetRows * 29 }} role="status" aria-label={`Next wave: ${preview.name}`}>
      <span className="shrink-0 font-semibold text-grove-300/90">Next{preview.perLane ? ' (per lane)' : ''}:</span>
      {preview.groups.map((g) => {
        const def = creep(g.creep);
        return (
          <span key={g.creep} className="flex shrink-0 items-center gap-0.5" title={def ? `${g.count} × ${def.name} (${def.hp} hp, ${def.armor})` : g.creep}>
            {def && <CreepIcon creep={def} size={22} />}
            <span className="font-semibold tabular-nums">×{g.count}</span>
          </span>
        );
      })}
      {preview.sent.map((g) => {
        const def = creep(g.creep);
        return (
          <span key={`sent-${g.creep}`} className="flex shrink-0 items-center gap-0.5 rounded bg-amber-400/20 px-1 text-amber-200" title={def ? `${g.count} × ${def.name}, sent by a rival` : g.creep}>
            {def && <CreepIcon creep={def} size={22} />}
            <span className="font-semibold tabular-nums">×{g.count}</span>
            <span className="text-[10px] uppercase">sent</span>
          </span>
        );
      })}
      {boss && (
        <span className="flex shrink-0 items-center gap-0.5 rounded border border-sap/60 bg-sap/20 px-1 text-sap" title={`Mini-boss: ${boss.name}, ${boss.leakCost} lives if it gets through`}>
          <CreepIcon creep={boss} size={22} />
          <span className="text-[10px] font-bold uppercase tracking-wide">boss</span>
        </span>
      )}
      <span className="ml-auto hidden truncate text-grove-300/70 sm:inline">{preview.name}</span>
    </div>
  );
}
