// Extra Terram — src/ui/MultiplayerScreen.tsx v0.7.0 — opens straight into a rematch lobby (autoHost); mode icons, race emblems in the picker and on lobby seats
// Parallel race: everyone plays the same level and waves on their own board; live standings; the
// best score among those left standing wins. Mirror: the same, plus sends. Co-op: one shared board
// in lockstep, a wallet each, a shared life pool. Lanes: one board, a lane per player (or two per
// team), sends into rivals' lanes, last standing wins. King of the Maze: one shared trail forking to a
// base per player (or per team), last base standing wins.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { CONTENT_VERSION, content, levelById, levels, raceById, towersForRace, versusMapsFor, type LevelEntry } from '../content';
import { getMatchService, invitePlayer, localUserId, online, playerName, searchPlayers, useAuth, type ActiveMatch, type Invite, type MatchChannelLike, type MatchEvent, type MatchMode, type MatchRow, type MatchService, type PlayerHit, type SeatPresence } from '../net';
import { resolveRules, sanitizeRules, type RulePick } from '../app/rules';
import type { RunRules } from '../engine';
import { seatColor } from '../render/seats';
import { mapStripUrl } from './Menu';
import { RulesPicker, RulesSummary } from './RulesPicker';
import { LogoLockup, Reveal, TitleColumn } from './Title';
import { TowerIcon } from './TowerIcon';
import { UiIcon, emblemIcon, modeIcon } from './UiIcon';

export interface MatchRun {
  level: LevelEntry;
  raceId: string;
  seed: string;
  match: ActiveMatch;
}

interface Props {
  defaultRace: string;
  defaultLevel: string;
  /** The rules a host starts from (the last ones picked); changes are reported through onRulesChange. */
  defaultRules: RulePick;
  onRulesChange(pick: RulePick): void;
  /** Pending invites for this player (online only). */
  invites: Invite[];
  onAcceptInvite(inviteId: number): Promise<void>;
  onDeclineInvite(inviteId: number): Promise<void>;
  /** A lobby code to join as soon as the screen opens (from an invite toast, or a rival's rematch). */
  autoJoinCode?: string;
  /** A lobby already created for this player (the host of a rematch): entered as soon as the screen opens. */
  autoHost?: { match: MatchRow; seat: number };
  onStart(run: MatchRun): void;
  onBack(): void;
}

const MODES: Array<{ id: MatchMode; name: string; blurb: string; available: boolean }> = [
  { id: 'parallel', name: 'Parallel race', blurb: 'Same level, same waves, your own board. Live standings; the best score among those left standing wins.', available: true },
  { id: 'mirror', name: 'Mirror', blurb: 'Parallel boards, and the money you bank can send extra creeps into a rival’s lane. Every send pays you income on later waves.', available: true },
  { id: 'coop', name: 'Co-op', blurb: 'One board, one maze, a shared life pool. Each player owns their towers and wallet; the waves grow with the party.', available: true },
  { id: 'lanes', name: 'Lanes', blurb: 'One board, a lane each, the same waves down every lane. Spend to send creeps into a rival’s lane; the last one standing wins. 2 v 2 shares a life pool.', available: true },
  { id: 'king', name: 'King of the Maze', blurb: 'One trail that forks to a base for each player (or team). Towers on the shared trail help everyone; your fork is yours alone. The last base standing wins.', available: true },
];

const VERSUS = (m: MatchMode): m is 'lanes' | 'king' => m === 'lanes' || m === 'king';

/** What a seat defends on a versus board: "Lane 2", "Base 1" (2 v 2: the team's). */
function seatRole(mode: MatchMode, teams: boolean, seat: number): string | null {
  if (mode === 'lanes') return `Lane ${(teams ? (seat % 2) * 2 + Math.floor(seat / 2) : seat) + 1}`;
  if (mode === 'king') return `Base ${(teams ? seat % 2 : seat) + 1}`;
  return null;
}

const COUNTDOWN_MS = 3000;

type View = { kind: 'pick' } | { kind: 'lobby'; match: MatchRow; seat: number; host: boolean };

/** The rules a host's picks make for a lobby: difficulty is a co-op option only. */
function lobbyRules(pick: RulePick, level: LevelEntry, mode: MatchMode): RunRules {
  return resolveRules(mode === 'coop' ? pick : { ...pick, difficulty: 0 }, level);
}

