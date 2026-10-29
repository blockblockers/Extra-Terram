// Extra Terram — src/net/matchService.ts v0.2.0 — 2 v 2 lobbies (team mode) for Lanes and King of the Maze
// The lobby and the game shell talk to a MatchService and never to Supabase directly, so the same
// screens run against the local transport (two tabs in one browser, no server) and against the real
// one. `getMatchService()` picks: Supabase when configured and signed in, otherwise local.
import { supabase } from './supabase';
import { createMatch, fetchMatchPlayers, joinMatch, startMatch, submitMatchResult, MatchChannel, type MatchChannelLike, type MatchMode, type MatchRow, type SeatPresence } from './match';
import { LocalMatchChannel, localCreateMatch, localJoinMatch, localStartMatch } from './localMatch';

export interface MatchService {
  readonly kind: 'supabase' | 'local';
  /** Open a lobby; the caller is the host in seat 0. Returns the match row and the caller's seat. */
  create(opts: { mode: MatchMode; maxPlayers: number; teamMode?: boolean; levelId: string; raceId: string; contentVersion: string }): Promise<{ match: MatchRow; seat: number }>;
  /** Join by code. Returns the match row and the seat the caller received. */
  join(code: string, raceId: string): Promise<{ match: MatchRow; seat: number }>;
  /** Host only: mark the match running. */
  start(matchId: string): Promise<void>;
  /** Each client reports its own outcome; safe to call again with a refined placement. */
  submitResult(matchId: string, result: 'won' | 'lost' | 'draw' | 'left', placement: number, score: number, livesLeft: number): Promise<void>;
  channel(matchId: string, me: SeatPresence): MatchChannelLike;
}

class SupabaseMatchService implements MatchService {
  readonly kind = 'supabase' as const;

  constructor(private userId: string) {}

  async create(opts: { mode: MatchMode; maxPlayers: number; teamMode?: boolean; levelId: string; raceId: string; contentVersion: string }) {
    const match = await createMatch({ mode: opts.mode, maxPlayers: opts.maxPlayers, teamMode: !!opts.teamMode, mapId: opts.levelId, raceId: opts.raceId, contentVersion: opts.contentVersion });
    return { match, seat: 0 };
  }

  async join(code: string, raceId: string) {
    const match = await joinMatch(code, raceId);
    const players = await fetchMatchPlayers(match.id);
    const mine = players.find((p) => p.user_id === this.userId);
    return { match, seat: mine?.seat ?? players.length - 1 };
  }

  async start(matchId: string) {
    await startMatch(matchId);
  }

  async submitResult(matchId: string, result: 'won' | 'lost' | 'draw' | 'left', placement: number, score: number, livesLeft: number) {
    await submitMatchResult(matchId, result, placement, score, livesLeft);
  }

  channel(matchId: string, me: SeatPresence): MatchChannelLike {
    return new MatchChannel(matchId, me);
  }
}

class LocalMatchService implements MatchService {
  readonly kind = 'local' as const;

  async create(opts: { mode: MatchMode; maxPlayers: number; teamMode?: boolean; levelId: string; raceId: string; contentVersion: string }) {
    return localCreateMatch(opts);
  }

  async join(code: string, raceId: string) {
    return localJoinMatch(code, raceId);
  }

  async start(matchId: string) {
    localStartMatch(matchId);
  }

  async submitResult() {
    // nothing to persist locally; standings live in the tabs
  }

  channel(matchId: string, me: SeatPresence): MatchChannelLike {
    return new LocalMatchChannel(matchId, me);
  }
}

/** Supabase when this build has a server and the player is signed in; the local transport otherwise. */
export function getMatchService(userId: string | null): MatchService {
  if (supabase && userId) return new SupabaseMatchService(userId);
  return new LocalMatchService();
}
