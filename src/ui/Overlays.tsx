// Extra Terram — src/ui/Overlays.tsx v0.7.0 — race standings on the result screen
// Inline overlays over the board. Never window.confirm/alert: iOS standalone PWAs block them silently.
import { useState } from 'react';
import type { SaveStatus } from '../app/App';
import { raceById } from '../content';
import type { SimView } from '../engine';
import { online, type Standing } from '../net';

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

interface ResultProps {
  view: SimView;
  seed: string;
  saveStatus: SaveStatus;
  signedIn: boolean;
  /** Ranked standings during a parallel race; null for a solo run. */
  standings: Standing[] | null;
  onReplay(): void;
  onNewSeed(): void;
  onExit(): void;
}

function saveLine(status: SaveStatus, signedIn: boolean): string | null {
  if (!online) return null; // offline build: nothing to say
  switch (status) {
    case 'saving':
      return 'Saving your score…';
    case 'saved':
      return 'Score posted to the leaderboard.';
    case 'queued':
      return signedIn ? 'Saved on this device · will post when the connection is back.' : 'Saved on this device · sign in to post it.';
    case 'local':
      return 'Saved on this device.';
    default:
      return null;
  }
}

export function ResultOverlay({ view, seed, saveStatus, signedIn, standings, onReplay, onNewSeed, onExit }: ResultProps) {
  const [copied, setCopied] = useState(false);
  const r = view.result;
  if (!r) return null;
  const saved = saveLine(saveStatus, signedIn);
  if (standings) return <RaceResult view={view} standings={standings} onExit={onExit} />;
  const copy = () => {
    try {
      void navigator.clipboard?.writeText(seed).then(() => setCopied(true));
    } catch {
      // clipboard unavailable (older WebView): the code is on screen to read
    }
  };
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
      <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-grove-700 bg-grove-950/60 px-3 py-2 text-xs">
        <span className="text-grove-300/70">
          Challenge code <span className="ml-1 font-mono text-sm text-grove-300">{seed}</span>
        </span>
        <button onClick={copy} className="rounded-md border border-grove-700 px-2 py-1 text-grove-300 hover:bg-grove-800">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {saved && (
        <p className="mt-2 text-xs text-grove-300/70" role="status">
          {saved}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={onReplay} className="rounded-lg bg-grove-500 px-4 py-2 font-semibold text-grove-950 hover:bg-grove-300">
          Same waves again
        </button>
        <button onClick={onNewSeed} className="rounded-lg border border-grove-700 px-4 py-2 text-grove-300 hover:bg-grove-800">
          New waves
        </button>
        <button onClick={onExit} className="rounded-lg border border-grove-700 px-4 py-2 text-grove-300 hover:bg-grove-800">
          Menu
        </button>
      </div>
    </Scrim>
  );
}

function RaceResult({ view, standings, onExit }: { view: SimView; standings: Standing[]; onExit(): void }) {
  const r = view.result!;
  const mine = standings.findIndex((s) => s.me);
  const waiting = standings.filter((s) => !s.finished).length;
  const settled = waiting === 0;
  const place = mine + 1;
  const title = !settled ? (r.outcome === 'won' ? 'You held the maze' : 'Your maze fell') : place === 1 ? 'You win the race' : `${ordinal(place)} place`;
  return (
    <Scrim>
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="text-sm text-grove-300/80" role="status">
        {settled ? 'Everyone has finished.' : `Waiting for ${waiting} rival${waiting === 1 ? '' : 's'} to finish… standings update live.`}
      </p>
      <ol className="mt-3 flex flex-col gap-1 text-sm" aria-label="Standings">
        {standings.map((s, i) => {
          const race = raceById(s.raceId);
          return (
            <li key={s.userId} className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${s.me ? 'bg-grove-700/70' : 'bg-grove-950/40'}`}>
              <span className="w-5 text-right tabular-nums text-grove-300/70">{i + 1}</span>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: race.palette.primary }} />
              <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
              <span className="shrink-0 text-xs text-grove-300/70">{s.finished ? (s.result === 'won' ? 'held' : `fell w${s.wave}`) : `playing w${s.wave}`}</span>
              <span className="w-8 shrink-0 text-right text-xs tabular-nums text-grove-300/70">{s.lives}♥</span>
              <span className="w-14 shrink-0 text-right font-semibold tabular-nums">{s.score}</span>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={onExit} className="rounded-lg bg-grove-500 px-4 py-2 font-semibold text-grove-950 hover:bg-grove-300">
          Back to menu
        </button>
      </div>
    </Scrim>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function Scrim({ children }: { children: React.ReactNode }) {
  // Modal rule from the brief: overlay padding plus maxHeight 100%, so it never fights the safe areas.
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-full w-full max-w-sm overflow-auto rounded-xl border border-grove-700 bg-grove-900 p-5 shadow-xl">{children}</div>
    </div>
  );
}
