// Extra Terram — src/ui/Leaderboard.tsx v0.3.0 — Standard and Ultimate tabs: the level as written, and the best under any rules; race emblems on the rows
// Reads the list RPCs (anon-readable) and the caller's best when signed in; shows the device best
// otherwise. Never blocks the menu: it loads after the level list is interactive.
import { useEffect, useState } from 'react';
import { raceById, type LevelEntry } from '../content';
import { describeRules } from '../app/rules';
import { fetchLeaderboard, fetchMyBest, localBest, localUltimateBest, online, rowName, useAuth, type Board, type LeaderboardRow, type MyBest } from '../net';
import { UiIcon, emblemIcon } from './UiIcon';

interface Props {
  level: LevelEntry;
}

const TABS: Array<{ id: Board; name: string; note: string }> = [
  { id: 'standard', name: 'Standard', note: 'The level as written: the fair comparison.' },
  { id: 'ultimate', name: 'Ultimate', note: 'Any rules: long runs and mini-bosses count. The highest score ever.' },
];

/** How an Ultimate row was played, in a few words. */
function rulesText(level: LevelEntry, row: Pick<LeaderboardRow, 'mode' | 'rules'>): string {
  if (row.rules) return describeRules(row.rules, level);
  return row.mode === 'endless' ? 'Custom rules' : 'Standard';
}

export function Leaderboard({ level }: Props) {
  const auth = useAuth();
  const [board, setBoard] = useState<Board>('standard');
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [mine, setMine] = useState<MyBest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signedIn = auth.status === 'signed-in';
  const levelId = level.id;
  const device = board === 'ultimate' ? localUltimateBest(levelId) : localBest(levelId);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    setRows(null);
    setError(null);
    fetchLeaderboard(levelId, 10, false, board)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the leaderboard.');
      });
    if (signedIn) {
      fetchMyBest(levelId, board)
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
  }, [levelId, signedIn, board]);

  const tab = TABS.find((t) => t.id === board) ?? TABS[0];

  return (
    <div className="mt-2 border-t border-grove-700/60 pt-2 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="min-w-0 truncate text-xs uppercase tracking-wide text-grove-300/60">Top scores · {level.map.name}</h3>
        {device && <span className="shrink-0 text-xs text-grove-300/60">Your best here: {device.score}</span>}
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg bg-grove-950/60 p-0.5" role="tablist" aria-label="Score list">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={board === t.id}
            onClick={() => setBoard(t.id)}
            className={`rounded-md px-2 py-1 text-xs font-semibold ${board === t.id ? (t.id === 'ultimate' ? 'bg-sap/25 text-sap' : 'bg-grove-700 text-white') : 'text-grove-300/80 hover:bg-grove-800'}`}
          >
            {t.name}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-grove-300/60">{tab.note}</p>

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
                <UiIcon name={emblemIcon(r.race_id)} size={16} alt={race.name} fallback={<span className="h-2 w-2 shrink-0 rounded-full" style={{ background: race.palette.primary }} title={race.name} />} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{rowName(r)}</span>
                  {board === 'ultimate' && <span className="block truncate text-[11px] text-grove-300/60">{rulesText(level, r)}</span>}
                </span>
                {board === 'standard' && (
                  <span className="shrink-0 text-xs text-sap" aria-label={`${r.stars} stars`}>
                    {'★'.repeat(r.stars)}
                  </span>
                )}
                <span className="w-16 shrink-0 text-right font-semibold tabular-nums">{r.score.toLocaleString()}</span>
              </li>
            );
          })}
        </ol>
      )}

      {signedIn && mine && (
        <p className="mt-1 text-xs text-grove-300/60">
          Your posted best: {mine.score.toLocaleString()} with {raceById(mine.race_id).name}
          {board === 'ultimate' && ` · ${rulesText(level, mine)}`}
        </p>
      )}
    </div>
  );
}
