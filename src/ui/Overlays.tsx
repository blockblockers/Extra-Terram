// Extra Terram — src/ui/Overlays.tsx v0.13.0 — the pause screen carries the sound and view settings
// Inline overlays over the board. Never window.confirm/alert: iOS standalone PWAs block them silently.
import { useState } from 'react';
import type { SaveStatus } from '../app/App';
import { raceById } from '../content';
import type { SimView, VersusMode, VersusView } from '../engine';
import { online, type SeatPresence, type Standing } from '../net';
import { seatColor, sideColorIndex } from '../render/seats';
import { sideName } from './SidesBar';
import { Lives, UiIcon, emblemIcon } from './UiIcon';
import type { Settings } from '../app/settings';
import { SoundSettings, ViewSettings } from './SettingsPanel';

export function PauseOverlay({ settings, onSettings, onResume, onExit, onHowTo }: { settings?: Settings; onSettings?(next: Settings): void; onResume(): void; onExit(): void; onHowTo?(): void }) {
  const [open, setOpen] = useState(false);
  return (
    <Scrim>
      <h2 className="text-2xl font-bold">Paused</h2>
      <p className="text-sm text-grove-300/80">The maze holds its breath.</p>
      <div className="mt-4 flex gap-2">
        <button onClick={onResume} className="rounded-lg bg-grove-500 px-4 py-2 font-semibold text-grove-950 hover:bg-grove-300">
          Resume
        </button>
        <button onClick={onExit} className="rounded-lg border border-grove-700 px-4 py-2 text-grove-300 hover:bg-grove-800">
          Menu
        </button>
        {settings && onSettings && (
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="ml-auto rounded-lg border border-grove-700 px-4 py-2 text-grove-300 hover:bg-grove-800">
            {open ? 'Hide settings' : 'Settings'}
          </button>
        )}
      </div>
      {open && settings && onSettings && (
        <div className="mt-4 border-t border-grove-700 pt-2">
          <SoundSettings settings={settings} onSettings={onSettings} />
          <ViewSettings settings={settings} onSettings={onSettings} />
        </div>
      )}
      {onHowTo && (
        <button onClick={onHowTo} className="mt-3 text-sm text-grove-300 underline decoration-grove-300/50 underline-offset-4 hover:text-white">
          How to play
        </button>
      )}
    </Scrim>
  );
}

interface ResultProps {
  view: SimView;
  seed: string;
  /** "30 rounds · mini-boss every 5 rounds", or "Standard · 14 rounds". */
  rulesLine: string;
  /** Other rules than the level's own: no stars, no top scores. */
  custom: boolean;
  /** Mini-bosses were on: count the ones defeated. */
  bosses: boolean;
  saveStatus: SaveStatus;
  signedIn: boolean;
  /** Ranked standings during a parallel race; null for a solo run. */
  standings: Standing[] | null;
  /** After a match: the rematch button's label (null: none), a note under it, and what it does. */
  rematchLabel?: string | null;
  rematchNote?: string | null;
  onRematch?(): void;
  onReplay(): void;
  onNewSeed(): void;
  onExit(): void;
}

function saveLine(status: SaveStatus, signedIn: boolean, custom: boolean): string | null {
  if (!online) return null; // offline build: nothing to say
  switch (status) {
    case 'saving':
      return 'Saving your score…';
    case 'saved':
      return custom ? 'Posted to the Ultimate list (custom rules).' : 'Score posted to the leaderboard.';
    case 'queued':
      return signedIn ? 'Saved on this device · will post when the connection is back.' : 'Saved on this device · sign in to post it.';
    case 'local':
      return 'Saved on this device.';
    default:
      return null;
  }
}

