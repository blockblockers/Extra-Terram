// Extra Terram — src/ui/Overlays.tsx v0.1.0 — Phase 1 scaffold
// Inline overlays over the board. Never window.confirm/alert: iOS standalone PWAs block them silently.
import type { SimView } from '../engine';

export function PauseOverlay({ onResume, onExit }: { onResume(): void; onExit(): void }) {
  return (
    <Scrim>
      <h2 className="text-2xl font-bold">Paused</h2>
      <p className="text-sm text-grove-300/80">The grove holds its breath.</p>
      <div className="mt-4 flex gap-2">
        <button onClick={onResume} className="rounded-lg bg-grove-500 px-4 py-2 font-semibold text-grove-950 hover:bg-grove-300">
          Resume
        </button>
        <button onClick={onExit} className="rounded-lg border border-grove-700 px-4 py-2 text-grove-300 hover:bg-grove-800">
          Menu
        </button>
      </div>
    </Scrim>
  );
}

export function ResultOverlay({ view, onReplay, onNewSeed, onExit }: { view: SimView; onReplay(): void; onNewSeed(): void; onExit(): void }) {
  const r = view.result;
  if (!r) return null;
  const won = r.outcome === 'won';
  return (
    <Scrim>
      <h2 className="text-2xl font-bold">{won ? 'The grove stands' : 'The grove falls'}</h2>
      {won ? (
        <p className="text-lg tracking-widest text-sap" aria-label={`${r.stars} stars`}>
          {'★'.repeat(r.stars)}
          <span className="text-grove-300/30">{'★'.repeat(3 - r.stars)}</span>
        </p>
      ) : (
        <p className="text-sm text-grove-300/80">
          Reached wave {view.wave} of {view.waves}.
        </p>
      )}
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <dt className="text-grove-300/70">Score</dt>
        <dd className="text-right font-semibold tabular-nums">{r.score}</dd>
        <dt className="text-grove-300/70">Lives left</dt>
        <dd className="text-right tabular-nums">{view.lives}</dd>
        <dt className="text-grove-300/70">Kills / leaks</dt>
        <dd className="text-right tabular-nums">
          {view.stats.kills} / {view.stats.leaks}
        </dd>
        <dt className="text-grove-300/70">Time</dt>
        <dd className="text-right tabular-nums">{Math.round(r.ticks / 20)}s</dd>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={onReplay} className="rounded-lg bg-grove-500 px-4 py-2 font-semibold text-grove-950 hover:bg-grove-300">
          Play again
        </button>
        <button onClick={onNewSeed} className="rounded-lg border border-grove-700 px-4 py-2 text-grove-300 hover:bg-grove-800">
          New seed
        </button>
        <button onClick={onExit} className="rounded-lg border border-grove-700 px-4 py-2 text-grove-300 hover:bg-grove-800">
          Menu
        </button>
      </div>
    </Scrim>
  );
}

function Scrim({ children }: { children: React.ReactNode }) {
  // Modal rule from the brief: overlay padding plus maxHeight 100%, so it never fights the safe areas.
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-full w-full max-w-sm overflow-auto rounded-xl border border-grove-700 bg-grove-900 p-5 shadow-xl">{children}</div>
    </div>
  );
}
