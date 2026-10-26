// Extra Terram — src/ui/MultiplayerScreen.tsx v0.3.0 — Mirror and Co-op open; invites by name or email; pending invites with one-tap join
// Parallel race: everyone plays the same level and waves on their own board; live standings; the
// best score among those left standing wins. Mirror: the same, plus sends. Co-op: one shared board
// in lockstep, a wallet each, a shared life pool. Lanes and King of the Maze wait for their maps.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { CONTENT_VERSION, content, levels, raceById, towersForRace, type LevelEntry } from '../content';
import { getMatchService, invitePlayer, localUserId, online, playerName, searchPlayers, useAuth, type ActiveMatch, type Invite, type MatchChannelLike, type MatchEvent, type MatchMode, type MatchRow, type MatchService, type PlayerHit, type SeatPresence } from '../net';
import { LogoLockup, Reveal, TitleColumn } from './Title';
import { TowerIcon } from './TowerIcon';

export interface MatchRun {
  level: LevelEntry;
  raceId: string;
  seed: string;
  match: ActiveMatch;
}

interface Props {
  defaultRace: string;
  defaultLevel: string;
  /** Pending invites for this player (online only). */
  invites: Invite[];
  onAcceptInvite(inviteId: number): Promise<void>;
  onDeclineInvite(inviteId: number): Promise<void>;
  /** A lobby code to join as soon as the screen opens (from an invite toast). */
  autoJoinCode?: string;
  onStart(run: MatchRun): void;
  onBack(): void;
}

const MODES: Array<{ id: MatchMode; name: string; blurb: string; available: boolean }> = [
  { id: 'parallel', name: 'Parallel race', blurb: 'Same level, same waves, your own board. Live standings; the best score among those left standing wins.', available: true },
  { id: 'mirror', name: 'Mirror', blurb: 'Parallel boards, and the sap you bank can send extra creeps into a rival’s lane. Every send pays you income on later waves.', available: true },
  { id: 'coop', name: 'Co-op', blurb: 'One board, one maze, a shared life pool. Each player owns their towers and wallet; the waves grow with the party.', available: true },
  { id: 'lanes', name: 'Lanes', blurb: 'One board with a lane per player; sends land in a random rival’s lane. 2v2 shares a team pool.', available: false },
  { id: 'king', name: 'King of the Maze', blurb: 'Teams defend bases on one board; the team that loses its base loses.', available: false },
];

const COUNTDOWN_MS = 3000;

type View = { kind: 'pick' } | { kind: 'lobby'; match: MatchRow; seat: number; host: boolean };

