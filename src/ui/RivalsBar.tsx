// Extra Terram — src/ui/RivalsBar.tsx v0.2.0 — live standings over the board during a parallel race; race emblems and the lives icon
import { raceById } from '../content';
import type { Standing } from '../net';
import { Lives, UiIcon, emblemIcon } from './UiIcon';

export function RivalsBar({ standings }: { standings: Standing[] }) {
  if (standings.length === 0) return null;
  return (
    <ol className="pointer-events-none absolute left-2 top-2 flex max-w-[60%] flex-col gap-1 text-[11px]" aria-label="Standings">
      {standings.map((s, i) => {
        const race = raceById(s.raceId);
        return (
          <li key={s.userId} className={`flex items-center gap-1.5 rounded-md px-2 py-1 backdrop-blur-sm ${s.me ? 'bg-grove-700/80 text-white' : 'bg-black/55 text-grove-300'}`}>
            <span className="w-3 tabular-nums text-grove-300/70">{i + 1}</span>
            <UiIcon name={emblemIcon(s.raceId)} size={14} alt={race.name} fallback={<span className="h-2 w-2 shrink-0 rounded-full" style={{ background: race.palette.primary }} />} />
            <span className="max-w-[7rem] truncate font-semibold">{s.name}</span>
            <span className="tabular-nums text-grove-300/80">w{s.wave}</span>
            <Lives count={s.lives} className="tabular-nums text-grove-300/80" />
            <span className="tabular-nums">{s.score}</span>
            {s.finished && <span className={s.result === 'won' ? 'text-grove-300' : 'text-rust'}>{s.result === 'won' ? '✓' : '✗'}</span>}
          </li>
        );
      })}
    </ol>
  );
}
