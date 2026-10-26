// Extra Terram — src/app/GameShell.tsx v0.12.0 — each race's own currency in the HUD, shop, panel, confirm bar and messages
// Owns one run: sim state (in a holder, never React state), the Pixi renderer, the loop, and the
// pointer handling on the canvas. React only sees a 10 Hz snapshot for the HUD.
// On a shared board the sim is driven by the Lockstep: inputs are submitted, not applied, and a
// client only steps while it holds the host's next frame.
import { useCallback, useEffect, useRef, useState } from 'react';
import { content, currencyLabel, currencyOf, towersForRace, type LevelEntry } from '../content';
import {
  applyInput,
  createContext,
  createSim,
  effectiveStats,
  hashState,
  isAnimating,
  passiveFor,
  sellValue,
  sendableCreeps,
  simView,
  stepSim,
  tileAt,
  TILE,
  towerAt,
  towerCost,
  upgradeCost,
  validateInput,
  type CreepDef,
  type LoggedInput,
  type SimContext,
  type SimInput,
  type SimResult,
  type SimState,
  type SimView,
  type Tower,
} from '../engine';
import { rankStandings, type ActiveMatch, type MatchEvent, type Standing } from '../net';
import { PixiRenderer } from '../render/PixiRenderer';
import type { Cell, RenderOverlay } from '../render/renderer';
import { BuildBar } from '../ui/BuildBar';
import { Hud } from '../ui/Hud';
import { HowToPlay } from '../ui/HowToPlay';
import { PauseOverlay, ResultOverlay } from '../ui/Overlays';
import { RivalsBar } from '../ui/RivalsBar';
import { SendBar } from '../ui/SendBar';
import { TeamBar } from '../ui/TeamBar';
import { TowerPanel, type SelectedTower } from '../ui/TowerPanel';
import type { SaveStatus } from './App';
import { Lockstep, type SimHolder } from './lockstep';
import { GameLoop } from './loop';
import { confirmBuildOn, type Settings } from './settings';

interface Props {
  level: LevelEntry;
  raceId: string;
  seed: string;
  settings: Settings;
  saveStatus: SaveStatus;
  signedIn: boolean;
  /** Present during an online match: the live channel, the seats and the mode. */
  match?: ActiveMatch;
  /** Called exactly once, when the run ends, with the result and the input log for replay/verification. */
  onResult(result: SimResult, view: SimView, inputLog: LoggedInput[]): void;
  onExit(): void;
  onReplay(): void;
  onNewSeed(): void;
}

interface Game extends SimHolder {
  renderer: PixiRenderer;
  loop: GameLoop;
  lock: Lockstep | null;
}

const SNAPSHOT_MS = 100; // 10 Hz: the HUD updates at human speed

