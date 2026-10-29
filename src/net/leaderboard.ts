// Extra Terram — src/net/leaderboard.ts v0.2.0 — two lists per level: Standard (the level as written) and Ultimate (any rules)
// Rows come back already reduced to one best per player, ordered by score. Anonymous visitors can
// read them too (both list RPCs are granted to anon), so the menu shows standings before sign-in.
import type { RunRules } from '../engine';
import { errorMessage, supabase } from './supabase';

/** Standard: `leaderboard` (campaign runs). Ultimate: `leaderboard_ultimate` (any single-player rules; migration 0003). */
export type Board = 'standard' | 'ultimate';

export interface LeaderboardRow {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  race_id: string;
  score: number;
  stars: number;
  waves_cleared: number;
  created_at: string;
  /** Ultimate rows: how the run was played (null for rows posted before migration 0003). */
  mode?: 'campaign' | 'endless';
  rules?: RunRules | null;
}

export interface MyBest {
  score: number;
  stars: number;
  race_id: string;
  created_at: string;
  mode?: 'campaign' | 'endless';
  rules?: RunRules | null;
}

const cache = new Map<string, { at: number; rows: LeaderboardRow[] }>();
const CACHE_MS = 30_000;

/** The server has not had migration 0003 yet (the Ultimate functions are missing). */
function missingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message ?? '');
}

export async function fetchLeaderboard(levelId: string, limit = 10, force = false, board: Board = 'standard'): Promise<LeaderboardRow[]> {
  if (!supabase) return [];
  const key = `${board}:${levelId}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const { data, error } = await supabase.rpc(board === 'ultimate' ? 'leaderboard_ultimate' : 'leaderboard', { p_level_id: levelId, p_limit: limit });
  if (error) {
    if (board === 'ultimate' && missingFunction(error)) throw new Error('The Ultimate list is not on the server yet (database update 0003).');
    throw new Error(errorMessage(error));
  }
  const rows = (data as LeaderboardRow[] | null) ?? [];
  cache.set(key, { at: Date.now(), rows });
  return rows;
}

export async function fetchMyBest(levelId: string, board: Board = 'standard'): Promise<MyBest | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc(board === 'ultimate' ? 'my_best_ultimate' : 'my_best', { p_level_id: levelId });
  if (error) throw new Error(errorMessage(error));
  const rows = (data as MyBest[] | null) ?? [];
  return rows[0] ?? null;
}

/** Forget cached standings (after a run is saved, so the next look is fresh). */
export function invalidateLeaderboard(levelId?: string): void {
  if (!levelId) {
    cache.clear();
    return;
  }
  cache.delete(`standard:${levelId}`);
  cache.delete(`ultimate:${levelId}`);
}

export function rowName(row: LeaderboardRow): string {
  return row.username ?? row.display_name ?? 'Player';
}
