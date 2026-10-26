// Extra Terram — src/net/invites.ts v0.1.0 — find players, invite them to a lobby, hear about invites
// Search and invites are Supabase RPCs (migration 0002). The nudge is a Broadcast on the invitee's
// personal channel `user:<id>` so an open game shows the invite at once; the row in match_invites
// is what makes it survive a reload (`my_invites`). Local (no-server) play has none of this.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { errorMessage, supabase } from './supabase';

export interface PlayerHit {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface Invite {
  invite_id: number;
  match_id: string;
  code: string;
  mode: string;
  map_id: string;
  max_players: number;
  seated: number;
  from_user: string;
  from_name: string;
  created_at: string;
}

export const invitesAvailable = supabase !== null;

/** Username / display-name prefix, or an exact email. Never returns emails. */
export async function searchPlayers(query: string): Promise<PlayerHit[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('search_players', { p_query: query });
  if (error) throw new Error(errorMessage(error));
  return (data as PlayerHit[] | null) ?? [];
}

/** Invite a player to the lobby and nudge their open game. */
export async function invitePlayer(matchId: string, toUserId: string, fromName: string, code: string, mode: string, mapId: string): Promise<void> {
  if (!supabase) throw new Error('Invites need an online account.');
  const { error } = await supabase.rpc('invite_to_match', { p_match_id: matchId, p_to_user: toUserId });
  if (error) throw new Error(errorMessage(error));
  const ch = supabase.channel(`user:${toUserId}`, { config: { broadcast: { ack: true } } });
  await new Promise<void>((resolve) => {
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.send({ type: 'broadcast', event: 'invite', payload: { code, mode, mapId, fromName, matchId } });
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        resolve(); // the row is stored; the nudge is best effort
      }
    });
  });
  void supabase.removeChannel(ch);
}

export async function fetchInvites(): Promise<Invite[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('my_invites');
  if (error) throw new Error(errorMessage(error));
  return (data as Invite[] | null) ?? [];
}

export async function respondInvite(inviteId: number, accept: boolean): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('respond_invite', { p_invite_id: inviteId, p_accept: accept });
  if (error) throw new Error(errorMessage(error));
}

/** Listen on this user's channel; `onNudge` fires on each incoming invite. Returns an unsubscribe. */
export function listenForInvites(userId: string, onNudge: (payload: { code: string; fromName: string; mode: string; mapId: string }) => void): () => void {
  if (!supabase) return () => undefined;
  const ch: RealtimeChannel = supabase.channel(`user:${userId}`, { config: { broadcast: { self: false } } });
  ch.on('broadcast', { event: 'invite' }, (msg) => {
    const p = msg.payload as { code?: string; fromName?: string; mode?: string; mapId?: string } | undefined;
    if (p?.code) onNudge({ code: p.code, fromName: p.fromName ?? 'A player', mode: p.mode ?? 'parallel', mapId: p.mapId ?? '' });
  });
  ch.subscribe();
  return () => {
    void supabase?.removeChannel(ch);
  };
}
