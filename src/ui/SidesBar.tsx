// Extra Terram — src/ui/SidesBar.tsx v0.3.0 — versus boards: a strip under the HUD with every player (or team), their colour, race emblem, lives and score
// A strip rather than an overlay: on the tall boards (four lanes, four bases) an overlay hid the pads
// in the top corner. One chip per side, sharing the width, so four sides fit a phone in one row.
import type { VersusView } from '../engine';
import type { SeatPresence } from '../net';
import { seatColor, sideColorIndex } from '../render/seats';
import { Lives, UiIcon, emblemIcon } from './UiIcon';

interface Props {
  versus: VersusView;
  players: SeatPresence[];
  mySeat: number;
}

/** "Ada", or "Ada & Bo" for a 2 v 2 team. */
export function sideName(players: SeatPresence[], seats: number[]): string {
  return seats.map((s) => players.find((p) => p.seat === s)?.name ?? `Seat ${s + 1}`).join(' & ');
}

/** 980, 1.2k, 12k: scores in a chip a quarter of a phone wide. */
function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(Math.floor(n / 100) / 10).toFixed(1)}k`;
  return `${Math.floor(n / 1000)}k`;
}

export function SidesBar({ versus, players, mySeat }: Props) {
  return (
    <ol className="flex shrink-0 gap-1 bg-grove-900 px-2 pb-1.5 pl-[calc(var(--safe-left)+0.5rem)] pr-[calc(var(--safe-right)+0.5rem)] text-[11px] leading-tight" aria-label="Players">
      {versus.sides.map((sd, i) => {
        const mine = sd.seats.includes(mySeat);
        const color = seatColor(sideColorIndex(versus.teams, i, sd.seats[0] ?? i));
        // our own chip says "You" (or "You & Bo"), so it reads at a glance however short the chip is
        const name = sd.seats.map((s) => (s === mySeat ? 'You' : sideName(players, [s]))).join(' & ');
        const raceId = players.find((p) => p.seat === sd.seats[0])?.raceId;
        return (
          <li
            key={i}
            className={`flex min-w-0 flex-1 flex-col gap-0.5 rounded-md border px-1.5 py-1 ${sd.out ? 'border-transparent bg-black/30 text-grove-300/50' : mine ? 'border-grove-500/70 bg-grove-700/70 text-white' : 'border-grove-800 bg-grove-950/70 text-grove-300'}`}
            title={`${sideName(players, sd.seats)}: ${sd.out ? `out in round ${sd.outWave + 1}` : `${sd.lives} lives`}, ${sd.score.toLocaleString()} points`}
          >
            <span className="flex min-w-0 items-center gap-1">
              <span className="h-2 w-2 shrink-0 rounded-full border border-black/40" style={{ background: color }} />
              {raceId && <UiIcon name={emblemIcon(raceId)} size={12} />}
              <span className={`truncate font-semibold ${sd.out ? 'line-through decoration-grove-300/40' : ''}`}>{name}</span>
            </span>
            <span className="flex items-center justify-between gap-1 tabular-nums">
              {sd.out ? <span>out · r{sd.outWave + 1}</span> : <Lives count={sd.lives} size={11} className="text-red-200" />}
              <span className={sd.out ? '' : 'text-sap'}>{compact(sd.score)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
