// Extra Terram — src/app/GameShell.tsx v0.8.0 — parallel-race wiring: board broadcasts, live standings, finish report
// Owns one run: sim state (in a ref, never React state), the Pixi renderer, the loop, and the
// pointer handling on the canvas. React only sees a 10 Hz snapshot for the HUD.
import { useCallback, useEffect, useRef, useState } from 'react';
import { content, towersForRace, type LevelEntry } from '../content';
import {
  applyInput,
  createContext,
  createSim,
  isAnimating,
  sellValue,
  simView,
  stepSim,
  towerAt,
  towerStats,
  upgradeCost,
  type LoggedInput,
  type SimContext,
  type SimInput,
  type SimResult,
  type SimState,
  type SimView,
  type Tower,
  type TowerStats,
} from '../engine';
import { rankStandings, type ActiveMatch, type MatchEvent, type Standing } from '../net';
import { PixiRenderer } from '../render/PixiRenderer';
import type { RenderOverlay } from '../render/renderer';
import { BuildBar } from '../ui/BuildBar';
import { Hud } from '../ui/Hud';
import { PauseOverlay, ResultOverlay } from '../ui/Overlays';
import { RivalsBar } from '../ui/RivalsBar';
import { TowerPanel, type SelectedTower } from '../ui/TowerPanel';
import type { SaveStatus } from './App';
import { GameLoop } from './loop';
import type { Settings } from './settings';

interface Props {
  level: LevelEntry;
  raceId: string;
  seed: string;
  settings: Settings;
  saveStatus: SaveStatus;
  signedIn: boolean;
  /** Present during a parallel race: the live channel and the seats. */
  match?: ActiveMatch;
  /** Called exactly once, when the run ends, with the result and the input log for replay/verification. */
  onResult(result: SimResult, view: SimView, inputLog: LoggedInput[]): void;
  onExit(): void;
  onReplay(): void;
  onNewSeed(): void;
}

interface Game {
  state: SimState;
  ctx: SimContext;
  renderer: PixiRenderer;
  loop: GameLoop;
}

const SNAPSHOT_MS = 100; // 10 Hz: the HUD updates at human speed

