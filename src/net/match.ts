// Extra Terram — src/net/match.ts v0.2.0 — match RPCs and the Supabase Broadcast channel behind the MatchChannelLike interface
// Postgres sees a match twice: when the lobby is made (create_match / join_match / start_match) and
// when it ends (submit_match_result / save_match_log). Everything in between — ready flags, the
// host's input frames for a shared board, creep sends and board summaries for mirrored boards,
// hash checks, snapshots for a rejoin — goes over Supabase Realtime Broadcast + Presence on
// `match:<id>`. No postgres_changes subscription anywhere, so no publication or replica-identity
// setup is ever needed (the Deadblock gotcha).
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { LoggedInput, SimInput } from '../engine';
import { errorMessage, supabase } from './supabase';

export type MatchMode = 'coop' | 'lanes' | 'king' | 'mirror' | 'parallel';
export type MatchStatus = 'lobby' | 'running' | 'finished' | 'abandoned';

export interface MatchRow {
  id: string;
  code: string;
  mode: MatchMode;
  max_players: number;
  team_mode: boolean;
  host_user_id: string;
  map_id: string;
  seed: string;
  settings: Record<string, unknown>;
  status: MatchStatus;
  content_version: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface MatchPlayerRow {
  match_id: string;
  user_id: string;
  seat: number;
  team: number;
  race_id: string;
  result: 'won' | 'lost' | 'draw' | 'left' | null;
  placement: number | null;
  score: number | null;
  lives_left: number | null;
}

function need() {
  if (!supabase) throw new Error('Multiplayer needs a server; this build has none configured.');
  return supabase;
}

export async function createMatch(opts: { mode: MatchMode; maxPlayers: number; teamMode: boolean; mapId: string; raceId: string; contentVersion: string }): Promise<MatchRow> {
  const { data, error } = await need().rpc('create_match', {
    p_mode: opts.mode,
    p_max_players: opts.maxPlayers,
    p_team_mode: opts.teamMode,
    p_map_id: opts.mapId,
    p_race_id: opts.raceId,
    p_content_version: opts.contentVersion,
  });
  if (error) throw new Error(errorMessage(error));
  return data as MatchRow;
}

export async function joinMatch(code: string, raceId: string): Promise<MatchRow> {
  const { data, error } = await need().rpc('join_match', { p_code: code.trim().toUpperCase(), p_race_id: raceId });
  if (error) throw new Error(errorMessage(error));
  return data as MatchRow;
}

export async function startMatch(matchId: string): Promise<MatchRow> {
  const { data, error } = await need().rpc('start_match', { p_match_id: matchId });
  if (error) throw new Error(errorMessage(error));
  return data as MatchRow;
}

export async function fetchMatchPlayers(matchId: string): Promise<MatchPlayerRow[]> {
  const { data, error } = await need().from('match_players').select('*').eq('match_id', matchId).order('seat');
  if (error) throw new Error(errorMessage(error));
  return (data as MatchPlayerRow[] | null) ?? [];
}

export async function submitMatchResult(matchId: string, result: 'won' | 'lost' | 'draw' | 'left', placement: number, score: number, livesLeft: number, report?: Record<string, unknown>): Promise<void> {
  const { error } = await need().rpc('submit_match_result', {
    p_match_id: matchId,
    p_result: result,
    p_placement: placement,
    p_score: score,
    p_lives_left: livesLeft,
    p_report: report ?? null,
  });
  if (error) throw new Error(errorMessage(error));
}

export async function saveMatchLog(matchId: string, log: unknown, finalHash: string): Promise<void> {
  const { error } = await need().rpc('save_match_log', { p_match_id: matchId, p_log: log, p_final_hash: finalHash });
  if (error) throw new Error(errorMessage(error));
}

// ---------------------------------------------------------------- live channel

/** What every client publishes about itself through Presence. */
export interface SeatPresence {
  userId: string;
  seat: number;
  name: string;
  raceId: string;
  ready: boolean;
}

/** Everything that crosses the wire during a match. Entity positions never do; inputs and summaries only. */
export type MatchEvent =
  | { type: 'ready'; seat: number; ready: boolean }
  | { type: 'start'; seed: string; startAt: number; levelId: string } // host: wall-clock ms for the shared countdown
  | { type: 'input'; seat: number; seq: number; input: SimInput } // client -> host (shared board)
  | { type: 'frame'; tick: number; inputs: LoggedInput[] } // host -> all, every 5 ticks (shared board)
  | { type: 'hash'; tick: number; hash: number } // all -> all, every 20 ticks
  | { type: 'board'; seat: number; tick: number; lives: number; wave: number; score: number; income: number } // mirrored boards
  | { type: 'send'; from: number; to: number; creep: string; count: number } // mirrored boards
  | { type: 'snapshot-request'; seat: number }
  | { type: 'snapshot'; tick: number; state: string } // host -> rejoining peer (serialize(state))
  | { type: 'finished'; seat: number; result: 'won' | 'lost'; score: number; lives: number; wave: number }
  | { type: 'chat'; seat: number; text: string };

export type MatchEventHandler = (event: MatchEvent, fromUserId: string) => void;
export type PresenceHandler = (seats: SeatPresence[]) => void;

/** What the lobby and the game shell need from a live channel; Supabase and the local transport both provide it. */
export interface MatchChannelLike {
  readonly matchId: string;
  open(onStatus?: (status: string) => void): Promise<void>;
  on(handler: MatchEventHandler): () => void;
  onPresence(handler: PresenceHandler): () => void;
  presence(): SeatPresence[];
  send(event: MatchEvent): void;
  update(patch: Partial<SeatPresence>): Promise<void>;
  close(): Promise<void>;
}

export class MatchChannel implements MatchChannelLike {
  private channel: RealtimeChannel | null = null;
  private handlers = new Set<MatchEventHandler>();
  private presenceHandlers = new Set<PresenceHandler>();
  private seats: SeatPresence[] = [];

