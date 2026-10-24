// Extra Terram — src/net/progress.ts v0.1.0 — run results: post to the server, or keep them until you can
// A finished run always lands somewhere: on the server through the `submit_run` RPC when signed in,
// otherwise in a local queue that is flushed the next time a session exists. Personal bests are
// also kept locally so the menu can show them offline. Nothing here is trusted by the server: the
// RPC re-validates every field, and leaderboards are computed from the stored rows.
import type { LoggedInput } from '../engine';
import { supabase } from './supabase';

export interface RunRecord {
  levelId: string;
  raceId: string;
  mode: 'campaign' | 'endless' | 'challenge';
  seed: string;
  outcome: 'won' | 'lost';
  score: number;
  stars: number;
  wavesCleared: number;
  livesLeft: number;
  durationTicks: number;
  contentVersion: string;
  engineVersion: string;
  inputLog?: LoggedInput[];
}

/** Where a run ended up. */
export type SaveOutcome = 'saved' | 'queued' | 'local';

export interface LocalBest {
  score: number;
  stars: number;
  raceId: string;
  at: number;
}

const QUEUE_KEY = 'extra-terram.run-queue.v1';
const BESTS_KEY = 'extra-terram.bests.v1';
const QUEUE_LIMIT = 50;
const LOG_LIMIT = 2000; // inputs; longer logs are dropped from the upload, the row still counts

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- local bests

export function localBests(): Record<string, LocalBest> {
  return readJson<Record<string, LocalBest>>(BESTS_KEY, {});
}

export function localBest(levelId: string): LocalBest | null {
  return localBests()[levelId] ?? null;
}

function rememberBest(rec: RunRecord): void {
  const bests = localBests();
  const prev = bests[rec.levelId];
  if (!prev || rec.score > prev.score || (rec.score === prev.score && rec.stars > prev.stars)) {
    bests[rec.levelId] = { score: rec.score, stars: rec.stars, raceId: rec.raceId, at: Date.now() };
    writeJson(BESTS_KEY, bests);
  }
}

// ---------------------------------------------------------------- server

function rpcArgs(rec: RunRecord) {
  return {
    p_level_id: rec.levelId,
    p_race_id: rec.raceId,
    p_mode: rec.mode,
    p_seed: rec.seed,
    p_outcome: rec.outcome,
    p_score: Math.round(rec.score),
    p_stars: rec.stars,
    p_waves_cleared: rec.wavesCleared,
    p_lives_left: rec.livesLeft,
    p_duration_ticks: rec.durationTicks,
    p_content_version: rec.contentVersion,
    p_engine_version: rec.engineVersion,
    p_input_log: rec.inputLog && rec.inputLog.length <= LOG_LIMIT ? rec.inputLog : null,
  };
}

async function hasSession(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

/** Try the RPC once. Returns true on success, false when it should be retried later. Throws on a rejection. */
async function submit(rec: RunRecord): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc('submit_run', rpcArgs(rec));
  if (!error) return true;
  // A validation error is final: the server will never accept this row, so don't keep it around.
  if (error.code && error.code.startsWith('P0')) throw new Error(error.message);
  if (error.code === '23514' || error.code === '22P02') throw new Error(error.message);
  return false; // network or auth hiccup: retry later
}

// ---------------------------------------------------------------- queue

function readQueue(): RunRecord[] {
  return readJson<RunRecord[]>(QUEUE_KEY, []);
}

function writeQueue(q: RunRecord[]): void {
  writeJson(QUEUE_KEY, q.slice(-QUEUE_LIMIT));
}

export function queuedRunCount(): number {
  return readQueue().length;
}

/**
 * Record a finished run. Always updates the local best; posts to the server when there is a
 * session, otherwise queues the run (without its input log, to keep storage small).
 */
export async function recordRun(rec: RunRecord): Promise<SaveOutcome> {
  rememberBest(rec);
  if (!supabase) return 'local';
  if (!(await hasSession())) {
    enqueue(rec);
    return 'queued';
  }
  try {
    if (await submit(rec)) return 'saved';
  } catch (err) {
    console.warn('run rejected by server', err);
    return 'local';
  }
  enqueue(rec);
  return 'queued';
}

function enqueue(rec: RunRecord): void {
  const q = readQueue();
  const { inputLog: _dropped, ...slim } = rec;
  void _dropped;
  q.push(slim);
  writeQueue(q);
}

let flushing: Promise<number> | null = null;

/** Upload queued runs. Returns how many went up. Safe to call often; concurrent calls share one pass. */
export function flushQueue(): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    try {
      if (!supabase || !(await hasSession())) return 0;
      const q = readQueue();
      if (!q.length) return 0;
      const remaining: RunRecord[] = [];
      for (const rec of q) {
        try {
          if (await submit(rec)) sent += 1;
          else remaining.push(rec);
        } catch {
          // rejected for good; drop it
        }
      }
      writeQueue(remaining);
      return sent;
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/** Settings worth carrying across devices (not the per-device battery saver). Fire and forget. */
export async function syncSettings(settings: Record<string, unknown>): Promise<void> {
  if (!supabase || !(await hasSession())) return;
  const { error } = await supabase.rpc('save_settings', { p_settings: settings });
  if (error) console.warn('save_settings', error.message);
}
