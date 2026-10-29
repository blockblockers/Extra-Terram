// Extra Terram — src/net/localMatch.ts v0.2.0 — matches between tabs of one browser, no server; team mode for 2 v 2
// A BroadcastChannel per match carries the same MatchEvent payloads the Supabase channel does, and
// presence is a heartbeat every second (a seat drops after 4 s of silence). Lobbies live in
// localStorage so a second tab can join by code. It exists so the lobby and the race can be played
// and tested on one machine; the real transport is src/net/match.ts.
import type { MatchChannelLike, MatchEvent, MatchEventHandler, MatchMode, MatchRow, PresenceHandler, SeatPresence } from './match';

const REGISTRY_KEY = 'extra-terram.local-matches.v1';
const HEARTBEAT_MS = 1000;
const PRESENCE_TTL_MS = 4000;

interface LocalMatch extends MatchRow {
  seats: Array<{ userId: string; seat: number; raceId: string }>;
}

function readRegistry(): Record<string, LocalMatch> {
  try {
    return JSON.parse(localStorage.getItem(REGISTRY_KEY) ?? '{}') as Record<string, LocalMatch>;
  } catch {
    return {};
  }
}

function writeRegistry(reg: Record<string, LocalMatch>): void {
  try {
    // keep the registry small: drop matches older than a day
    const cutoff = Date.now() - 24 * 3600 * 1000;
    for (const [id, m] of Object.entries(reg)) if (Date.parse(m.created_at) < cutoff) delete reg[id];
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(reg));
  } catch {
    // storage unavailable: the lobby lives in this tab only
  }
}

/** A stable id for this tab (sessionStorage), so two tabs are two players. */
export function localUserId(): string {
  try {
    let id = sessionStorage.getItem('extra-terram.local-user');
    if (!id) {
      id = `tab-${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem('extra-terram.local-user', id);
    }
    return id;
  } catch {
    return `tab-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return code;
}

export function localCreateMatch(opts: { mode: MatchMode; maxPlayers: number; teamMode?: boolean; levelId: string; raceId: string; contentVersion: string }): { match: MatchRow; seat: number } {
  const reg = readRegistry();
  const code = randomCode();
  const me = localUserId();
  const match: LocalMatch = {
    id: `local-${code.toLowerCase()}`,
    code,
    mode: opts.mode,
    max_players: opts.maxPlayers,
    team_mode: !!opts.teamMode,
    host_user_id: me,
    map_id: opts.levelId,
    seed: `${code.toLowerCase()}-${Math.random().toString(36).slice(2, 6)}`,
    settings: {},
    status: 'lobby',
    content_version: opts.contentVersion,
    created_at: new Date().toISOString(),
    started_at: null,
    ended_at: null,
    seats: [{ userId: me, seat: 0, raceId: opts.raceId }],
  };
  reg[match.id] = match;
  writeRegistry(reg);
  return { match, seat: 0 };
}

export function localJoinMatch(code: string, raceId: string): { match: MatchRow; seat: number } {
  const reg = readRegistry();
  const match = Object.values(reg).find((m) => m.code === code.trim().toUpperCase() && m.status === 'lobby');
  if (!match) throw new Error('No open lobby with that code in this browser. Local lobbies only work between tabs of the same browser.');
  const me = localUserId();
  const existing = match.seats.find((s) => s.userId === me);
  if (existing) return { match, seat: existing.seat };
  if (match.seats.length >= match.max_players) throw new Error('That lobby is full.');
  const taken = new Set(match.seats.map((s) => s.seat));
  let seat = 0;
  while (taken.has(seat)) seat++;
  match.seats.push({ userId: me, seat, raceId });
  reg[match.id] = match;
  writeRegistry(reg);
  return { match, seat };
}

export function localStartMatch(matchId: string): void {
  const reg = readRegistry();
  const m = reg[matchId];
  if (!m) return;
  m.status = 'running';
  m.started_at = new Date().toISOString();
  writeRegistry(reg);
}

type Wire = { kind: 'event'; from: string; event: MatchEvent } | { kind: 'presence'; from: string; seat: SeatPresence; at: number } | { kind: 'leave'; from: string };

export class LocalMatchChannel implements MatchChannelLike {
  private bc: BroadcastChannel | null = null;
  private handlers = new Set<MatchEventHandler>();
  private presenceHandlers = new Set<PresenceHandler>();
  private seen = new Map<string, { seat: SeatPresence; at: number }>();
  private timer: number | null = null;

  constructor(
    readonly matchId: string,
    private me: SeatPresence,
  ) {}

  async open(onStatus?: (status: string) => void): Promise<void> {
    const bc = new BroadcastChannel(`extra-terram.match.${this.matchId}`);
    this.bc = bc;
    bc.onmessage = (ev: MessageEvent<Wire>) => {
      const msg = ev.data;
      if (!msg || msg.from === this.me.userId) return;
      if (msg.kind === 'event') {
        for (const h of this.handlers) h(msg.event, msg.from);
      } else if (msg.kind === 'presence') {
        this.seen.set(msg.from, { seat: msg.seat, at: Date.now() });
        this.emitPresence();
      } else if (msg.kind === 'leave') {
        this.seen.delete(msg.from);
        this.emitPresence();
      }
    };
    const beat = () => {
      const now = Date.now();
      for (const [id, v] of this.seen) if (now - v.at > PRESENCE_TTL_MS) this.seen.delete(id);
      this.post({ kind: 'presence', from: this.me.userId, seat: this.me, at: now });
      this.emitPresence();
    };
    this.timer = window.setInterval(beat, HEARTBEAT_MS);
    beat();
    onStatus?.('SUBSCRIBED');
  }

  private post(msg: Wire): void {
    try {
      this.bc?.postMessage(msg);
    } catch {
      // channel closed
    }
  }

  private emitPresence(): void {
    const seats = this.presence();
    for (const h of this.presenceHandlers) h(seats);
  }

  on(handler: MatchEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onPresence(handler: PresenceHandler): () => void {
    this.presenceHandlers.add(handler);
    handler(this.presence());
    return () => this.presenceHandlers.delete(handler);
  }

  presence(): SeatPresence[] {
    const all = [this.me, ...[...this.seen.values()].map((v) => v.seat)];
    return all.sort((a, b) => a.seat - b.seat);
  }

  send(event: MatchEvent): void {
    this.post({ kind: 'event', from: this.me.userId, event });
  }

  async update(patch: Partial<SeatPresence>): Promise<void> {
    this.me = { ...this.me, ...patch };
    this.post({ kind: 'presence', from: this.me.userId, seat: this.me, at: Date.now() });
    this.emitPresence();
  }

  async close(): Promise<void> {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.post({ kind: 'leave', from: this.me.userId });
    this.bc?.close();
    this.bc = null;
    this.handlers.clear();
    this.presenceHandlers.clear();
  }
}
