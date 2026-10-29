// Extra Terram — src/ui/SendBar.tsx v0.5.0 — pick the rival a send goes to, the mini-boss as a send (from round 8), when it lands, the tally
// Replaces the shop while the Send tab is open. Each creep shows its cost and the income it pays
// the sender on every later wave. Sends land on the rival the player picks (or one drawn when
// none is picked); a mini-boss can be sent one at a time from round 8, at that round's strength.
import { useState } from 'react';
import { BOSS_SEND_FROM_ROUND, sendAllowed, sendCost, sendIncomeFor, type CreepDef } from '../engine';
import { creepUrl } from '../render/sprites';
import { Price } from './UiIcon';
import { useSpriteIndex } from './useSpriteIndex';

export interface SendRival {
  /** What the engine or the channel needs to route the send: a versus side index, or a Mirror seat. */
  id: number;
  name: string;
  /** Versus: lives left; Mirror: lives left on their board. */
  lives?: number;
}

interface Props {
  creeps: CreepDef[];
  /** The player's currency, lower case. */
  currency: string;
  resources: number;
  /** Income per wave already earned by sending. */
  income: number;
  /** Rivals still playing; empty when nobody can receive. */
  rivals: SendRival[];
  /** 1-based round now (0 before the first): mini-boss sends open from BOSS_SEND_FROM_ROUND. */
  wave: number;
  /** Whether a wave is running (sends join it now) or the build window is open (sends lead the next wave). */
  inWave: boolean;
  /** Totals so far: creeps sent to rivals, creeps received from them. */
  sent: number;
  received: number;
  onSend(creepId: string, count: number, target: number | null): void;
}

const ARCH_LABEL: Record<string, string> = { rusher: 'fast', workhorse: 'steady', tank: 'tough', boss: 'mini-boss' };

export function SendBar({ creeps, currency, resources, income, rivals, wave, inWave, sent, received, onSend }: Props) {
  const [count, setCount] = useState(1);
  const [target, setTarget] = useState<number | null>(null); // null: the board (or chance) picks
  const noone = rivals.length === 0;
  const chosen = target !== null && rivals.some((r) => r.id === target) ? target : null;
  const toName = chosen !== null ? rivals.find((r) => r.id === chosen)!.name : rivals.length === 1 ? rivals[0].name : 'a random rival';
  return (
    <footer className="bg-grove-900 pb-[calc(var(--safe-bottom)+0.5rem)] pt-1.5">
      {rivals.length > 1 && (
        <div className="mb-1 flex items-center gap-1 overflow-x-auto px-3 text-xs [scrollbar-width:none]" role="radiogroup" aria-label="Send to">
          <span className="shrink-0 text-grove-300/70">To:</span>
          <button role="radio" aria-checked={chosen === null} onClick={() => setTarget(null)} className={`shrink-0 rounded-md border px-2 py-0.5 ${chosen === null ? 'border-grove-300 bg-grove-700 text-white' : 'border-grove-700 text-grove-300 hover:bg-grove-800'}`}>
            Anyone
          </button>
          {rivals.map((r) => (
            <button key={r.id} role="radio" aria-checked={chosen === r.id} onClick={() => setTarget(r.id)} className={`flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 ${chosen === r.id ? 'border-grove-300 bg-grove-700 text-white' : 'border-grove-700 text-grove-300 hover:bg-grove-800'}`} title={r.lives !== undefined ? `${r.name}: ${r.lives} lives` : r.name}>
              <span className="max-w-[7rem] truncate">{r.name}</span>
              {r.lives !== undefined && <span className="text-[10px] text-grove-300/70">{r.lives}♥</span>}
            </button>
          ))}
        </div>
      )}
      <div className="flex snap-x gap-2 overflow-x-auto px-[calc(var(--safe-left)+0.75rem)] pr-[calc(var(--safe-right)+0.75rem)] [scrollbar-width:none]">
        {creeps.map((c) => {
          const boss = c.archetype === 'boss';
          const n = boss ? 1 : count;
          const cost = sendCost(c) * n;
          const allowed = sendAllowed(c, wave - 1, n);
          const affordable = resources >= cost && !noone && allowed.ok;
          const title = boss
            ? allowed.ok
              ? `${c.name}: a mini-boss at this round's strength, ${c.leakCost} of their lives if it gets through, a big bounty for them if it falls. Costs ${cost}, pays +${sendIncomeFor(c)} ${currency} every wave after.`
              : `${c.name}: from round ${BOSS_SEND_FROM_ROUND}, one at a time.`
            : `${c.name}: ${c.hp} hp, ${c.armor}. Costs ${cost}, pays +${sendIncomeFor(c) * n} ${currency} every wave after.`;
          return (
            <button
              key={c.id}
              onClick={() => onSend(c.id, n, chosen)}
              disabled={!affordable}
              className={`flex w-[88px] shrink-0 snap-start flex-col items-center rounded-lg border px-1 py-2 text-center ${affordable ? (boss ? 'border-sap/70 bg-grove-800 hover:bg-grove-700' : 'border-grove-700 bg-grove-800 hover:bg-grove-700') : 'border-grove-800 bg-grove-900 opacity-50'}`}
              title={title}
            >
              <CreepIcon creep={c} size={44} />
              <span className="mt-1 w-full truncate text-xs font-semibold">{c.name}</span>
              <span className="whitespace-nowrap text-[11px] text-grove-300/80">
                {boss && !allowed.ok ? `round ${BOSS_SEND_FROM_ROUND}+` : <>{ARCH_LABEL[c.archetype] ?? c.archetype} · <Price amount={cost} currency={currency} size={12} className="text-sap" /></>}
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
        {noone
          ? 'No rival can receive a send right now.'
          : `Sends hit ${toName} and ${inWave ? 'join the wave now' : 'lead the next wave'} · income +${income} ${currency} a wave · sent ${sent}, received ${received}`}
      </p>
    </footer>
  );
}

export function CreepIcon({ creep, size = 32 }: { creep: CreepDef; size?: number }) {
  const index = useSpriteIndex();
  const [missing, setMissing] = useState(false);
  if (missing || (index !== null && !index.has(`${creep.race}/creeps/${creep.id}.png`))) {
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
