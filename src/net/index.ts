// Extra Terram — src/net/index.ts v0.2.0 — Phase 3 accounts and progress; Phase 4 match plumbing
// The engine never imports from here (lint-enforced). The UI reaches the server only through
// these modules, and every one of them works with `supabase === null` (an offline build).
export { supabase, online, authProviders, errorMessage } from './supabase';
export { AuthProvider, useAuth, playerName, type Auth, type AuthStatus, type Profile } from './auth';
export { recordRun, flushQueue, queuedRunCount, localBest, localBests, syncSettings, type RunRecord, type SaveOutcome, type LocalBest } from './progress';
export { fetchLeaderboard, fetchMyBest, invalidateLeaderboard, rowName, type LeaderboardRow, type MyBest } from './leaderboard';
export {
  createMatch,
  joinMatch,
  startMatch,
  fetchMatchPlayers,
  submitMatchResult,
  saveMatchLog,
  MatchChannel,
  type MatchMode,
  type MatchRow,
  type MatchPlayerRow,
  type MatchEvent,
  type SeatPresence,
} from './match';

export const NET_PHASE = 'accounts + progress (Phase 3); match plumbing ready for Phase 4';
