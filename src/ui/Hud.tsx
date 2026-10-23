// Extra Terram — src/ui/Hud.tsx v0.1.0 — Phase 1 scaffold
// Top bar. Inset by the top safe area; static styling only (no animations: the canvas is the only moving surface).
import { TICK_RATE, type SimView } from '../engine';

interface Props {
  view: SimView | null;
  speed: number;
  paused: boolean;
  onSpeed(n: number): void;
  onPause(): void;
  onCallWave(): void;
  onExit(): void;
}

export function Hud({ view, speed, paused, onSpeed, onPause, onCallWave, onExit }: Props) {
  const seconds = view ? Math.ceil(view.buildTimer / TICK_RATE) : 0;
  const inBuild = view?.phase === 'build';
  const waveLabel = view ? (view.wave === 0 ? 'Get ready' : inBuild ? `Wave ${view.wave}/${view.waves} cleared` : `Wave ${view.wave}/${view.waves}`) : '';

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-grove-900 px-3 pb-2 pt-[calc(var(--safe-top)+0.5rem)] pl-[calc(var(--safe-left)+0.75rem)] pr-[calc(var(--safe-right)+0.75rem)] text-sm">
      <button onClick={onExit} className="rounded-md px-2 py-1 text-grove-300 hover:bg-grove-800" aria-label="Back to menu">
        ←<span className="ml-1 hidden sm:inline">Menu</span>
      </button>
      <Stat label="Lives" value={view ? String(view.lives) : '–'} tone={view && view.lives <= 5 ? 'warn' : 'ok'} />
      <Stat label="Sap" value={view ? String(view.resources) : '–'} tone="sap" />
      <div className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{waveLabel}</span>
        {view?.waveName && view.wave > 0 && <span className="ml-2 text-grove-300/80">{view.waveName}</span>}
      </div>
      {inBuild && (
        <button onClick={onCallWave} className="rounded-md bg-grove-500 px-3 py-1 font-semibold text-grove-950 hover:bg-grove-300" title="Start the next wave now and bank the remaining seconds as sap">
          Next wave in {seconds}s · call it (+{seconds})
        </button>
      )}
      <div className="flex overflow-hidden rounded-md border border-grove-700" role="group" aria-label="Game speed">
        {[1, 2, 3].map((n) => (
          <button key={n} onClick={() => onSpeed(n)} className={`px-2 py-1 ${speed === n ? 'bg-grove-700 text-white' : 'text-grove-300 hover:bg-grove-800'}`}>
            {n}×
          </button>
        ))}
      </div>
      <button onClick={onPause} className="rounded-md border border-grove-700 px-2 py-1 text-grove-300 hover:bg-grove-800" aria-pressed={paused}>
        {paused ? 'Resume' : 'Pause'}
      </button>
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
