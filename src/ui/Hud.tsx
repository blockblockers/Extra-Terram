// Extra Terram — src/ui/Hud.tsx v0.4.0 — the money label is the race's currency (Sap, Scrap, Resin, Lumen)
// Top bar. Inset by the top safe area; static styling only (no animations: the canvas is the only moving surface).
// Both rows are always rendered at the same height, whichever phase the sim is in, so the canvas
// host below keeps its size and the board never jumps when a wave starts or ends.
import { TICK_RATE, type SimView } from '../engine';

interface Props {
  view: SimView | null;
  /** The player's race currency, capitalised: "Scrap". */
  currency: string;
  speed: number;
  paused: boolean;
  /** False for a client on a shared board: the host sets the pace, so the controls only show it. */
  canControl?: boolean;
  onSpeed(n: number): void;
  onPause(): void;
  onCallWave(): void;
  onExit(): void;
}

export function Hud({ view, currency, speed, paused, canControl = true, onSpeed, onPause, onCallWave, onExit }: Props) {
  const seconds = view ? Math.ceil(view.buildTimer / TICK_RATE) : 0;
  const inBuild = view?.phase === 'build';
  const waveLabel = view ? (view.wave === 0 ? 'Get ready' : inBuild ? `Wave ${view.wave}/${view.waves} cleared` : `Wave ${view.wave}/${view.waves}`) : '';

  return (
    <header className="bg-grove-900 px-3 pb-2 pt-[calc(var(--safe-top)+0.5rem)] pl-[calc(var(--safe-left)+0.75rem)] pr-[calc(var(--safe-right)+0.75rem)] text-sm">
      <div className="flex h-8 items-center gap-x-3">
        <button onClick={onExit} className="rounded-md px-2 py-1 text-grove-300 hover:bg-grove-800" aria-label="Back to menu">
          ←<span className="ml-1 hidden sm:inline">Menu</span>
        </button>
        <Stat label="Lives" value={view ? String(view.lives) : '–'} tone={view && view.lives <= 5 ? 'warn' : 'ok'} />
        <Stat label={currency} value={view ? String(view.resources) : '–'} tone="sap" />
        <div className="min-w-0 flex-1 truncate text-right">
          <span className="font-semibold">{waveLabel}</span>
          {view?.waveName && view.wave > 0 && <span className="ml-2 hidden text-grove-300/80 sm:inline">{view.waveName}</span>}
        </div>
      </div>
      <div className="mt-1 flex h-8 items-center gap-x-2">
        <button
          onClick={onCallWave}
          disabled={!inBuild}
          className={`min-w-0 flex-1 truncate rounded-md px-3 py-1 text-left font-semibold ${inBuild ? 'bg-grove-500 text-grove-950 hover:bg-grove-300' : 'bg-grove-800 text-grove-300/70'}`}
          title={inBuild ? `Start the next wave now and bank one ${currency.toLowerCase()} per second left` : 'A wave is running'}
        >
          {inBuild ? `Next wave in ${seconds}s · call it (+${seconds})` : view?.waveName ? `${view.waveName} incoming` : 'Wave running'}
        </button>
        <div className="flex overflow-hidden rounded-md border border-grove-700" role="group" aria-label="Game speed">
          {[1, 2, 3].map((n) => (
            <button key={n} onClick={() => onSpeed(n)} disabled={!canControl} className={`px-2 py-1 disabled:cursor-default ${speed === n ? 'bg-grove-700 text-white' : 'text-grove-300 hover:bg-grove-800 disabled:opacity-40'}`} title={canControl ? undefined : 'The host sets the speed'}>
              {n}×
            </button>
          ))}
        </div>
        {canControl ? (
          <button onClick={onPause} className="rounded-md border border-grove-700 px-2 py-1 text-grove-300 hover:bg-grove-800" aria-pressed={paused}>
            {paused ? 'Resume' : 'Pause'}
          </button>
        ) : (
          <span className="rounded-md border border-grove-800 px-2 py-1 text-xs text-grove-300/60" title="Only the host can pause a shared board">
            Host paces
          </span>
        )}
      </div>
    </header>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'sap' }) {
  const color = tone === 'warn' ? 'text-red-300' : tone === 'sap' ? 'text-sap' : 'text-grove-300';
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-xs uppercase tracking-wide text-grove-300/60">{label}</span>
      <span className={`text-base font-bold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}
