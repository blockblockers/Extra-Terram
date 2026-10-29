// Extra Terram — src/ui/TeamBar.tsx v0.3.0 — Co-op: everyone on the shared board, their colour, race emblem, money (in their race's currency) and towers
import { currencyOf, raceById } from '../content';
import type { SeatPresence } from '../net';
import { seatColor } from '../render/seats';
import { Money, UiIcon, emblemIcon } from './UiIcon';

interface Props {
  players: SeatPresence[];
  wallets: number[];
  towersBySeat: Record<number, number>;
  mySeat: number;
  /** Set while this client waits on the host (shared boards only). */
  waiting: boolean;
}

export function TeamBar({ players, wallets, towersBySeat, mySeat, waiting }: Props) {
  return (
    <div className="pointer-events-none absolute left-2 top-2 flex max-w-[70%] flex-col gap-1 text-[11px]" aria-label="Team">
      {players.map((p) => {
        const race = raceById(p.raceId);
        const me = p.seat === mySeat;
        return (
          <div key={p.userId} className={`flex items-center gap-1.5 rounded-md px-2 py-1 backdrop-blur-sm ${me ? 'bg-grove-700/80 text-white' : 'bg-black/55 text-grove-300'}`}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/40" style={{ background: seatColor(p.seat) }} />
            <span className="max-w-[7rem] truncate font-semibold">{p.name}</span>
            <UiIcon name={emblemIcon(p.raceId)} size={14} alt={race.name} fallback={<span className="truncate text-grove-300/70">{race.name}</span>} />
            <Money amount={wallets[p.seat] ?? 0} currency={currencyOf(p.raceId)} size={12} className="tabular-nums text-sap" />
            <span className="tabular-nums text-grove-300/80">{towersBySeat[p.seat] ?? 0}⌂</span>
            {p.seat === 0 && <span className="text-grove-300/60">host</span>}
          </div>
        );
      })}
      {waiting && <div className="rounded-md bg-black/60 px-2 py-1 text-amber-200 backdrop-blur-sm">Waiting for the host…</div>}
    </div>
  );
}