export function ResultOverlay({ view, seed, rulesLine, custom, bosses, saveStatus, signedIn, standings, onReplay, onNewSeed, onExit, rematchLabel = null, rematchNote = null, onRematch }: ResultProps) {
  const [copied, setCopied] = useState(false);
  const r = view.result;
  if (!r) return null;
  const saved = saveLine(saveStatus, signedIn, custom);
  const inMatch = rematchLabel !== null || rematchNote !== null; // a co-op board: everyone replays together through a rematch, never alone
  if (standings) return <RaceResult view={view} standings={standings} rulesLine={custom ? rulesLine : null} onExit={onExit} rematchLabel={rematchLabel} rematchNote={rematchNote} onRematch={onRematch} />;
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
      {won && !custom && (
        <p className="text-lg tracking-widest text-sap" aria-label={`${r.stars} stars`}>
          {'★'.repeat(r.stars)}
          <span className="text-grove-300/30">{'★'.repeat(3 - r.stars)}</span>
        </p>
      )}
      {won && custom && <p className="text-sm text-grove-300/80">All {view.waves} rounds held.</p>}
      {!won && (
        <p className="text-sm text-grove-300/80">
          Reached {custom ? 'round' : 'wave'} {view.wave} of {view.waves}.
        </p>
      )}
      {custom && <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-sap/90">Custom run · {rulesLine}</p>}
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <dt className="text-grove-300/70">Score</dt>
        <dd className="text-right font-semibold tabular-nums">{r.score}</dd>
        <dt className="text-grove-300/70">Lives left</dt>
        <dd className="text-right tabular-nums">{view.lives}</dd>
        <dt className="text-grove-300/70">Kills / leaks</dt>
        <dd className="text-right tabular-nums">
          {view.stats.kills} / {view.stats.leaks}
        </dd>
        {bosses && (
          <>
            <dt className="text-grove-300/70">Mini-bosses defeated</dt>
            <dd className="text-right tabular-nums">{view.stats.bosses}</dd>
          </>
        )}
        <dt className="text-grove-300/70">Time</dt>
        <dd className="text-right tabular-nums">{formatTime(r.ticks)}</dd>
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
      {inMatch ? (
        <RematchRow label={rematchLabel} note={rematchNote} onRematch={onRematch} onExit={onExit} />
      ) : (
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
      )}
    </Scrim>
  );
}

/** 95 s, or 12 min 40 s for a long run. */
function formatTime(ticks: number): string {
  const s = Math.round(ticks / 20);
  return s < 120 ? `${s}s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

function RaceResult({ view, standings, rulesLine, onExit, rematchLabel, rematchNote, onRematch }: { view: SimView; standings: Standing[]; rulesLine: string | null; onExit(): void; rematchLabel?: string | null; rematchNote?: string | null; onRematch?(): void }) {
  const r = view.result!;
  const mine = standings.findIndex((s) => s.me);
  const waiting = standings.filter((s) => !s.finished).length;
  const settled = waiting === 0;
  const place = mine + 1;
  const title = !settled ? (r.outcome === 'won' ? 'You held the maze' : 'Your maze fell') : place === 1 ? 'You win the race' : `${ordinal(place)} place`;
  return (
    <Scrim>
      <h2 className="text-2xl font-bold">{title}</h2>
      {rulesLine && <p className="text-xs font-semibold uppercase tracking-wide text-sap/90">{rulesLine}</p>}
      <p className="text-sm text-grove-300/80" role="status">
        {settled ? 'Everyone has finished.' : `Waiting for ${waiting} rival${waiting === 1 ? '' : 's'} to finish… standings update live.`}
      </p>
      <ol className="mt-3 flex flex-col gap-1 text-sm" aria-label="Standings">
        {standings.map((s, i) => {
          const race = raceById(s.raceId);
          return (
            <li key={s.userId} className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${s.me ? 'bg-grove-700/70' : 'bg-grove-950/40'}`}>
              <span className="w-5 text-right tabular-nums text-grove-300/70">{i + 1}</span>
              <UiIcon name={emblemIcon(s.raceId)} size={16} alt={race.name} fallback={<span className="h-2 w-2 shrink-0 rounded-full" style={{ background: race.palette.primary }} />} />
              <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
              <span className="shrink-0 text-xs text-grove-300/70">{s.finished ? (s.result === 'won' ? 'held' : `fell w${s.wave}`) : `playing w${s.wave}`}</span>
              <Lives count={s.lives} className="w-10 shrink-0 justify-end text-right text-xs tabular-nums text-grove-300/70" />
              <span className="w-14 shrink-0 text-right font-semibold tabular-nums">{s.score}</span>
            </li>
          );
        })}
      </ol>
      <RematchRow label={rematchLabel ?? null} note={rematchNote ?? null} onRematch={onRematch} onExit={onExit} />
    </Scrim>
  );
}

