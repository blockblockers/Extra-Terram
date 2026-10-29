// Extra Terram — src/net/activeMatch.ts v0.5.0 — lobby shape kept for rematches; 2 v 2 and the seats playing, for versus boards
import type { RunRules } from '../engine';
import type { MatchChannelLike, MatchMode, SeatPresence } from './match';
import type { MatchService } from './matchService';

export interface ActiveMatch {
  service: MatchService;
  matchId: string;
  code: string;
  mode: MatchMode;
  me: SeatPresence;
  /** Everyone seated when the match started, by seat. */
  players: SeatPresence[];
  /** True for the lobby host: on a shared board the host sequences every input. */
  host: boolean;
  /** Wallets on a shared board (the lobby size) and how many players actually started (wave scaling). */
  seats: number;
  party: number;
  /** Rounds, mini-bosses and difficulty from the host's start event (undefined: the level as written). */
  rules?: RunRules;
  /** Versus boards: 2 v 2 (seats 0 and 2 against 1 and 3), and the seats actually playing. */
  teams?: boolean;
  present?: number[];
  channel: MatchChannelLike;
  /** The lobby's shape (for a rematch with the same settings). */
  maxPlayers: number;
  levelId: string;
}

/** One row of the live standings in a parallel race. */
export interface Standing {
  seat: number;
  userId: string;
  name: string;
  raceId: string;
  wave: number;
  lives: number;
  score: number;
  finished: boolean;
  result: 'won' | 'lost' | null;
  me: boolean;
}

/**
 * Race order: finished winners by score, then players still playing (by wave, then score), then
 * finished losers by wave and score. Stable for ties by seat so every client agrees.
 */
export function rankStandings(rows: Standing[]): Standing[] {
  const bucket = (r: Standing) => (r.finished && r.result === 'won' ? 0 : !r.finished ? 1 : 2);
  return [...rows].sort((a, b) => {
    const ba = bucket(a);
    const bb = bucket(b);
    if (ba !== bb) return ba - bb;
    if (ba === 0) return b.score - a.score || a.seat - b.seat;
    return b.wave - a.wave || b.score - a.score || a.seat - b.seat;
  });
}
