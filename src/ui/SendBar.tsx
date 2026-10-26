// Extra Terram — src/ui/SendBar.tsx v0.1.0 — Mirror mode: pay sap to drop your race's creeps into a rival's lane
// Replaces the shop while the Send tab is open. Each creep shows its cost and the income it pays
// the sender on every later wave. Sends land on one rival at random (the only rival, in a duel).
import { useState } from 'react';
import { sendCost, sendIncomeFor, type CreepDef } from '../engine';
import { creepUrl } from '../render/sprites';

interface Props {
  creeps: CreepDef[];
  resources: number;
  /** Income per wave already earned by sending. */
  income: number;
  /** Names of rivals still playing; empty when nobody can receive. */
  rivals: string[];
  onSend(creepId: string, count: number): void;
}

const ARCH_LABEL: Record<string, string> = { rusher: 'fast', workhorse: 'steady', tank: 'tough' };

export function SendBar({ creeps, resources, income, rivals, onSend }: Props) {
  const [count, setCount] = useState(1);
  const noone = rivals.length === 0;
  return (
    <footer className="bg-grove-900 pb-[calc(var(--safe-bottom)+0.5rem)] pt-2">
      <div className="flex snap-x gap-2 overflow-x-auto px-[calc(var(--safe-left)+0.75rem)] pr-[calc(var(--safe-right)+0.75rem)] [scrollbar-width:none]">
        {creeps.map((c) => {
          const cost = sendCost(c) * count;
          const affordable = resources >= cost && !noone;
          return (
            <button
              key={c.id}
              onClick={() => onSend(c.id, count)}
              disabled={!affordable}
              className={`flex w-[88px] shrink-0 snap-start flex-col items-center rounded-lg border px-1 py-2 text-center ${affordable ? 'border-grove-700 bg-grove-800 hover:bg-grove-700' : 'border-grove-800 bg-grove-900 opacity-50'}`}
              title={`${c.name}: ${c.hp} hp, ${c.armor}. Costs ${cost}, pays +${sendIncomeFor(c) * count} sap every wave after.`}
            >
              <CreepIcon creep={c} size={44} />
              <span className="mt-1 w-full truncate text-xs font-semibold">{c.name}</span>
              <span className="text-[11px] text-grove-300/80">
                {ARCH_LABEL[c.archetype] ?? c.archetype} · <span className="text-sap">{cost}</span>
              </span>
            </button>
          );
        })}
        <div className="flex shrink-0 flex-col justify-center gap-1 pl-1" role="group" aria-label="How many">
          {[1, 3, 5].map((n) => (
            <button key={n} onClick={() => setCount(n)} className={`rounded-md border px-2 py-0.5 text-xs ${count === n ? 'border-grove-300 bg-grove-700 text-white' : 'border-grove-700 text-grove-300 hover:bg-grove-800'}`}>
              ×{n}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1.5 truncate px-3 text-xs text-grove-300/60">
        {noone ? 'No rival can receive a send right now.' : `Sends hit ${rivals.length === 1 ? rivals[0] : 'a random rival'} · your send income +${income} sap a wave`}
      </p>
    </footer>
  );
}

export function CreepIcon({ creep, size = 32 }: { creep: CreepDef; size?: number }) {
  const [missing, setMissing] = useState(false);
  if (missing) {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
        <ellipse cx="16" cy="18" rx="11" ry="8" fill={creep.color} />
        <circle cx="12" cy="16" r="2" fill="#0b1a12" />
        <circle cx="20" cy="16" r="2" fill="#0b1a12" />
      </svg>
    );
  }
  return <img src={creepUrl(creep.race, creep.id)} alt="" width={size} height={size} draggable={false} onError={() => setMissing(true)} className="shrink-0 object-contain" style={{ width: size, height: size }} />;
}