export function MultiplayerScreen({ defaultRace, defaultLevel, invites, onAcceptInvite, onDeclineInvite, autoJoinCode, onStart, onBack }: Props) {
  const auth = useAuth();
  const signedIn = auth.status === 'signed-in';
  const canPlayOnline = !online || signedIn;
  const userId = signedIn && auth.user ? auth.user.id : localUserId();
  const name = signedIn ? playerName(auth.profile, auth.user) : `Guest ${userId.slice(-4)}`;

  const [view, setView] = useState<View>({ kind: 'pick' });
  const [mode, setMode] = useState<MatchMode>('parallel');
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [levelId, setLevelId] = useState(defaultLevel);
  const [raceId, setRaceId] = useState(defaultRace);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState<SeatPresence[]>([]);
  const [ready, setReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteQuery, setInviteQuery] = useState('');
  const [hits, setHits] = useState<PlayerHit[] | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [inviteNote, setInviteNote] = useState<string | null>(null);

  const service = useRef<MatchService>(getMatchService(signedIn && auth.user ? auth.user.id : null));
  const channel = useRef<MatchChannelLike | null>(null);
  const started = useRef(false);
  const level = levels.find((l) => l.id === levelId) ?? levels[0];

  // Leaving the screen before a match starts closes the channel; a started match keeps it.
  useEffect(() => {
    return () => {
      if (!started.current) void channel.current?.close();
    };
  }, []);

  const beginCountdown = useCallback(
    (ev: Extract<MatchEvent, { type: 'start' }>, match: MatchRow, seat: number) => {
      if (started.current) return;
      started.current = true;
      const chosen = levels.find((l) => l.id === ev.levelId) ?? levels[0];
      const delay = Math.max(0, ev.startAt - Date.now());
      setCountdown(Math.ceil(delay / 1000));
      const tick = window.setInterval(() => setCountdown(Math.max(0, Math.ceil((ev.startAt - Date.now()) / 1000))), 250);
      window.setTimeout(() => {
        window.clearInterval(tick);
        const ch = channel.current!;
        const me = ch.presence().find((p) => p.userId === userId) ?? { userId, seat, name, raceId, ready: true };
        onStart({
          level: chosen,
          raceId: me.raceId,
          seed: ev.seed,
          match: { service: service.current, matchId: match.id, code: match.code, mode: match.mode, me, players: ch.presence(), host: match.host_user_id === userId, seats: ev.seats, party: ev.party, channel: ch },
        });
      }, delay);
    },
    [onStart, userId, name, raceId],
  );

  const enterLobby = useCallback(
    async (match: MatchRow, seat: number, host: boolean) => {
      const me: SeatPresence = { userId, seat, name, raceId, ready: false };
      const ch = service.current.channel(match.id, me);
      channel.current = ch;
      ch.onPresence((seats) => setPlayers(seats));
      ch.on((ev) => {
        if (ev.type === 'start') beginCountdown(ev, match, seat);
      });
      await ch.open();
      setView({ kind: 'lobby', match, seat, host });
    },
    [userId, name, raceId, beginCountdown],
  );

  const create = async () => {
    setError(null);
    setBusy(true);
    try {
      const { match, seat } = await service.current.create({ mode, maxPlayers, levelId: level.id, raceId, contentVersion: CONTENT_VERSION });
      await enterLobby(match, seat, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open a lobby.');
    } finally {
      setBusy(false);
    }
  };

  const joinByCode = useCallback(
    async (raw: string) => {
      const c = raw.trim().toUpperCase();
      if (c.length < 4) {
        setError('Enter the 6-character lobby code.');
        return;
      }
      setError(null);
      setBusy(true);
      try {
        const { match, seat } = await service.current.join(c, raceId);
        await enterLobby(match, seat, match.host_user_id === userId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not join that lobby.');
      } finally {
        setBusy(false);
      }
    },
    [raceId, enterLobby, userId],
  );

  const join = async (e: FormEvent) => {
    e.preventDefault();
    await joinByCode(code);
  };

  // Opened from an invite toast: go straight into that lobby.
  const autoJoined = useRef(false);
  useEffect(() => {
    if (autoJoinCode && !autoJoined.current) {
      autoJoined.current = true;
      void joinByCode(autoJoinCode);
    }
  }, [autoJoinCode, joinByCode]);

  const acceptInvite = async (inv: Invite) => {
    await onAcceptInvite(inv.invite_id);
    await joinByCode(inv.code);
  };

  const runSearch = async (e: FormEvent) => {
    e.preventDefault();
    const q = inviteQuery.trim();
    if (q.length < 2) {
      setInviteNote('Type at least two characters of a player name, or a full email.');
      return;
    }
    setInviteNote(null);
    try {
      const found = await searchPlayers(q);
      setHits(found);
      if (found.length === 0) setInviteNote(q.includes('@') ? 'No player with that exact email.' : 'No player name starts with that.');
    } catch (err) {
      setInviteNote(err instanceof Error ? err.message : 'Search failed.');
    }
  };

  const sendInvite = async (hit: PlayerHit) => {
    if (view.kind !== 'lobby') return;
    try {
      await invitePlayer(view.match.id, hit.user_id, name, view.match.code, view.match.mode, view.match.map_id);
      setInvited((prev) => new Set(prev).add(hit.user_id));
    } catch (err) {
      setInviteNote(err instanceof Error ? err.message : 'Could not invite.');
    }
  };

  const toggleReady = async () => {
    const next = !ready;
    setReady(next);
    await channel.current?.update({ ready: next });
  };

  const pickRace = async (id: string) => {
    setRaceId(id);
    await channel.current?.update({ raceId: id });
  };

  const start = async () => {
    if (view.kind !== 'lobby') return;
    setError(null);
    setBusy(true);
    try {
      await service.current.start(view.match.id);
      const ev: MatchEvent = { type: 'start', seed: view.match.seed, startAt: Date.now() + COUNTDOWN_MS, levelId: view.match.map_id, seats: view.match.max_players, party: Math.max(1, players.length) };
      channel.current?.send(ev);
      beginCountdown(ev, view.match, view.seat); // broadcast does not echo to the sender
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the match.');
      setBusy(false);
    }
  };

  const leave = async () => {
    await channel.current?.close();
    channel.current = null;
    setPlayers([]);
    setReady(false);
    setView({ kind: 'pick' });
  };

  const copyCode = () => {
    if (view.kind !== 'lobby') return;
    try {
      void navigator.clipboard?.writeText(view.match.code).then(() => setCopied(true));
    } catch {
      // clipboard unavailable; the code is on screen
    }
  };

  const panel = 'rounded-xl border border-grove-700/80 bg-grove-900/85 p-3 backdrop-blur-sm';
  const primary = 'rounded-lg bg-grove-500 px-4 py-3 font-semibold text-grove-950 hover:bg-grove-300 disabled:opacity-50';
  const secondary = 'rounded-lg border border-grove-700 px-4 py-3 text-grove-300 hover:bg-grove-800 disabled:opacity-50';

  if (!canPlayOnline) {
    return (
      <TitleColumn>
        <LogoLockup />
        <div className="flex-1" />
        <Reveal>
        <section className={panel}>
          <h2 className="text-xs uppercase tracking-wide text-grove-300/60">Multiplayer</h2>
          <p className="mt-2 text-sm text-grove-300/80">Online lobbies need an account so your rivals have a name to beat. Sign in and come back; guest play stays single-player.</p>
          <div className="mt-3 flex gap-2">
            <button onClick={auth.showSignIn} className={primary}>
              Sign in
            </button>
            <button onClick={onBack} className={secondary}>
              Back
            </button>
          </div>
        </section>
        </Reveal>
      </TitleColumn>
    );
  }

  if (view.kind === 'lobby') {
    const everyoneReady = players.length >= (service.current.kind === 'local' ? 1 : 2) && players.every((p) => p.ready);
    return (
      <TitleColumn>
        <LogoLockup />
        <div className="flex-1" />
        <Reveal>
        <section className={panel} aria-live="polite">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-xs uppercase tracking-wide text-grove-300/60">{MODES.find((m) => m.id === view.match.mode)?.name ?? view.match.mode} · lobby</h2>
            <span className="text-xs text-grove-300/60">{players.length} / {view.match.max_players} seated</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-grove-700 bg-grove-950/60 px-3 py-2">
            <span className="text-sm text-grove-300/70">
              Lobby code <span className="ml-1 font-mono text-lg tracking-[0.2em] text-sap">{view.match.code}</span>
            </span>
            <button onClick={copyCode} className="rounded-md border border-grove-700 px-2 py-1 text-xs text-grove-300 hover:bg-grove-800">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-1 text-xs text-grove-300/60">
            {levels.find((l) => l.id === view.match.map_id)?.map.name ?? view.match.map_id} · {view.match.mode === 'coop' ? 'one board, a wallet each' : 'same waves for everyone'}
            {service.current.kind === 'local' ? ' · local test: open this game in a second tab and join with the code' : ''}
          </p>

          <ul className="mt-3 flex flex-col gap-1.5" aria-label="Players">
            {players.map((p) => {
              const race = raceById(p.raceId);
              const starter = towersForRace(p.raceId)[0];
              return (
                <li key={p.userId} className="flex items-center gap-3 rounded-lg border border-grove-700 bg-grove-800/80 px-3 py-2">
                  {starter && <TowerIcon tower={starter} size={32} state="t1" />}
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-semibold">{p.name}</span>
                    {p.userId === userId && <span className="ml-1 text-xs text-grove-300/60">(you)</span>}
                    {p.seat === 0 && <span className="ml-1 text-xs text-grove-300/60">· host</span>}
                    <span className="block truncate text-xs text-grove-300/70">{race.name}</span>
                  </span>
                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase ${p.ready ? 'bg-grove-500/30 text-grove-300' : 'bg-grove-950/60 text-grove-300/50'}`}>{p.ready ? 'Ready' : 'Not ready'}</span>
                </li>
              );
            })}
            {players.length < view.match.max_players && <li className="rounded-lg border border-dashed border-grove-700 px-3 py-2 text-center text-xs text-grove-300/50">Waiting for a player to join with the code…</li>}
          </ul>

          {service.current.kind === 'supabase' && players.length < view.match.max_players && (
            <div className="mt-3 rounded-lg border border-grove-700 bg-grove-950/50 p-2">
              <form onSubmit={runSearch} noValidate className="flex gap-2">
                <label htmlFor="invite-query" className="sr-only">
                  Player name or email
                </label>
                <input id="invite-query" value={inviteQuery} onChange={(e) => setInviteQuery(e.target.value)} placeholder="Invite: player name or email" autoCapitalize="off" autoCorrect="off" spellCheck={false} className="min-w-0 flex-1 rounded-md border border-grove-700 bg-grove-950/80 px-3 py-1.5 text-sm" />
                <button type="submit" className="rounded-md border border-grove-500 px-3 py-1.5 text-sm font-semibold text-grove-300 hover:bg-grove-700">
                  Find
                </button>
              </form>
              {inviteNote && <p className="mt-1 text-xs text-grove-300/70">{inviteNote}</p>}
              {hits && hits.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-1" aria-label="Players found">
                  {hits.map((h) => (
                    <li key={h.user_id} className="flex items-center justify-between gap-2 rounded-md bg-grove-800/80 px-2 py-1 text-sm">
                      <span className="min-w-0 truncate">
                        {h.username ?? h.display_name ?? 'Player'}
                        {h.username && h.display_name && <span className="ml-1 text-xs text-grove-300/60">{h.display_name}</span>}
                      </span>
                      <button onClick={() => void sendInvite(h)} disabled={invited.has(h.user_id)} className="shrink-0 rounded-md bg-grove-500 px-2 py-0.5 text-xs font-semibold text-grove-950 hover:bg-grove-300 disabled:opacity-60">
                        {invited.has(h.user_id) ? 'Invited' : 'Invite'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <h3 className="mt-3 text-xs uppercase tracking-wide text-grove-300/60">Your race</h3>
          <div className="mt-1 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Race">
            {content.races.map((r) => {
              const starter = towersForRace(r.id)[0];
              const active = r.id === raceId;
              return (
                <button key={r.id} role="radio" aria-checked={active} disabled={ready} onClick={() => void pickRace(r.id)} className={`flex flex-col items-center rounded-lg border px-1 py-1.5 disabled:opacity-60 ${active ? 'border-sap bg-grove-700' : 'border-grove-700 bg-grove-800/80 hover:bg-grove-700'}`}>
                  {starter && <TowerIcon tower={starter} size={32} state="t1" />}
                  <span className="mt-1 w-full truncate text-center text-[10px] font-semibold">{r.name}</span>
                </button>
              );
            })}
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded-md border border-rust/50 bg-rust/15 px-3 py-2 text-sm text-amber-200">
              {error}
            </p>
          )}

          {countdown !== null ? (
            <p className="mt-3 text-center text-lg font-semibold text-sap" role="status">
              Starting in {countdown}…
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => void toggleReady()} className={ready ? secondary : primary}>
                {ready ? 'Not ready' : 'Ready'}
              </button>
              {view.host ? (
                <button onClick={() => void start()} disabled={!everyoneReady || busy} className={primary} title={everyoneReady ? 'Start the match' : 'Everyone must be ready'}>
                  Start
                </button>
              ) : (
                <span className="self-center text-center text-xs text-grove-300/60">The host starts when everyone is ready</span>
              )}
              <button onClick={() => void leave()} className={`${secondary} col-span-2`}>
                Leave lobby
              </button>
            </div>
          )}
        </section>
        </Reveal>
      </TitleColumn>
    );
  }

  return (
    <TitleColumn>
      <LogoLockup />
      <div className="flex-1" />
      <Reveal>
      <section className={panel}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs uppercase tracking-wide text-grove-300/60">Multiplayer</h2>
          <span className="text-xs text-grove-300/60">{service.current.kind === 'local' ? 'Local test (same browser)' : `Playing as ${name}`}</span>
        </div>
        {invites.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1.5" aria-label="Invites">
            {invites.map((inv) => (
              <li key={inv.invite_id} className="flex items-center justify-between gap-2 rounded-lg border border-sap/60 bg-grove-800/80 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">
                    <span className="font-semibold">{inv.from_name}</span> invited you · {MODES.find((m) => m.id === inv.mode)?.name ?? inv.mode}
                  </span>
                  <span className="block truncate text-xs text-grove-300/70">
                    {levels.find((l) => l.id === inv.map_id)?.map.name ?? inv.map_id} · {inv.seated} / {inv.max_players} seated · code {inv.code}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <button onClick={() => void acceptInvite(inv)} disabled={busy} className="rounded-md bg-grove-500 px-2 py-1 text-xs font-semibold text-grove-950 hover:bg-grove-300">
                    Join
                  </button>
                  <button onClick={() => void onDeclineInvite(inv.invite_id)} className="rounded-md border border-grove-700 px-2 py-1 text-xs text-grove-300 hover:bg-grove-800">
                    Ignore
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-col gap-1.5" role="radiogroup" aria-label="Mode">
          {MODES.map((m) => {
            const active = m.id === mode;
            return (
              <button key={m.id} role="radio" aria-checked={active} disabled={!m.available} onClick={() => setMode(m.id)} className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-left disabled:opacity-50 ${active ? 'border-sap bg-grove-700' : 'border-grove-700 bg-grove-800/80 hover:bg-grove-700'}`}>
                <span className="min-w-0">
                  <span className="block font-semibold">{m.name}</span>
                  <span className="block text-xs text-grove-300/70">{m.blurb}</span>
                </span>
                {!m.available && <span className="shrink-0 rounded-md bg-grove-950/60 px-2 py-0.5 text-[11px] font-semibold uppercase text-grove-300/60">Soon</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-grove-300/60">Level (host picks)</span>
            <select value={levelId} onChange={(e) => setLevelId(e.target.value)} className="rounded-md border border-grove-700 bg-grove-950/80 px-2 py-2">
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.map.name} · {l.map.difficulty}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-grove-300/60">Players</span>
            <select value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))} className="rounded-md border border-grove-700 bg-grove-950/80 px-2 py-2">
              {[2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-md border border-rust/50 bg-rust/15 px-3 py-2 text-sm text-amber-200">
            {error}
          </p>
        )}

        <button onClick={() => void create()} disabled={busy} className={`${primary} mt-3 w-full`}>
          {busy ? 'Opening…' : 'Create lobby'}
        </button>
        <form onSubmit={join} noValidate className="mt-2 flex gap-2">
          <input id="lobby-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Lobby code" maxLength={6} autoCapitalize="characters" autoCorrect="off" spellCheck={false} className="min-w-0 flex-1 rounded-md border border-grove-700 bg-grove-950/80 px-3 py-2 font-mono text-base tracking-[0.2em]" />
          <button type="submit" disabled={busy} className={secondary}>
            Join
          </button>
        </form>
        <button onClick={onBack} className="mt-3 w-full text-xs text-grove-300/80 underline-offset-2 hover:underline">
          Back to the menu
        </button>
      </section>
      </Reveal>
    </TitleColumn>
  );
}