export function GameShell({ level, raceId, seed, settings, saveStatus, signedIn, match, onResult, onExit, onReplay, onNewSeed }: Props) {
  const roster = useRef(towersForRace(raceId)).current;
  const currency = currencyOf(raceId);
  const reported = useRef(false);
  const shared = match?.mode === 'coop'; // one board for everyone, in lockstep
  const mirrored = match?.mode === 'mirror'; // own boards, with sends
  const mySeat = shared && match ? match.me.seat : 0;
  const [standings, setStandings] = useState<Standing[]>(() => (match && !shared ? initialStandings(match) : []));
  const standingsRef = useRef(standings);
  standingsRef.current = standings;
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game | null>(null);
  const overlay = useRef<RenderOverlay>({ hover: null, placing: null, selected: null, showPads: settings.showPads, seat: mySeat, pending: null, padPick: null });
  const confirmBuild = confirmBuildOn(settings);

  const [view, setView] = useState<SimView | null>(null);
  const [selected, setSelected] = useState<SelectedTower | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const [pending, setPending] = useState<Cell | null>(null); // a pad waiting for Build (confirm step)
  const [padPick, setPadPick] = useState<Cell | null>(null); // a pad tapped before a tower was chosen
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [footer, setFooter] = useState<'build' | 'send'>('build');
  const [waiting, setWaiting] = useState(false);
  const [hostGone, setHostGone] = useState(false);
  const [howTo, setHowTo] = useState(false);
  const [towersBySeat, setTowersBySeat] = useState<Record<number, number>>({});
  const toastTimer = useRef<number | null>(null);

  const ctx = useRef<SimContext>(createContext(content, level.map, level.waves)).current;
  const costs = useRef<Record<string, number>>(Object.fromEntries(roster.map((t) => [t.id, towerCost(ctx, t)]))).current;
  const sendRoster = useRef<CreepDef[]>(mirrored ? sendableCreeps(ctx, raceId) : []).current;

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1600);
  }, []);

  /** A refused input, in words: money refusals name this race's currency. */
  const refusal = useCallback((res: { reason: string; need?: number }) => (res.need !== undefined ? `Needs ${res.need} ${currency}.` : res.reason), [currency]);

  // ---------------------------------------------------------------- lifecycle
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let cancelled = false;

    const sim: SimHolder = {
      state: createSim(ctx, seed, shared && match ? { seats: match.seats, party: match.party, coop: true } : {}),
      ctx,
    };
    const renderer = new PixiRenderer();
    const hashes = new Map<number, string>();
    const lock = shared && match ? new Lockstep(sim, match.channel, { seat: match.me.seat, userId: match.me.userId }, match.host, { onReject: (reason, need) => showToast(need !== undefined ? `Needs ${need} ${currency}.` : reason), onResync: () => showToast('Board resynced with the host.') }) : null;
    const loop = new GameLoop({
      step: () => {
        if (lock) {
          if (!lock.host) loop.speed = lock.clientSpeed();
          if (!lock.canStep(performance.now())) return false;
          lock.beforeStep();
        }
        stepSim(sim.state, ctx);
        if (sim.state.events.length) renderer.pushEvents(sim.state.events, ctx, sim.state);
        if (lock && sim.state.tick % 20 === 0) {
          // shared board: remember recent hashes so a test (or a bug report) can compare two boards at the same tick
          hashes.set(sim.state.tick, hashState(sim.state));
          if (hashes.size > 16) hashes.delete(hashes.keys().next().value!);
        }
        return true;
      },
      render: (alpha) => renderer.draw({ state: sim.state, ctx, alpha, overlay: overlay.current }),
      isAnimating: () => isAnimating(sim.state),
      hasIdleAnimation: () => renderer.hasIdleAnimation(),
      onAutoPause: () => setPaused(true),
    });
    loop.maxFps = settings.batterySaver ? 30 : 60;
    loop.idleFps = settings.batterySaver ? 0 : 10; // saver: towers hold still between waves

    renderer
      .mount(canvas, host.clientWidth, host.clientHeight, ctx)
      .then(() => {
        if (cancelled) {
          renderer.destroy();
          return;
        }
        // the holder and the game record are one object, so a resync that swaps `sim.state` reaches the loop and the HUD
        game.current = Object.assign(sim, { renderer, loop, lock }) as Game;
        renderer.setEffectsScale(settings.batterySaver ? 0.5 : 1);
        loop.start();
        setView(simView(sim.state, ctx, mySeat));
      })
      .catch((err: unknown) => {
        console.error('Renderer failed to start', err);
        showToast('The renderer could not start on this device.');
      });

    const resize = new ResizeObserver(() => {
      renderer.resize(host.clientWidth, host.clientHeight);
      loop.dirty = true;
    });
    resize.observe(host);

    // A read-only handle for headless tests (two tabs comparing boards): never used by the game.
    const dbg = window as unknown as { __et?: { tick(): number; hash(): string; hashes(): Record<number, string>; towers(): number; wallets(): number[]; creeps(): number } };
    dbg.__et = {
      hashes: () => Object.fromEntries(hashes),
      tick: () => sim.state.tick,
      hash: () => hashState(sim.state),
      towers: () => sim.state.towers.length,
      wallets: () => sim.state.wallets.slice(),
      creeps: () => sim.state.creeps.length,
    };

    const snapshot = window.setInterval(() => {
      const g = game.current;
      if (!g) return;
      setView(simView(g.state, g.ctx, mySeat));
      if (g.lock) {
        setWaiting(g.lock.stalled(performance.now()));
        if (!g.lock.host) setSpeed(g.lock.hostSpeed);
        const counts: Record<number, number> = {};
        for (const t of g.state.towers) counts[t.owner] = (counts[t.owner] ?? 0) + 1;
        setTowersBySeat(counts);
      }
      const id = overlay.current.selected;
      if (id !== null) {
        const tower = g.state.towers.find((t) => t.id === id);
        if (!tower) {
          overlay.current.selected = null;
          setSelected(null);
          loop.dirty = true;
        } else {
          setSelected(describeTower(g.ctx, g.state, tower, mySeat, match));
        }
      }
    }, SNAPSHOT_MS);

    return () => {
      cancelled = true;
      window.clearInterval(snapshot);
      resize.disconnect();
      loop.stop();
      lock?.close();
      renderer.destroy();
      game.current = null;
      delete dbg.__et;
    };
    // The shell is keyed by level+seed in App, so a new run always remounts; settings apply at mount.
  }, [ctx, seed, settings.batterySaver, showToast, shared, match, mySeat]);

  // ---------------------------------------------------------------- input helpers
  /** Our seat's input: applied at once on our own board, or handed to the lockstep on a shared one. */
  const send = useCallback(
    (input: SimInput): boolean => {
      const g = game.current;
      if (!g) return false;
      const res = g.lock ? g.lock.submit(input) : applyInput(g.state, g.ctx, input, 0);
      if (!res.ok) showToast(refusal(res));
      g.loop.dirty = true;
      if (!g.lock) setView(simView(g.state, g.ctx, 0));
      return res.ok;
    },
    [showToast, refusal],
  );

  const select = useCallback(
    (id: number | null) => {
      overlay.current.selected = id;
      const g = game.current;
      if (g) g.loop.dirty = true;
      if (id === null || !g) {
        setSelected(null);
        return;
      }
      const tower = g.state.towers.find((t) => t.id === id);
      setSelected(tower ? describeTower(g.ctx, g.state, tower, mySeat, match) : null);
    },
    [mySeat, match],
  );

  const setPendingCell = useCallback((cell: Cell | null) => {
    overlay.current.pending = cell;
    setPending(cell);
    const g = game.current;
    if (g) g.loop.dirty = true;
  }, []);

  const setPadPickCell = useCallback((cell: Cell | null) => {
    overlay.current.padPick = cell;
    setPadPick(cell);
    const g = game.current;
    if (g) g.loop.dirty = true;
  }, []);

  /** Build `towerId` on `cell` now (the confirm step is over, or there is none). */
  const build = useCallback(
    (towerId: string, cell: Cell): boolean => {
      const ok = send({ type: 'place', tower: towerId, col: cell.col, row: cell.row });
      if (ok) setPendingCell(null);
      return ok;
    },
    [send, setPendingCell],
  );

  const startPlacing = useCallback(
    (towerId: string | null) => {
      const next = placing === towerId ? null : towerId;
      overlay.current.placing = next;
      setPlacing(next);
      const g = game.current;
      if (g) g.loop.dirty = true;
      if (!next) {
        setPendingCell(null);
        return;
      }
      select(null);
      // a pad was chosen first: with the confirm step the ghost moves there, without it the tower is planted
      if (padPick) {
        const cell = padPick;
        setPadPickCell(null);
        if (confirmBuild) {
          const check = g ? validateInput(g.state, g.ctx, { type: 'place', tower: next, col: cell.col, row: cell.row }, mySeat) : null;
          if (check && !check.ok) showToast(refusal(check));
          else setPendingCell(cell);
        } else {
          build(next, cell);
        }
      }
    },
    [placing, select, padPick, confirmBuild, mySeat, build, setPendingCell, setPadPickCell, showToast, refusal],
  );

  const hostControls = !shared || !!match?.host; // on a shared board only the host pauses or changes speed

  const togglePause = useCallback(() => {
    const g = game.current;
    if (!g || !hostControls) return;
    g.loop.paused = !g.loop.paused;
    setPaused(g.loop.paused);
  }, [hostControls]);

  const changeSpeed = useCallback(
    (n: number) => {
      const g = game.current;
      if (!g || !hostControls) return;
      g.loop.speed = n;
      if (g.lock) g.lock.hostSpeed = n;
      setSpeed(n);
    },
    [hostControls],
  );

  // ---------------------------------------------------------------- pointer
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = game.current;
    if (!g) return;
    const cell = g.renderer.screenToCell(e.clientX, e.clientY);
    const prev = overlay.current.hover;
    if ((prev?.col ?? -1) !== (cell?.col ?? -1) || (prev?.row ?? -1) !== (cell?.row ?? -1)) {
      overlay.current.hover = cell;
      g.loop.dirty = true;
    }
  };

  const onPointerLeave = () => {
    const g = game.current;
    if (!g) return;
    overlay.current.hover = null;
    g.loop.dirty = true;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = game.current;
    if (!g) return;
    const cell = g.renderer.screenToCell(e.clientX, e.clientY);
    overlay.current.hover = cell;
    g.loop.dirty = true;
    if (!cell) return;
    if (placing) {
      if (!confirmBuild) {
        build(placing, cell);
        return;
      }
      // confirm step: the first tap parks the ghost on the pad, a second tap on the same pad (or Build) plants it
      if (pending && pending.col === cell.col && pending.row === cell.row) {
        build(placing, cell);
        return;
      }
      const check = validateInput(g.state, g.ctx, { type: 'place', tower: placing, col: cell.col, row: cell.row }, mySeat);
      if (!check.ok) {
        showToast(refusal(check));
        return;
      }
      setPendingCell(cell);
      return;
    }
    const tower = towerAt(g.state, cell.col, cell.row);
    if (tower) {
      setPadPickCell(null);
      select(tower.id);
      return;
    }
    select(null);
    // an empty pad with no tower chosen: remember it, the shop picks the tower for it
    const freePad = tileAt(g.state, cell.col, cell.row) === TILE.pad;
    setPadPickCell(freePad ? cell : null);
  };

  // ---------------------------------------------------------------- keyboard (desktop convenience)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        startPlacing(null);
        select(null);
        setPadPickCell(null);
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePause();
      } else if (e.key >= '1' && e.key <= '9') {
        const def = roster[Number(e.key) - 1];
        if (def) startPlacing(def.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startPlacing, select, togglePause, roster, setPadPickCell]);

  // ---------------------------------------------------------------- own boards online: standings, sends
  useEffect(() => {
    if (!match || shared) return;
    const { channel } = match;
    const patch = (userId: string, f: (row: Standing) => Standing) =>
      setStandings((rows) => rows.map((r) => (r.userId === userId ? f(r) : r)));
    const off = channel.on((ev: MatchEvent, from: string) => {
      if (ev.type === 'board') {
        setStandings((rows) => {
          const known = rows.some((r) => r.userId === from);
          const next = known
            ? rows.map((r) => (r.userId === from && !r.finished ? { ...r, wave: ev.wave, lives: ev.lives, score: ev.score } : r))
            : [...rows, { seat: ev.seat, userId: from, name: `Seat ${ev.seat + 1}`, raceId: 'rootkin', wave: ev.wave, lives: ev.lives, score: ev.score, finished: false, result: null, me: false }];
          return next;
        });
      } else if (ev.type === 'finished') {
        patch(from, (r) => ({ ...r, finished: true, result: ev.result, score: ev.score, lives: ev.lives, wave: ev.wave }));
      } else if (ev.type === 'send' && ev.to === match.me.seat) {
        // a rival's creeps land on our board: an input like any other, so the run stays replayable
        const g = game.current;
        if (!g) return;
        const res = applyInput(g.state, g.ctx, { type: 'receive', creep: ev.creep, count: ev.count, from: ev.from }, 0);
        if (res.ok) {
          const sender = standingsRef.current.find((s) => s.seat === ev.from);
          const def = g.ctx.creepIndex[ev.creep];
          showToast(`${sender?.name ?? 'A rival'} sent ${ev.count} ${def?.name ?? ev.creep}${ev.count > 1 ? 's' : ''}!`);
          g.loop.dirty = true;
        }
      }
    });
    const beat = window.setInterval(() => {
      const g = game.current;
      if (!g) return;
      const v = simView(g.state, g.ctx, 0);
      channel.send({ type: 'board', seat: match.me.seat, tick: v.tick, lives: v.lives, wave: v.wave, score: v.score, income: v.resources });
      patch(match.me.userId, (r) => (r.finished ? r : { ...r, wave: v.wave, lives: v.lives, score: v.score }));
    }, 1000);
    return () => {
      off();
      window.clearInterval(beat);
    };
  }, [match, shared, showToast]);

  // Presence: a rival gone for a while is scored as having left (own boards); a shared board without its host stops.
  useEffect(() => {
    if (!match) return;
    const hostId = match.players.find((p) => p.seat === 0)?.userId ?? null;
    const missingSince = new Map<string, number>();
    const GRACE_MS = 8000;
    let present = match.channel.presence().map((p) => p.userId);
    const off = match.channel.onPresence((seats) => {
      present = seats.map((p) => p.userId);
    });
    const tick = window.setInterval(() => {
      const now = Date.now();
      for (const p of match.players) {
        if (p.userId === match.me.userId) continue;
        if (present.includes(p.userId)) {
          missingSince.delete(p.userId);
          continue;
        }
        const since = missingSince.get(p.userId) ?? now;
        missingSince.set(p.userId, since);
        if (now - since < GRACE_MS) continue;
        if (shared) {
          if (p.userId === hostId && !match.host) setHostGone(true);
        } else {
          setStandings((rows) => rows.map((r) => (r.userId === p.userId && !r.finished ? { ...r, finished: true, result: 'lost' } : r)));
        }
      }
    }, 1000);
    return () => {
      off();
      window.clearInterval(tick);
    };
  }, [match, shared]);

  /** Mirror: pay for a send on our board and drop it on one rival still playing (random when there are several). */
  const sendCreeps = useCallback(
    (creepId: string, count: number) => {
      const g = game.current;
      if (!g || !match) return;
      const rivals = standingsRef.current.filter((s) => !s.me && !s.finished);
      if (rivals.length === 0) {
        showToast('No rival can receive a send right now.');
        return;
      }
      const target = rivals[Math.floor(Math.random() * rivals.length)];
      const res = applyInput(g.state, g.ctx, { type: 'send', creep: creepId, count }, 0);
      if (!res.ok) {
        showToast(refusal(res));
        return;
      }
      match.channel.send({ type: 'send', from: match.me.seat, to: target.seat, creep: creepId, count });
      setView(simView(g.state, g.ctx, 0));
      const def = g.ctx.creepIndex[creepId];
      showToast(`Sent ${count} ${def.name}${count > 1 ? 's' : ''} to ${target.name}.`);
    },
    [match, showToast, refusal],
  );

  // Everyone has reported: submit the final placement (the first submit on finish was provisional).
  const allFinished = standings.length > 0 && standings.every((s) => s.finished);
  useEffect(() => {
    if (!match || shared || !allFinished) return;
    const ranked = rankStandings(standingsRef.current);
    const mine = ranked.findIndex((s) => s.me);
    const me = ranked[mine];
    if (!me || !me.result) return;
    void match.service.submitResult(match.matchId, me.result, mine + 1, me.score, me.lives).catch(() => undefined);
  }, [match, shared, allFinished]);

  // ---------------------------------------------------------------- result
  const result = view?.result ?? null;
  useEffect(() => {
    const g = game.current;
    if (!result || !view || !g || reported.current) return;
    reported.current = true;
    onResult(result, view, g.state.inputLog);
    if (!match) return;
    if (shared) {
      // one board, one result: everyone places first together
      void match.service.submitResult(match.matchId, result.outcome, 1, result.score, view.lives).catch(() => undefined);
      return;
    }
    match.channel.send({ type: 'finished', seat: match.me.seat, result: result.outcome, score: result.score, lives: view.lives, wave: view.wave });
    setStandings((rows) => rows.map((r) => (r.me ? { ...r, finished: true, result: result.outcome, score: result.score, lives: view.lives, wave: view.wave } : r)));
    const ranked = rankStandings(standingsRef.current.map((r) => (r.me ? { ...r, finished: true, result: result.outcome, score: result.score, lives: view.lives, wave: view.wave } : r)));
    const placement = ranked.findIndex((s) => s.me) + 1;
    void match.service.submitResult(match.matchId, result.outcome, placement, result.score, view.lives).catch(() => undefined);
  }, [result, view, onResult, match, shared]);
  const ranked = match && !shared ? rankStandings(standings) : [];
  const rivalNames = ranked.filter((s) => !s.me && !s.finished).map((s) => s.name);

  // ---------------------------------------------------------------- render

  return (
    <div className="flex h-dvh w-full flex-col bg-grove-950 font-ui">
      <Hud view={view} currency={currencyLabel(raceId)} speed={speed} paused={paused} canControl={hostControls} onSpeed={changeSpeed} onPause={togglePause} onCallWave={() => send({ type: 'start-wave' })} onExit={onExit} />

      {/* The canvas host is full-bleed: backgrounds are never inset. */}
      <div ref={hostRef} className="relative min-h-0 flex-1 overflow-hidden">
        <canvas ref={canvasRef} className="h-full w-full" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} onPointerDown={onPointerDown} />
        {match && !shared && <RivalsBar standings={ranked} />}
        {match && shared && <TeamBar players={match.players} wallets={view?.wallets ?? []} towersBySeat={towersBySeat} mySeat={mySeat} waiting={waiting} />}
        {toast && <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-black/70 px-3 py-1.5 text-sm text-amber-200">{toast}</div>}
        {pending && placing && !result && (
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-xl border border-grove-500/70 bg-grove-900/95 px-3 py-2 text-sm shadow-lg backdrop-blur" role="group" aria-label="Confirm build">
            <span className="min-w-0 flex-1 truncate">
              Build <span className="font-semibold">{ctx.towerIndex[placing]?.name ?? placing}</span> here · <span className="text-sap">{costs[placing] ?? 0}</span> {currency}
            </span>
            <button onClick={() => build(placing, pending)} className="rounded-md bg-grove-500 px-3 py-1.5 font-semibold text-grove-950 hover:bg-grove-300">
              Build
            </button>
            <button onClick={() => setPendingCell(null)} className="rounded-md border border-grove-700 px-3 py-1.5 text-grove-300 hover:bg-grove-800" aria-label="Cancel">
              ✕
            </button>
          </div>
        )}
        {paused && !result && hostControls && !howTo && <PauseOverlay onResume={togglePause} onExit={onExit} onHowTo={() => setHowTo(true)} />}
        {howTo && <HowToPlay raceId={raceId} onClose={() => setHowTo(false)} />}
        {hostGone && !result && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-6" role="alertdialog" aria-label="Host left">
            <div className="w-full max-w-xs rounded-xl border border-grove-700 bg-grove-900 p-4 text-center">
              <h2 className="text-lg font-semibold">The host left the match</h2>
              <p className="mt-1 text-sm text-grove-300/80">A shared board runs on the host’s game; without it the waves cannot continue.</p>
              <button onClick={onExit} className="mt-3 w-full rounded-lg bg-grove-500 px-4 py-2 font-semibold text-grove-950 hover:bg-grove-300">
                Back to the menu
              </button>
            </div>
          </div>
        )}
        {result && view && <ResultOverlay view={view} seed={seed} saveStatus={saveStatus} signedIn={signedIn} standings={match && !shared ? ranked : null} onReplay={onReplay} onNewSeed={onNewSeed} onExit={onExit} />}
      </div>

      {/* Fixed-height footer slot: the build bar, the send bar and the tower panel swap inside it without resizing the board. */}
      <div className="shrink-0 overflow-y-auto bg-grove-900" style={{ height: 'calc(9rem + var(--safe-bottom))' }}>
        {mirrored && !selected && (
          <div className="flex gap-1 px-3 pt-1.5 text-xs" role="tablist" aria-label="Footer">
            <button role="tab" aria-selected={footer === 'build'} onClick={() => setFooter('build')} className={`rounded-md px-2 py-0.5 ${footer === 'build' ? 'bg-grove-700 text-white' : 'text-grove-300 hover:bg-grove-800'}`}>
              Build
            </button>
            <button role="tab" aria-selected={footer === 'send'} onClick={() => setFooter('send')} className={`rounded-md px-2 py-0.5 ${footer === 'send' ? 'bg-grove-700 text-white' : 'text-grove-300 hover:bg-grove-800'}`}>
              Send{view && view.sendIncome > 0 ? ` · +${view.sendIncome}/wave` : ''}
            </button>
          </div>
        )}
        {selected ? (
          <TowerPanel
            currency={currency}
            tower={selected}
            resources={view?.resources ?? 0}
            onUpgrade={(branch) => send({ type: 'upgrade', towerId: selected.id, branch })}
            onSell={() => {
              if (send({ type: 'sell', towerId: selected.id })) select(null);
            }}
            onClose={() => select(null)}
          />
        ) : mirrored && footer === 'send' ? (
          <SendBar creeps={sendRoster} currency={currency} resources={view?.resources ?? 0} income={view?.sendIncome ?? 0} rivals={rivalNames} onSend={sendCreeps} />
        ) : (
          <BuildBar
            towers={roster}
            costs={costs}
            resources={view?.resources ?? 0}
            placing={placing}
            hint={
              padPick
                ? 'Pad chosen — pick a tower to plant on it.'
                : pending
                  ? 'Tap Build on the board to plant it, or tap another pad to move it.'
                  : placing
                    ? confirmBuild
                      ? 'Tap a build pad, then Build. Tap the tower again to cancel.'
                      : 'Tap a build pad to plant. Tap the tower again to cancel.'
                    : 'Pick a tower, then a pad (or a pad first). ▲ on a tower = upgrade ready: tap it.'
            }
            onPick={startPlacing}
          />
        )}
      </div>
    </div>
  );
}

function describeTower(ctx: SimContext, state: SimState, tower: Tower, mySeat: number, match: ActiveMatch | undefined): SelectedTower {
  const def = ctx.towerIndex[tower.def];
  const { stats, mods } = effectiveStats(state, ctx, tower);
  const mine = tower.owner === mySeat;
  return {
    id: tower.id,
    name: def.name,
    def,
    tier: tower.tier,
    branch: tower.branch,
    stats,
    mods,
    passive: passiveFor(ctx, def),
    kills: tower.kills,
    damageDealt: Math.round(tower.damageDealt),
    upgradeCost: upgradeCost(ctx, tower),
    sellValue: sellValue(ctx, tower),
    ownerName: mine ? null : (match?.players.find((p) => p.seat === tower.owner)?.name ?? `Seat ${tower.owner + 1}`),
  };
}

function initialStandings(match: ActiveMatch): Standing[] {
  return match.players.map((p) => ({
    seat: p.seat,
    userId: p.userId,
    name: p.name,
    raceId: p.raceId,
    wave: 0,
    lives: 0,
    score: 0,
    finished: false,
    result: null,
    me: p.userId === match.me.userId,
  }));
}
