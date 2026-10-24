// Extra Terram — src/net/leaderboard.ts v0.1.0 — per-level standings, read through the `leaderboard` RPC
// Rows come back already reduced to one best per player, ordered by score. Anonymous visitors can
// read them too (the RPC is granted to anon), so the menu shows standings before sign-in.
import { errorMessage, supabase } from './supabase';

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
}

export interface MyBest {
  score: number;
  stars: number;
  race_id: string;
  created_at: string;
}

const cache = new Map<string, { at: number; rows: LeaderboardRow[] }>();
const CACHE_MS = 30_000;

export async function fetchLeaderboard(levelId: string, limit = 10, force = false): Promise<LeaderboardRow[]> {
  if (!supabase) return [];
  const hit = cache.get(levelId);
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const { data, error } = await supabase.rpc('leaderboard', { p_level_id: levelId, p_limit: limit });
  if (error) throw new Error(errorMessage(error));
  const rows = (data as LeaderboardRow[] | null) ?? [];
  cache.set(levelId, { at: Date.now(), rows });
  return rows;
}

export async function fetchMyBest(levelId: string): Promise<MyBest | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('my_best', { p_level_id: levelId });
  if (error) throw new Error(errorMessage(error));
  const rows = (data as MyBest[] | null) ?? [];
  return rows[0] ?? null;
}

/** Forget cached standings (after a run is saved, so the next look is fresh). */
export function invalidateLeaderboard(levelId?: string): void {
  if (levelId) cache.delete(levelId);
  else cache.clear();
}

export function rowName(row: LeaderboardRow): string {
  return row.username ?? row.display_name ?? 'Player';
}