/** The buttons under a match result: Rematch (host) or Join the rematch (once the host opened one), and the way out. */
function RematchRow({ label, note, onRematch, onExit }: { label: string | null; note: string | null; onRematch?(): void; onExit(): void }) {
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {label && onRematch && (
          <button onClick={onRematch} disabled={label.endsWith('…')} className="rounded-lg bg-grove-500 px-4 py-2 font-semibold text-grove-950 hover:bg-grove-300 disabled:opacity-60">
            {label}
          </button>
        )}
        <button onClick={onExit} className={`rounded-lg px-4 py-2 font-semibold ${label ? 'border border-grove-700 text-grove-300 hover:bg-grove-800' : 'bg-grove-500 text-grove-950 hover:bg-grove-300'}`}>
          Back to menu
        </button>
      </div>
      {note && <p className="mt-1.5 text-xs text-grove-300/70">{note}</p>}
    </div>
  );
}

/** Lanes / King of the Maze: placements are known to every board at once, so the table is final when it opens. */
export function VersusResult({ view, versus, mode, players, mySeat, rulesLine, onExit, rematchLabel = null, rematchNote = null, onRematch }: { view: SimView; versus: VersusView; mode: VersusMode; players: SeatPresence[]; mySeat: number; rulesLine: string | null; onExit(): void; rematchLabel?: string | null; rematchNote?: string | null; onRematch?(): void }) {
  const placements = versus.placements ?? versus.sides.map(() => 0);
  const order = versus.sides.map((_, i) => i).sort((a, b) => placements[a] - placements[b]);
  const mine = versus.side >= 0 ? placements[versus.side] : 0;
  const team = versus.teams;
  const title = mine === 1 ? (team ? 'Your team wins' : mode === 'king' ? 'Your base stands last' : 'You win the lanes') : mine > 0 ? `${ordinal(mine)} place` : 'Match over';
  const r = view.result;
  return (
    <Scrim>
      <h2 className="text-2xl font-bold">{title}</h2>
      {rulesLine && <p className="text-xs font-semibold uppercase tracking-wide text-sap/90">{rulesLine}</p>}
      <p className="text-sm text-grove-300/80">
        {r && r.wavesCleared > 0 ? `After ${r.wavesCleared} round${r.wavesCleared === 1 ? '' : 's'}. ` : ''}
        Standing sides rank by lives, then score; fallen ones by how long they held.
      </p>
      <ol className="mt-3 flex flex-col gap-1 text-sm" aria-label="Placings">
        {order.map((i) => {
          const sd = versus.sides[i];
          const me = sd.seats.includes(mySeat);
          return (
            <li key={i} className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${me ? 'bg-grove-700/70' : 'bg-grove-950/40'}`}>
              <span className="w-5 text-right tabular-nums text-grove-300/70">{placements[i]}</span>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: seatColor(sideColorIndex(team, i, sd.seats[0] ?? i)) }} />
              <span className="min-w-0 flex-1 truncate font-semibold">{sideName(players, sd.seats)}</span>
              {sd.out ? <span className="shrink-0 text-xs text-grove-300/70">{`fell r${sd.outWave + 1}`}</span> : <Lives count={sd.lives} className="shrink-0 text-xs text-grove-300/70" />}
              <span className="w-16 shrink-0 text-right font-semibold tabular-nums">{sd.score.toLocaleString()}</span>
            </li>
          );
        })}
      </ol>
      <RematchRow label={rematchLabel} note={rematchNote} onRematch={onRematch} onExit={onExit} />
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
