// Extra Terram — src/app/GameShell.tsx v0.1.0 — Phase 1 scaffold
// Owns one run: sim state (in a ref, never React state), the Pixi renderer, the loop, and the
// pointer handling on the canvas. React only sees a 10 Hz snapshot for the HUD.
import { useCallback, useEffect, useRef, useState } from 'react';
import { content, type LevelEntry } from '../content';
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
  type SimContext,
  type SimInput,
  type SimState,
  type SimView,
  type Tower,
  type TowerStats,
} from '../engine';
import { PixiRenderer } from '../render/PixiRenderer';
import type { RenderOverlay } from '../render/renderer';
import { BuildBar } from '../ui/BuildBar';
import { Hud } from '../ui/Hud';
import { PauseOverlay, ResultOverlay } from '../ui/Overlays';
import { TowerPanel, type SelectedTower } from '../ui/TowerPanel';
import { GameLoop } from './loop';
import type { Settings } from './settings';

interface Props {
  level: LevelEntry;
  seed: string;
  settings: Settings;
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

export function GameShell({ level, seed, settings, onExit, onReplay, onNewSeed }: Props) {
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
      step: () => stepSim(state, ctx),
      render: (alpha) => renderer.draw({ state, ctx, alpha, overlay: overlay.current }),
      isAnimating: () => isAnimating(state),
      onAutoPause: () => setPaused(true),
    });
    loop.maxFps = settings.batterySaver ? 30 : 60;

    renderer
      .mount(canvas, host.clientWidth, host.clientHeight, ctx)
      .then(() => {
        if (cancelled) {
          renderer.destroy();
          return;
        }
        game.current = { state, ctx, renderer, loop };
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
      } else if (e.key === '1' || e.key === '2' || e.key === '3') {
        const def = content.towers[Number(e.key) - 1];
        if (def) startPlacing(def.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startPlacing, select, togglePause]);

  // ---------------------------------------------------------------- render
  const result = view?.result ?? null;

  return (
    <div className="flex h-dvh w-full flex-col bg-grove-950 font-ui">
      <Hud view={view} speed={speed} paused={paused} onSpeed={changeSpeed} onPause={togglePause} onCallWave={() => send({ type: 'start-wave' })} onExit={onExit} />

      {/* The canvas host is full-bleed: backgrounds are never inset. */}
      <div ref={hostRef} className="relative min-h-0 flex-1 overflow-hidden">
        <canvas ref={canvasRef} className="h-full w-full" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} onPointerDown={onPointerDown} />
        {toast && <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-black/70 px-3 py-1.5 text-sm text-amber-200">{toast}</div>}
        {paused && !result && <PauseOverlay onResume={togglePause} onExit={onExit} />}
        {result && view && <ResultOverlay view={view} onReplay={onReplay} onNewSeed={onNewSeed} onExit={onExit} />}
      </div>

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
        <BuildBar towers={content.towers} resources={view?.resources ?? 0} placing={placing} onPick={startPlacing} />
      )}
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