export function GameShell({ level, raceId, seed, settings, saveStatus, signedIn, match, onResult, onExit, onReplay, onNewSeed }: Props) {
  const roster = useRef(towersForRace(raceId)).current;
  const reported = useRef(false);
  const [standings, setStandings] = useState<Standing[]>(() => (match ? initialStandings(match) : []));
  const standingsRef = useRef(standings);
  standingsRef.current = standings;
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game | null>(null);
  const overlay = useRef<RenderOverlay>({ hover: null, placing: null, selected: null, showPads: settings.showPads });

  const [view, setView] = useState<SimView | null>(null);
  const [selected, setSelected] = useState<SelectedTower | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const ctx = useRef<SimContext>(createContext(content, level.map, level.waves)).current;

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1600);
  }, []);

  // ---------------------------------------------------------------- lifecycle
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let cancelled = false;

    const state = createSim(ctx, seed);
    const renderer = new PixiRenderer();
    const loop = new GameLoop({
      step: () => {
        stepSim(state, ctx);
        if (state.events.length) renderer.pushEvents(state.events, ctx, state);
      },
      render: (alpha) => renderer.draw({ state, ctx, alpha, overlay: overlay.current }),
      isAnimating: () => isAnimating(state),
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
        game.current = { state, ctx, renderer, loop };
        renderer.setEffectsScale(settings.batterySaver ? 0.5 : 1);
        loop.start();
        setView(simView(state, ctx));
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

    const snapshot = window.setInterval(() => {
      const g = game.current;
      if (!g) return;
      setView(simView(g.state, g.ctx));
      const id = overlay.current.selected;
      if (id !== null) {
        const tower = g.state.towers.find((t) => t.id === id);
        if (!tower) {
          overlay.current.selected = null;
          setSelected(null);
          loop.dirty = true;
        } else {
          setSelected(describeTower(g.ctx, tower));
        }
      }
    }, SNAPSHOT_MS);

    return () => {
      cancelled = true;
      window.clearInterval(snapshot);
      resize.disconnect();
      loop.stop();
      renderer.destroy();
      game.current = null;
    };
    // The shell is keyed by level+seed in App, so a new run always remounts; settings apply at mount.
  }, [ctx, seed, settings.batterySaver, showToast]);

  // ---------------------------------------------------------------- input helpers
  const send = useCallback(
    (input: SimInput): boolean => {
      const g = game.current;
      if (!g) return false;
      const res = applyInput(g.state, g.ctx, input);
      if (!res.ok) showToast(res.reason);
      g.loop.dirty = true;
      setView(simView(g.state, g.ctx));
      return res.ok;
    },
    [showToast],
  );

  const select = useCallback((id: number | null) => {
    overlay.current.selected = id;
    const g = game.current;
    if (g) g.loop.dirty = true;
    if (id === null || !g) {
      setSelected(null);
      return;
    }
    const tower = g.state.towers.find((t) => t.id === id);
    setSelected(tower ? describeTower(g.ctx, tower) : null);
  }, []);

  const startPlacing = useCallback(
    (towerId: string | null) => {
      const next = placing === towerId ? null : towerId;
      overlay.current.placing = next;
      setPlacing(next);
      if (next) select(null);
      const g = game.current;
      if (g) g.loop.dirty = true;
    },
    [placing, select],
  );

  const togglePause = useCallback(() => {
    const g = game.current;
    if (!g) return;
    g.loop.paused = !g.loop.paused;
    setPaused(g.loop.paused);
  }, []);

  const changeSpeed = useCallback((n: number) => {
    const g = game.current;
    if (!g) return;
    g.loop.speed = n;
    setSpeed(n);
  }, []);

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
      send({ type: 'place', tower: placing, col: cell.col, row: cell.row });
      return;
    }
    const tower = towerAt(g.state, cell.col, cell.row);
    select(tower ? tower.id : null);
  };

  // ---------------------------------------------------------------- keyboard (desktop convenience)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        startPlacing(null);
        select(null);
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
  }, [startPlacing, select, togglePause, roster]);

  // ---------------------------------------------------------------- parallel race
  useEffect(() => {
    if (!match) return;
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
      }
    });
    const beat = window.setInterval(() => {
      const g = game.current;
      if (!g) return;
      const v = simView(g.state, g.ctx);
      channel.send({ type: 'board', seat: match.me.seat, tick: v.tick, lives: v.lives, wave: v.wave, score: v.score, income: v.resources });
      patch(match.me.userId, (r) => (r.finished ? r : { ...r, wave: v.wave, lives: v.lives, score: v.score }));
    }, 1000);
    return () => {
      off();
      window.clearInterval(beat);
    };
  }, [match]);

  // Everyone has reported: submit the final placement (the first submit on finish was provisional).
  const allFinished = standings.length > 0 && standings.every((s) => s.finished);
  useEffect(() => {
    if (!match || !allFinished) return;
    const ranked = rankStandings(standingsRef.current);
    const mine = ranked.findIndex((s) => s.me);
    const me = ranked[mine];
    if (!me || !me.result) return;
    void match.service.submitResult(match.matchId, me.result, mine + 1, me.score, me.lives).catch(() => undefined);
  }, [match, allFinished]);

  // ---------------------------------------------------------------- result
  const result = view?.result ?? null;
  useEffect(() => {
    const g = game.current;
    if (!result || !view || !g || reported.current) return;
    reported.current = true;
    onResult(result, view, g.state.inputLog);
    if (match) {
      match.channel.send({ type: 'finished', seat: match.me.seat, result: result.outcome, score: result.score, lives: view.lives, wave: view.wave });
      setStandings((rows) => rows.map((r) => (r.me ? { ...r, finished: true, result: result.outcome, score: result.score, lives: view.lives, wave: view.wave } : r)));
      const ranked = rankStandings(standingsRef.current.map((r) => (r.me ? { ...r, finished: true, result: result.outcome, score: result.score, lives: view.lives, wave: view.wave } : r)));
      const placement = ranked.findIndex((s) => s.me) + 1;
      void match.service.submitResult(match.matchId, result.outcome, placement, result.score, view.lives).catch(() => undefined);
    }
  }, [result, view, onResult, match]);
  const ranked = match ? rankStandings(standings) : [];

  // ---------------------------------------------------------------- render

  return (
    <div className="flex h-dvh w-full flex-col bg-grove-950 font-ui">
      <Hud view={view} speed={speed} paused={paused} onSpeed={changeSpeed} onPause={togglePause} onCallWave={() => send({ type: 'start-wave' })} onExit={onExit} />

      {/* The canvas host is full-bleed: backgrounds are never inset. */}
      <div ref={hostRef} className="relative min-h-0 flex-1 overflow-hidden">
        <canvas ref={canvasRef} className="h-full w-full" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} onPointerDown={onPointerDown} />
        {match && <RivalsBar standings={ranked} />}
        {toast && <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-black/70 px-3 py-1.5 text-sm text-amber-200">{toast}</div>}
        {paused && !result && <PauseOverlay onResume={togglePause} onExit={onExit} />}
        {result && view && <ResultOverlay view={view} seed={seed} saveStatus={saveStatus} signedIn={signedIn} standings={match ? ranked : null} onReplay={onReplay} onNewSeed={onNewSeed} onExit={onExit} />}
      </div>

      {/* Fixed-height footer slot: the build bar and the tower panel swap inside it without resizing the board. */}
      <div className="shrink-0 overflow-y-auto bg-grove-900" style={{ height: 'calc(9rem + var(--safe-bottom))' }}>
        {selected ? (
          <TowerPanel
            tower={selected}
            resources={view?.resources ?? 0}
            onUpgrade={(branch) => send({ type: 'upgrade', towerId: selected.id, branch })}
            onSell={() => {
              if (send({ type: 'sell', towerId: selected.id })) select(null);
            }}
            onClose={() => select(null)}
          />
        ) : (
          <BuildBar towers={roster} resources={view?.resources ?? 0} placing={placing} onPick={startPlacing} />
        )}
      </div>
    </div>
  );
}

function describeTower(ctx: SimContext, tower: Tower): SelectedTower {
  const def = ctx.towerIndex[tower.def];
  const stats: TowerStats = towerStats(def, tower.tier, tower.branch);
  return {
    id: tower.id,
    name: def.name,
    def,
    tier: tower.tier,
    branch: tower.branch,
    stats,
    kills: tower.kills,
    damageDealt: Math.round(tower.damageDealt),
    upgradeCost: upgradeCost(ctx, tower),
    sellValue: sellValue(tower),
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