  constructor(
    readonly matchId: string,
    private me: SeatPresence,
  ) {}

  /** Join `match:<id>`; resolves once subscribed and our presence is tracked. */
  open(onStatus?: (status: string) => void): Promise<void> {
    const client = need();
    const channel = client.channel(`match:${this.matchId}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: this.me.userId, enabled: true } },
    });
    this.channel = channel;

    channel.on('broadcast', { event: 'match' }, (msg) => {
      const payload = msg.payload as { from: string; event: MatchEvent } | undefined;
      if (!payload || !payload.event) return;
      for (const h of this.handlers) h(payload.event, payload.from);
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<SeatPresence>();
      this.seats = Object.values(state)
        .map((entries) => entries[0])
        .filter((p): p is SeatPresence & { presence_ref: string } => !!p)
        .map(({ userId, seat, name, raceId, ready }) => ({ userId, seat, name, raceId, ready }))
        .sort((a, b) => a.seat - b.seat);
      for (const h of this.presenceHandlers) h(this.seats);
    });

    return new Promise<void>((resolve, reject) => {
      channel.subscribe(async (status, err) => {
        onStatus?.(status);
        if (status === 'SUBSCRIBED') {
          await channel.track(this.me);
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          reject(err ?? new Error(`match channel ${status}`));
        }
      });
    });
  }

  on(handler: MatchEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onPresence(handler: PresenceHandler): () => void {
    this.presenceHandlers.add(handler);
    handler(this.seats);
    return () => this.presenceHandlers.delete(handler);
  }

  presence(): SeatPresence[] {
    return this.seats;
  }

  send(event: MatchEvent): void {
    if (!this.channel) return;
    void this.channel.send({ type: 'broadcast', event: 'match', payload: { from: this.me.userId, event } });
  }

  /** Update what others see about us (ready flag, race pick). */
  async update(patch: Partial<SeatPresence>): Promise<void> {
    this.me = { ...this.me, ...patch };
    if (this.channel) await this.channel.track(this.me);
  }

  async close(): Promise<void> {
    const ch = this.channel;
    this.channel = null;
    this.handlers.clear();
    this.presenceHandlers.clear();
    if (ch && supabase) await supabase.removeChannel(ch);
  }
}
