// Extra Terram — src/ui/Leaderboard.tsx v0.1.0 — top scores for the selected level, plus your best
// Reads the `leaderboard` RPC (anon-readable) and `my_best` when signed in; shows the device best
// otherwise. Never blocks the menu: it loads after the level list is interactive.
import { useEffect, useState } from 'react';
import { raceById } from '../content';
import { fetchLeaderboard, fetchMyBest, localBest, online, rowName, useAuth, type LeaderboardRow, type MyBest } from '../net';

interface Props {
  levelId: string;
  levelName: string;
}

export function Leaderboard({ levelId, levelName }: Props) {
  const auth = useAuth();
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [mine, setMine] = useState<MyBest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signedIn = auth.status === 'signed-in';
  const device = localBest(levelId);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    setRows(null);
    setError(null);
    fetchLeaderboard(levelId, 10)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the leaderboard.');
      });
    if (signedIn) {
      fetchMyBest(levelId)
        .then((b) => {
          if (!cancelled) setMine(b);
        })
        .catch(() => {
          if (!cancelled) setMine(null);
        });
    } else {
      setMine(null);
    }
    return () => {
      cancelled = true;
    };
  }, [levelId, signedIn]);

  return (
    <div className="mt-2 border-t border-grove-700/60 pt-2 text-sm">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs uppercase tracking-wide text-grove-300/60">Top scores · {levelName}</h3>
        {device && <span className="text-xs text-grove-300/60">Your best here: {device.score}</span>}
      </div>

      {!online && <p className="mt-1 text-xs text-grove-300/60">This build has no server, so scores stay on this device.</p>}
      {online && error && <p className="mt-1 text-xs text-amber-200">{error}</p>}
      {online && !error && rows === null && <p className="mt-1 text-xs text-grove-300/60">Loading…</p>}
      {online && rows && rows.length === 0 && <p className="mt-1 text-xs text-grove-300/60">No scores posted yet. Be the first.</p>}

      {online && rows && rows.length > 0 && (
        <ol className="mt-1 flex flex-col gap-0.5">
          {rows.map((r, i) => {
            const me = auth.user?.id === r.user_id;
            const race = raceById(r.race_id);
            return (
              <li key={r.user_id} className={`flex items-center gap-2 rounded-md px-2 py-1 ${me ? 'bg-grove-700/70' : i % 2 ? 'bg-grove-950/30' : ''}`}>
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-grove-300/60">{i + 1}</span>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: race.palette.primary }} title={race.name} />
                <span className="min-w-0 flex-1 truncate">{rowName(r)}</span>
                <span className="shrink-0 text-xs text-sap" aria-label={`${r.stars} stars`}>
                  {'★'.repeat(r.stars)}
                </span>
                <span className="w-14 shrink-0 text-right font-semibold tabular-nums">{r.score}</span>
              </li>
            );
          })}
        </ol>
      )}

      {signedIn && mine && (
        <p className="mt-1 text-xs text-grove-300/60">
          Your posted best: {mine.score} with {raceById(mine.race_id).name}
        </p>
      )}
    </div>
  );
}
