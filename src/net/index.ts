// Extra Terram — src/net/index.ts v0.3.0 — accounts, progress, and the match service (Supabase or local tabs)
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
  type MatchChannelLike,
  type MatchMode,
  type MatchRow,
  type MatchPlayerRow,
  type MatchEvent,
  type SeatPresence,
} from './match';
export { getMatchService, type MatchService } from './matchService';
export { localUserId } from './localMatch';
export { rankStandings, type ActiveMatch, type Standing } from './activeMatch';

export const NET_PHASE = 'accounts + progress (Phase 3); parallel race lobbies (Phase 4, first mode)';