export function MultiplayerScreen({ defaultRace, defaultLevel, defaultRules, onRulesChange, invites, onAcceptInvite, onDeclineInvite, autoJoinCode, autoHost, onStart, onBack }: Props) {
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
  const [pick, setPick] = useState<RulePick>(defaultRules);
  const [rulesNote, setRulesNote] = useState<string | null>(null);
  const [teams, setTeams] = useState(false);

  const service = useRef<MatchService>(getMatchService(signedIn && auth.user ? auth.user.id : null));
  const channel = useRef<MatchChannelLike | null>(null);
  const started = useRef(false);
  // versus modes play their own maps: one with a lane or base for every player (two bases for 2 v 2 King)
  const teamMode = VERSUS(mode) && maxPlayers === 4 && teams;
  const versusChoices = VERSUS(mode) ? versusMapsFor(mode, maxPlayers, teamMode) : [];
  const level = VERSUS(mode) ? (versusChoices.find((l) => l.id === levelId) ?? versusChoices[0] ?? levels[0]) : (levels.find((l) => l.id === levelId) ?? levels[0]);

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
      const chosen = levelById(ev.levelId) ?? levels[0];
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
          match: {
            service: service.current,
            matchId: match.id,
            code: match.code,
            mode: match.mode,
            me,
            players: ch.presence(),
            host: match.host_user_id === userId,
            seats: ev.seats,
            party: ev.party,
            rules: sanitizeRules(ev.rules) ?? resolveRules(undefined, chosen),
            teams: !!ev.teams,
            present: Array.isArray(ev.present) ? ev.present.filter((n) => Number.isInteger(n)) : undefined,
            channel: ch,
            maxPlayers: match.max_players,
            levelId: match.map_id,
          },
        });
      }, delay);
    },
    [onStart, userId, name, raceId],
  );

  const enterLobby = useCallback(
    async (match: MatchRow, seat: number, host: boolean) => {
      const lobbyLevel = levelById(match.map_id) ?? levels[0];
      const me: SeatPresence = { userId, seat, name, raceId, ready: false, ...(host ? { rules: lobbyRules(pick, lobbyLevel, match.mode) } : {}) };
      const ch = service.current.channel(match.id, me);
      channel.current = ch;
      ch.onPresence((seats) => setPlayers(seats));
      ch.on((ev) => {
        if (ev.type === 'start') beginCountdown(ev, match, seat);
      });
      await ch.open();
      setView({ kind: 'lobby', match, seat, host });
    },
    [userId, name, raceId, beginCountdown, pick],
  );

  const create = async () => {
    setError(null);
    setBusy(true);
    try {
      if (VERSUS(mode) && !versusChoices.length) throw new Error('No map for that many players yet.');
      const { match, seat } = await service.current.create({ mode, maxPlayers, teamMode, levelId: level.id, raceId, contentVersion: CONTENT_VERSION });
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
        // Same level ids can hold different maps across versions (the solo layouts changed in 0.8.0):
        // a board built from other content would drift from the host's, so both sides must match.
        if (match.content_version && match.content_version !== CONTENT_VERSION) {
          throw new Error(`That lobby runs another version of the game (content ${match.content_version}; yours is ${CONTENT_VERSION}). Both players need the latest: reload the game, then join again with the same code.`);
        }
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

  // Opened from an invite toast or a rematch: go straight into that lobby (the host of a rematch already holds it).
  const autoJoined = useRef(false);
  useEffect(() => {
    if (autoJoined.current) return;
    if (autoHost) {
      autoJoined.current = true;
      setMode(autoHost.match.mode);
      setMaxPlayers(autoHost.match.max_players);
      setLevelId(autoHost.match.map_id);
      setTeams(!!autoHost.match.team_mode);
      void enterLobby(autoHost.match, autoHost.seat, true).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not open the rematch lobby.'));
    } else if (autoJoinCode) {
      autoJoined.current = true;
      void joinByCode(autoJoinCode);
    }
  }, [autoJoinCode, autoHost, joinByCode, enterLobby]);

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
      const lobbyLevel = levelById(view.match.map_id) ?? levels[0];
      const ev: MatchEvent = {
        type: 'start',
        seed: view.match.seed,
        startAt: Date.now() + COUNTDOWN_MS,
        levelId: view.match.map_id,
        seats: view.match.max_players,
        party: Math.max(1, players.length),
        rules: lobbyRules(pick, lobbyLevel, view.match.mode),
        // versus boards: who is actually here (an empty seat's lane or base stays closed), and 2 v 2
        present: players.map((p) => p.seat).sort((a, b) => a - b),
        teams: !!view.match.team_mode,
      };
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
    setRulesNote(null);
    setView({ kind: 'pick' });
  };

  /** Host: new rules go to everyone at once through presence. */
  const changeRules = async (next: RulePick) => {
    if (view.kind !== 'lobby' || !view.host) return;
    setPick(next);
    onRulesChange(next);
    const lobbyLevel = levelById(view.match.map_id) ?? levels[0];
    await channel.current?.update({ rules: lobbyRules(next, lobbyLevel, view.match.mode) });
  };

  const copyCode = () => {
    if (view.kind !== 'lobby') return;
    try {
      void navigator.clipboard?.writeText(view.match.code).then(() => setCopied(true));
    } catch {
      // clipboard unavailable; the code is on screen
    }
  };

  // Joiners: the host's rules, live. A change after you pressed Ready takes the Ready back, so nobody
  // starts a 100-round Brutal run they did not see coming.
  const hostRules = view.kind === 'lobby' ? sanitizeRules(players.find((p) => p.seat === 0)?.rules) : null;
  const hostRulesKey = hostRules ? `${hostRules.rounds}/${hostRules.bossEvery}/${hostRules.difficulty}` : '';
  const seenRulesKey = useRef('');
  useEffect(() => {
    if (view.kind !== 'lobby') {
      seenRulesKey.current = ''; // a new lobby starts fresh
      return;
    }
    if (view.host || !hostRulesKey) return;
    const prev = seenRulesKey.current;
    seenRulesKey.current = hostRulesKey;
    if (!prev || prev === hostRulesKey) return;
    if (ready) {
      setReady(false);
      void channel.current?.update({ ready: false });
      setRulesNote('The host changed the rules: have a look, then press Ready again.');
    } else {
      setRulesNote('The host changed the rules.');
    }
  }, [hostRulesKey, view, ready]);

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
    const versus = VERSUS(view.match.mode);
    const lobbyTeams = versus && !!view.match.team_mode;
    // 2 v 2 needs all four; other versus boards at least two (one player alone tries it out on the local transport)
    const enoughPlayers = lobbyTeams ? players.length === view.match.max_players : players.length >= (service.current.kind === 'local' ? 1 : 2);
    const everyoneReady = enoughPlayers && players.every((p) => p.ready);
    const lobbyLevel = levelById(view.match.map_id) ?? levels[0];
    const modeLine =
      view.match.mode === 'coop'
        ? 'one board, a wallet each'
        : view.match.mode === 'lanes'
          ? lobbyTeams
            ? 'a lane each, 2 v 2: seats 1 and 3 against 2 and 4'
            : 'a lane each, the same waves down every lane'
          : view.match.mode === 'king'
            ? lobbyTeams
              ? 'a base per team, 2 v 2: seats 1 and 3 against 2 and 4'
              : 'one trail forking to a base each'
            : 'same waves for everyone';
    return (
      <TitleColumn>
        <LogoLockup />
        <div className="flex-1" />
        <Reveal>
        <section className={panel} aria-live="polite">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-grove-300/60">
              <UiIcon name={modeIcon(view.match.mode)} size={16} />
              {MODES.find((m) => m.id === view.match.mode)?.name ?? view.match.mode}
              {lobbyTeams ? ' · 2 v 2' : ''} · lobby
            </h2>
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
            {lobbyLevel.map.name} · {modeLine}
            {service.current.kind === 'local' ? ' · local test: open this game in a second tab and join with the code' : ''}
          </p>

          <ul className="mt-3 flex flex-col gap-1.5" aria-label="Players">
            {players.map((p) => {
              const race = raceById(p.raceId);
              const starter = towersForRace(p.raceId)[0];
              return (
                <li key={p.userId} className="flex items-center gap-3 rounded-lg border border-grove-700 bg-grove-800/80 px-3 py-2">
                  <UiIcon name={emblemIcon(p.raceId)} size={32} alt={race.name} fallback={starter && <TowerIcon tower={starter} size={32} state="t1" />} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-semibold">{p.name}</span>
                    {p.userId === userId && <span className="ml-1 text-xs text-grove-300/60">(you)</span>}
                    {p.seat === 0 && <span className="ml-1 text-xs text-grove-300/60">· host</span>}
                    <span className="block truncate text-xs text-grove-300/70">
                      {race.name}
                      {versus && (
                        <>
                          {' · '}
                          <span className="font-semibold" style={{ color: seatColor(lobbyTeams ? p.seat % 2 : p.seat) }}>
                            {lobbyTeams ? `Team ${(p.seat % 2) + 1} · ` : ''}
                            {seatRole(view.match.mode, lobbyTeams, p.seat)}
                          </span>
                        </>
                      )}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase ${p.ready ? 'bg-grove-500/30 text-grove-300' : 'bg-grove-950/60 text-grove-300/50'}`}>{p.ready ? 'Ready' : 'Not ready'}</span>
                </li>
              );
            })}
            {players.length < view.match.max_players && (
              <li className="rounded-lg border border-dashed border-grove-700 px-3 py-2 text-center text-xs text-grove-300/50">
                {lobbyTeams ? `2 v 2 starts with all four seated: waiting for ${view.match.max_players - players.length} more…` : versus ? 'Waiting for a player to join with the code… an empty seat’s lane or base stays closed.' : 'Waiting for a player to join with the code…'}
              </li>
            )}
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

          {view.host ? (
            <RulesPicker level={lobbyLevel} pick={pick} onChange={(next) => void changeRules(next)} difficulty={view.match.mode === 'coop'} disabled={countdown !== null} />
          ) : (
            <RulesSummary level={lobbyLevel} rules={hostRules} />
          )}
          {rulesNote && !view.host && (
            <p className="mt-1 text-xs text-amber-200/90" role="status">
              {rulesNote}
            </p>
          )}

          <h3 className="mt-3 text-xs uppercase tracking-wide text-grove-300/60">Your race</h3>
          <div className="mt-1 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Race">
            {content.races.map((r) => {
              const starter = towersForRace(r.id)[0];
              const active = r.id === raceId;
              return (
                <button key={r.id} role="radio" aria-checked={active} disabled={ready} onClick={() => void pickRace(r.id)} className={`flex flex-col items-center rounded-lg border px-1 py-1.5 disabled:opacity-60 ${active ? 'border-sap bg-grove-700' : 'border-grove-700 bg-grove-800/80 hover:bg-grove-700'}`}>
                  <UiIcon name={emblemIcon(r.id)} size={32} fallback={starter && <TowerIcon tower={starter} size={32} state="t1" />} />
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
                    <span className="font-semibold">{inv.from_name}</span> invited you · <UiIcon name={modeIcon(inv.mode)} size={14} className="mr-0.5 align-[-0.15em]" />
                    {MODES.find((m) => m.id === inv.mode)?.name ?? inv.mode}
                  </span>
                  <span className="block truncate text-xs text-grove-300/70">
                    {levelById(inv.map_id)?.map.name ?? inv.map_id} · {inv.seated} / {inv.max_players} seated · code {inv.code}
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
                <UiIcon name={modeIcon(m.id)} size={32} className="mt-0.5" />
                <span className="min-w-0 flex-1">
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
            <span className="text-xs text-grove-300/60">{VERSUS(mode) ? 'Map (host picks)' : 'Level (host picks)'}</span>
            <select value={level.id} onChange={(e) => setLevelId(e.target.value)} className="rounded-md border border-grove-700 bg-grove-950/80 px-2 py-2">
              {(VERSUS(mode) ? versusChoices : levels).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.map.name} · {VERSUS(mode) ? (mode === 'lanes' ? `${l.map.slots} lanes` : `${l.map.slots} bases`) : l.map.difficulty}
                </option>
              ))}
            </select>
            <span className="h-12 w-full rounded-md border border-grove-800 bg-cover bg-center" style={{ backgroundImage: `url(${mapStripUrl(level.id)})` }} aria-hidden="true" />
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
        {VERSUS(mode) && maxPlayers === 4 && (
          <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-grove-700 bg-grove-950/50 px-3 py-2 text-sm">
            <span>
              <span className="block font-semibold">2 v 2 teams</span>
              <span className="block text-xs text-grove-300/70">{mode === 'lanes' ? 'Seats 1 and 3 against 2 and 4: neighbouring lanes, one life pool per team.' : 'Seats 1 and 3 against 2 and 4: one base per team, built up together.'}</span>
            </span>
            <input type="checkbox" checked={teams} onChange={(e) => setTeams(e.target.checked)} className="h-5 w-5 accent-grove-500" />
          </label>
        )}
        {VERSUS(mode) && (
          <p className="mt-2 text-xs text-grove-300/70">
            {mode === 'lanes'
              ? 'Your towers guard only your lane (and a teammate’s). Waves come on the clock; spend on sends to push a rival over.'
              : 'Creeps take the bases in turn and wear the colour of the one they are after. A base that falls is out.'}
          </p>
        )}

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
