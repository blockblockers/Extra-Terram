// Extra Terram — src/render/PixiRenderer.ts v0.9.0 — upgrade-ready badges, a pending build pad, passive effect sprites (optional art)
// PixiJS v8 renderer. It is driven by the app's loop (no Pixi ticker): the loop decides when a
// frame is worth drawing, this class only draws. Heat controls live in the loop (fps cap, idle
// between waves) and here (resolution cap, generated textures cached once, no per-frame filters,
// one pooled effects batch).
import { Application, Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { TILE as TILE_KIND, cellIndex, passiveFor, passiveMods, towerCost, towerStats, upgradeCost, wallet, type SimContext, type SimEvent, type SimState, type Tower } from '../engine';
import { StripPlayer } from './anim';
import { Effects } from './effects';
import type { Cell, RenderFrame, Renderer } from './renderer';
import { SpriteLibrary, TILE, hasTurret, type Strip } from './sprites';
import { projectileColor, turretMount } from './vectorArt';
import { seatColorHex } from './seats';

export { TILE };
const MAX_RESOLUTION = 2;

const hexColor = (css: string): number => parseInt(css.replace('#', ''), 16);
const darken = (c: number): number => (((c >> 16) & 0xff) * 0.7) << 16 | (((c >> 8) & 0xff) * 0.7) << 8 | ((c & 0xff) * 0.7);
const lighten = (c: number): number => Math.min(255, ((c >> 16) & 0xff) * 0.6 + 100) << 16 | Math.min(255, ((c >> 8) & 0xff) * 0.6 + 100) << 8 | Math.min(255, (c & 0xff) * 0.6 + 100); // cap device pixel ratio: fill rate is the phone's main heat source

interface TowerView {
  body: Sprite;
  turret: Sprite | null;
  key: string;
  aim: number; // current turret angle
  targetAim: number;
  recoil: number;
  mount: number; // turret height above the cell centre, board px
  anim: StripPlayer; // body idle/fire
  turretAnim: StripPlayer | null;
  fire: Strip | null; // body fire strip, played on each shot
  turretFire: Strip | null;
  phase: number; // procedural idle phase
  flinch: number; // 1 right after a shot, decays
  baseW: number;
  baseH: number;
  painted: boolean;
  /** Passive effect sprites, made only when the race's fx art exists. */
  fxGround: Sprite | null; // rooted tendrils under the tower
  fxGlow: Sprite | null; // spin-up ring or overcharge flash at the mount
  burst: number; // overcharge shot flash, decays
}

interface CreepView {
  body: Sprite;
  /** Painted creeps are three-quarter views: they mirror left/right instead of rotating. */
  painted: boolean;
  facing: 1 | -1;
  anim: StripPlayer;
  die: Strip | null;
  phase: number;
  baseW: number;
  baseH: number;
  speed: number; // tiles per second, for the walk cadence
  shadow: Sprite;
  hpBack: Sprite;
  hpFront: Sprite;
  slowRing: Sprite;
  stun: Sprite[];
  dripTimer: number;
}

interface ProjectileView {
  sprite: Sprite;
  color: number;
  lastX: number;
  lastY: number;
}

export class PixiRenderer implements Renderer {
  private app = new Application();
  private canvas: HTMLCanvasElement | null = null;
  private width = 1;
  private height = 1;
  private cols = 1;
  private rows = 1;

  private board = new Container();
  private bgLayer = new Container();
  private padLayer = new Graphics();
  private auraLayer = new Graphics();
  private rangeLayer = new Graphics();
  private shadowLayer = new Container();
  private groundFxLayer = new Container();
  private threadLayer = new Container(); // hive-link threads between towers
  private towerLayer = new Container();
  private glowLayer = new Container(); // passive glows above the towers
  private creepLayer = new Container();
  private projectileLayer = new Container();
  private hpLayer = new Container();
  private hoverLayer = new Graphics();

  private sprites: SpriteLibrary | null = null;
  private effects: Effects | null = null;
  private towers = new Map<number, TowerView>();
  private creeps = new Map<number, CreepView>();
  /** One-shot death animations playing where a creep died. */
  private ghosts: Array<{ sprite: Sprite; anim: StripPlayer }> = [];
  private projectiles = new Map<number, ProjectileView>();
  private softShadow: Texture | null = null;
  private slowRingTex: Texture | null = null;
  private stunTex: Texture | null = null;
  private padKey = '';
  private mounted = false;
  private auraPhase = 0;
  private lastTick = 0;
  private towerDefOf = new Map<number, string>();
  private threads = new Map<string, Sprite>();

  async mount(canvas: HTMLCanvasElement, width: number, height: number, ctx: SimContext): Promise<void> {
    this.canvas = canvas;
    this.cols = ctx.map.cols;
    this.rows = ctx.map.rows;
    await this.app.init({
      canvas,
      width: Math.max(1, width),
      height: Math.max(1, height),
      resolution: Math.min(window.devicePixelRatio || 1, MAX_RESOLUTION),
      autoDensity: true,
      antialias: true,
      autoStart: false, // the app loop calls render(); Pixi's ticker never runs
      background: 0x07131a,
    });
    this.mounted = true;
    this.sprites = new SpriteLibrary(this.app.renderer);
    this.effects = new Effects(this.app.renderer);
    this.board.addChild(
      this.bgLayer,
      this.padLayer,
      this.auraLayer,
      this.rangeLayer,
      this.shadowLayer,
      this.groundFxLayer,
      this.threadLayer,
      this.towerLayer,
      this.glowLayer,
      this.creepLayer,
      this.projectileLayer,
      this.effects.container,
      this.hpLayer,
      this.hoverLayer,
    );
    this.app.stage.addChild(this.board);
    this.makeSharedTextures();
    await Promise.all([this.loadBackground(ctx), this.sprites.load()]);
    this.resize(width, height);
  }

  /** True when any tower on the board plays a looping idle strip (the loop keeps a low frame rate for them). */
  hasIdleAnimation(): boolean {
    for (const v of this.towers.values()) if (v.anim.animated) return true;
    return false;
  }

  /** Battery saver halves particle counts and is set by the shell after mount. */
  setEffectsScale(scale: number): void {
    if (this.effects) this.effects.scale = scale;
  }

  private makeSharedTextures(): void {
    const r = this.app.renderer;
    let g = new Graphics();
    g.ellipse(16, 16, 15, 15).fill({ color: 0x000000, alpha: 1 });
    this.softShadow = r.generateTexture({ target: g, resolution: 1 });
    g.destroy();
    g = new Graphics();
    g.circle(24, 24, 20).stroke({ width: 3, color: 0xffffff });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.moveTo(24 + Math.cos(a) * 20, 24 + Math.sin(a) * 20)
        .lineTo(24 + Math.cos(a) * 26, 24 + Math.sin(a) * 26)
        .stroke({ width: 2.5, color: 0xffffff });
    }
    this.slowRingTex = r.generateTexture({ target: g, resolution: 2 });
    g.destroy();
    g = new Graphics();
    g.moveTo(6, 0).lineTo(8, 4).lineTo(12, 6).lineTo(8, 8).lineTo(6, 12).lineTo(4, 8).lineTo(0, 6).lineTo(4, 4).closePath().fill(0xffffff);
    this.stunTex = r.generateTexture({ target: g, resolution: 2 });
    g.destroy();
  }

  private async loadBackground(ctx: SimContext): Promise<void> {
    const w = this.cols * TILE;
    const h = this.rows * TILE;
    try {
      const texture = await Assets.load<Texture>(ctx.map.background);
      const sprite = new Sprite(texture);
      sprite.width = w;
      sprite.height = h;
      this.bgLayer.addChild(sprite);
    } catch {
      // No painted background yet: draw a plain readable board so the game still runs.
      const g = new Graphics();
      g.rect(0, 0, w, h).fill(0x12261a);
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const kind = ctx.map.legend[ctx.map.grid[r][c]];
          if (kind === 'path' || kind === 'spawn' || kind === 'exit') g.rect(c * TILE, r * TILE, TILE, TILE).fill(kind === 'path' ? 0x4a3a28 : kind === 'spawn' ? 0x6b3a2b : 0x2b5a3a);
          else if (kind === 'pad') g.circle(c * TILE + TILE / 2, r * TILE + TILE / 2, TILE * 0.36).fill(0x1c3a27);
        }
      }
      this.bgLayer.addChild(g);
    }
  }

  resize(width: number, height: number): void {
    if (!this.mounted) return;
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.app.renderer.resize(this.width, this.height);
    const bw = this.cols * TILE;
    const bh = this.rows * TILE;
    const scale = Math.min(this.width / bw, this.height / bh);
    this.board.scale.set(scale);
    this.board.position.set((this.width - bw * scale) / 2, (this.height - bh * scale) / 2);
  }

  screenToCell(clientX: number, clientY: number): Cell | null {
    if (!this.canvas) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) * this.width) / Math.max(1, rect.width);
    const y = ((clientY - rect.top) * this.height) / Math.max(1, rect.height);
    const scale = this.board.scale.x;
    const col = Math.floor((x - this.board.x) / scale / TILE);
    const row = Math.floor((y - this.board.y) / scale / TILE);
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return null;
    return { col, row };
  }

  /** Feed one tick's events; the shell calls this after every sim step. */
  pushEvents(events: SimEvent[], ctx: SimContext, state: SimState): void {
    if (!this.effects) return;
    const colorOf = (towerId: number): number => {
      const t = state.towers.find((tw) => tw.id === towerId);
      return t ? projectileColor(ctx.towerIndex[t.def]) : 0xffffff;
    };
    for (const ev of events) {
      this.effects.handle(ev, colorOf);
      if (ev.kind === 'beam' && ev.alpha) {
        const view = this.towers.get(ev.tower);
        if (view) view.burst = 1;
      } else if (ev.kind === 'fire') {
        const view = this.towers.get(ev.tower);
        if (view) {
          view.targetAim = Math.atan2(ev.ty - ev.y, ev.tx - ev.x);
          view.recoil = 1;
          view.flinch = 1;
          if (ev.alpha) view.burst = 1;
          if (view.fire) view.anim.play(view.fire);
          if (view.turretAnim && view.turretFire) view.turretAnim.play(view.turretFire);
        }
      } else if (ev.kind === 'kill') {
        const view = [...this.creeps.values()].find((v) => v.die && Math.abs(v.body.x - ev.x * TILE) < 1 && Math.abs(v.body.y - ev.y * TILE) < 1);
        const def = ctx.creepIndex[ev.creep];
        const die = this.sprites?.creepStrip(def, 'die') ?? null;
        if (die) {
          const g = new Sprite(die.frames[0]);
          g.anchor.set(0.5);
          const entry = this.sprites!.creep(def);
          g.width = entry.width;
          g.height = entry.height;
          g.position.set(ev.x * TILE, ev.y * TILE);
          if (view) g.scale.x = Math.abs(g.scale.x) * view.facing;
          this.creepLayer.addChild(g);
          const anim = new StripPlayer(g, die.frames[0], null);
          anim.play(die);
          this.ghosts.push({ sprite: g, anim });
        }
      }
    }
  }

  draw(frame: RenderFrame): void {
    if (!this.mounted || !this.sprites || !this.effects) return;
    const { state, ctx, alpha, overlay } = frame;
    const dtTicks = state.tick - this.lastTick + (alpha - (this.lastAlpha ?? 0));
    this.lastTick = state.tick;
    this.lastAlpha = alpha;
    const dt = Math.max(0, Math.min(3, dtTicks));
    this.auraPhase += dt * 0.02;

    this.drawPads(state, overlay.showPads || overlay.placing !== null);
    this.drawAuras(state, ctx);
    this.drawTowers(state, ctx, dt);
    this.drawCreeps(state, ctx, alpha, dt);
    this.drawProjectiles(state, ctx, alpha);
    this.drawGhosts(dt);
    this.effects.update(dt);
    this.drawOverlay(state, ctx, overlay);
    this.app.render();
  }
  private lastAlpha: number | undefined;

  private drawGhosts(dt: number): void {
    let w = 0;
    for (const g of this.ghosts) {
      g.anim.update(dt);
      if (g.anim.playingOnce) this.ghosts[w++] = g;
      else g.sprite.destroy();
    }
    this.ghosts.length = w;
  }

  destroy(): void {
    if (!this.mounted) return;
    this.mounted = false;
    for (const g of this.ghosts) g.sprite.destroy();
    this.ghosts.length = 0;
    this.threads.clear();
    this.towers.clear();
    this.creeps.clear();
    this.projectiles.clear();
    this.sprites?.destroy();
    this.effects?.destroy();
    // Generated textures are ours to free; the painted sprites and backgrounds belong to the Assets
    // cache and stay loaded for the next run (destroying them here only forced a re-decode and a
    // "managed by Assets" warning on every replay).
    for (const t of [this.softShadow, this.slowRingTex, this.stunTex]) t?.destroy(true);
    this.softShadow = this.slowRingTex = this.stunTex = null;
    this.app.destroy(false, { children: true });
  }

  // ------------------------------------------------------------ layers

  private drawPads(state: SimState, show: boolean): void {
    const key = `${show}|${state.towers.length}`;
    if (key === this.padKey) return;
    this.padKey = key;
    const g = this.padLayer;
    g.clear();
    if (!show) return;
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const i = cellIndex(state.cols, c, r);
        if (state.grid[i] !== TILE_KIND.pad || state.occupied[i] !== -1) continue;
        g.circle(c * TILE + TILE / 2, r * TILE + TILE / 2, TILE * 0.34).stroke({ width: 2, color: 0xb9f0a8, alpha: 0.55 });
      }
    }
  }

  /** Ground rings under aura towers (slow fields), support towers (buff links) and economy towers (a soft gold pool). */
  private drawAuras(state: SimState, ctx: SimContext): void {
    const g = this.auraLayer;
    g.clear();
    for (const t of state.towers) {
      const def = ctx.towerIndex[t.def];
      const cx = t.col * TILE + TILE / 2;
      const cy = t.row * TILE + TILE / 2;
      if (def.attack === 'aura') {
        const stats = towerStats(def, t.tier, t.branch);
        const r = stats.range * TILE;
        const accent = hexColor(def.color);
        const color = t.tier === 3 && t.branch === 'a' ? darken(accent) : accent;
        g.circle(cx, cy, r).fill({ color, alpha: 0.1 });
        g.circle(cx, cy, r).stroke({ width: 2, color, alpha: 0.35 });
        const spokes = 8;
        for (let i = 0; i < spokes; i++) {
          const a = this.auraPhase + (i / spokes) * Math.PI * 2;
          const x0 = cx + Math.cos(a) * r * 0.82;
          const y0 = cy + Math.sin(a) * r * 0.82;
          const x1 = cx + Math.cos(a + 0.15) * r;
          const y1 = cy + Math.sin(a + 0.15) * r;
          g.moveTo(x0, y0).quadraticCurveTo(cx + Math.cos(a + 0.05) * r * 0.95, cy + Math.sin(a + 0.05) * r * 0.95, x1, y1).stroke({ width: 2, color: lighten(accent), alpha: 0.45 });
        }
        for (let i = 0; i < 6; i++) {
          const a = -this.auraPhase * 1.7 + i * 1.047;
          const rr = r * (0.35 + 0.25 * Math.sin(this.auraPhase * 2 + i));
          g.circle(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 2).fill({ color: 0xffffff, alpha: 0.5 });
        }
      } else if (def.attack === 'support') {
        const stats = towerStats(def, t.tier, t.branch);
        const r = stats.range * TILE;
        const accent = hexColor(def.color);
        g.circle(cx, cy, r).stroke({ width: 1.5, color: accent, alpha: 0.25 });
        // a pulse that travels outward, and a link to every tower it buffs
        const pulse = (this.auraPhase * 0.8) % 1;
        g.circle(cx, cy, r * pulse).stroke({ width: 2, color: accent, alpha: 0.35 * (1 - pulse) });
        for (const o of state.towers) {
          if (o.id === t.id) continue;
          const dx = o.col - t.col;
          const dy = o.row - t.row;
          if (dx * dx + dy * dy > stats.range * stats.range) continue;
          const ox = o.col * TILE + TILE / 2;
          const oy = o.row * TILE + TILE / 2;
          g.moveTo(cx, cy).lineTo(ox, oy).stroke({ width: 1.5, color: accent, alpha: 0.3 });
          g.circle(ox, oy, 4).fill({ color: accent, alpha: 0.5 });
        }
      } else if (def.attack === 'economy') {
        g.ellipse(cx, cy + 6, TILE * 0.48, TILE * 0.3).fill({ color: 0xe8c33a, alpha: 0.12 + 0.05 * Math.sin(this.auraPhase * 3) });
      }
    }
  }

  private drawTowers(state: SimState, ctx: SimContext, dt: number): void {
    const seen = new Set<number>();
    for (const t of state.towers) {
      seen.add(t.id);
      const def = ctx.towerIndex[t.def];
      const key = `${t.def}:${t.tier}:${t.branch ?? '-'}`;
      let view = this.towers.get(t.id);
      if (!view || view.key !== key) {
        if (view) {
          view.body.destroy();
          view.turret?.destroy();
          view.fxGround?.destroy();
          view.fxGlow?.destroy();
        }
        const entry = this.sprites!.tower(def, t.tier, t.branch);
        const mount = entry.image ? TILE * 0.5 : turretMount(def, t.tier, TILE);
        const body = new Sprite(entry.texture);
        body.anchor.set(entry.ax, entry.ay);
        body.width = entry.width;
        body.height = entry.height;
        body.position.set(t.col * TILE + TILE / 2, t.row * TILE + TILE / 2);
        this.towerLayer.addChild(body);
        let turret: Sprite | null = null;
        if (hasTurret(def)) {
          const te = this.sprites!.turret(def, t.tier, t.branch, entry.image);
          if (te) {
            turret = new Sprite(te.texture);
            turret.anchor.set(te.ax, te.ay);
            turret.width = te.width;
            turret.height = te.height;
            turret.position.set(t.col * TILE + TILE / 2, t.row * TILE + TILE / 2 - mount);
            this.towerLayer.addChild(turret);
          }
        }
        const phase = ((t.id * 0.618) % 1) * Math.PI * 2;
        const idle = entry.image ? this.sprites!.towerStrip(def, t.tier, t.branch, 'idle') : null;
        const fire = entry.image ? this.sprites!.towerStrip(def, t.tier, t.branch, 'fire') : null;
        const turretFire = turret ? this.sprites!.turretStrip(def, t.tier, t.branch) : null;
        view = {
          body,
          turret,
          key,
          aim: view?.aim ?? -Math.PI / 2,
          targetAim: view?.targetAim ?? -Math.PI / 2,
          recoil: 0,
          mount,
          anim: new StripPlayer(body, entry.texture, idle, phase),
          turretAnim: turret ? new StripPlayer(turret, turret.texture, null) : null,
          fire,
          turretFire,
          phase,
          flinch: 0,
          baseW: body.width,
          baseH: body.height,
          painted: entry.image,
          fxGround: null,
          fxGlow: null,
          burst: 0,
        };
        this.towers.set(t.id, view);
        this.towerDefOf.set(t.id, t.def);
      }
      // animation: a strip when there is one, otherwise a slow breath and a flinch on fire
      view.anim.update(dt);
      view.turretAnim?.update(dt);
      view.flinch = Math.max(0, view.flinch - 0.2 * dt);
      if (view.painted && !view.anim.animated) {
        const breath = 1 + 0.015 * Math.sin(this.auraPhase * 2.2 + view.phase);
        const squash = view.flinch > 0 && !view.turret ? 1 + 0.06 * view.flinch : 1;
        view.body.width = view.baseW * breath * squash;
        view.body.height = (view.baseH * (2 - breath)) / squash;
      }
      if (view.turret) {
        // ease toward the target angle along the shortest arc
        let diff = view.targetAim - view.aim;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        view.aim += diff * Math.min(1, 0.35 * dt + 0.15);
        view.turret.rotation = view.aim;
        view.recoil = Math.max(0, view.recoil - 0.25 * dt);
        const back = view.recoil * 3;
        view.turret.position.set(t.col * TILE + TILE / 2 - Math.cos(view.aim) * back, t.row * TILE + TILE / 2 - view.mount - Math.sin(view.aim) * back);
      }
    }
    for (const [id, view] of this.towers) {
      if (!seen.has(id)) {
        view.body.destroy();
        view.turret?.destroy();
        view.fxGround?.destroy();
        view.fxGlow?.destroy();
        this.towers.delete(id);
        this.towerDefOf.delete(id);
      }
    }
    this.drawPassiveFx(state, ctx, dt);
  }

  /**
   * The race passives, when their effect art exists (`public/sprites/<race>/fx/`): rooted tendrils that
   * grow with the waves stood, a spin-up ring that brightens with heat, hive-link threads between
   * linked towers, an overcharge glow while the alpha shot is ready and a flash when it fires.
   * Without the files nothing is drawn and nothing is computed.
   */
  private drawPassiveFx(state: SimState, ctx: SimContext, dt: number): void {
    const lib = this.sprites!;
    const liveThreads = new Set<string>();
    for (const t of state.towers) {
      const view = this.towers.get(t.id);
      if (!view) continue;
      const def = ctx.towerIndex[t.def];
      const passive = passiveFor(ctx, def);
      const cx = t.col * TILE + TILE / 2;
      const cy = t.row * TILE + TILE / 2;
      view.burst = Math.max(0, view.burst - 0.12 * dt);
      switch (passive.id) {
        case 'rooted': {
          const tex = lib.fx(def.race, 'rooted');
          if (!tex) break;
          const mods = passiveMods(state, ctx, t);
          const grow = mods.wavesStood / Math.max(1, passive.growthCapWaves ?? 6);
          if (!view.fxGround) {
            view.fxGround = new Sprite(tex);
            view.fxGround.anchor.set(0.5, 0.5);
            this.groundFxLayer.addChild(view.fxGround);
          }
          const size = TILE * (0.8 + 0.6 * grow);
          view.fxGround.width = size;
          view.fxGround.height = size * 0.6;
          view.fxGround.position.set(cx, cy + 8);
          view.fxGround.alpha = 0.35 + 0.65 * grow;
          break;
        }
        case 'spin-up': {
          const tex = lib.fx(def.race, 'spin-up');
          if (!tex || !(def.attack === 'projectile' || def.attack === 'beam')) break;
          const mods = passiveMods(state, ctx, t);
          const max = Math.max(1, Math.floor((passive.spinUpMax ?? 0.3) / (passive.spinUpPerShot ?? 0.06)));
          const heat = mods.heat / max;
          if (!view.fxGlow) {
            view.fxGlow = new Sprite(tex);
            view.fxGlow.anchor.set(0.5, 0.5);
            view.fxGlow.blendMode = 'add';
            this.glowLayer.addChild(view.fxGlow);
          }
          view.fxGlow.width = TILE * 0.9;
          view.fxGlow.height = TILE * 0.9;
          view.fxGlow.position.set(cx, cy - view.mount);
          view.fxGlow.rotation += dt * (0.1 + 0.5 * heat);
          view.fxGlow.alpha = heat * 0.9;
          view.fxGlow.visible = heat > 0;
          break;
        }
        case 'hive': {
          const tex = lib.fx(def.race, 'hive-link');
          if (!tex) break;
          const r2 = (passive.hiveRadius ?? 1.5) ** 2;
          let linked = 0;
          for (const o of state.towers) {
            if (o.id <= t.id || linked >= (passive.hiveMaxNeighbours ?? 3)) continue;
            const dx = o.col - t.col;
            const dy = o.row - t.row;
            if (dx * dx + dy * dy > r2) continue;
            linked++;
            const key = `${t.id}:${o.id}`;
            liveThreads.add(key);
            let thread = this.threads.get(key);
            if (!thread) {
              thread = new Sprite(tex);
              thread.anchor.set(0, 0.5);
              thread.alpha = 0.85;
              this.threadLayer.addChild(thread);
              this.threads.set(key, thread);
            }
            const ox = o.col * TILE + TILE / 2;
            const oy = o.row * TILE + TILE / 2;
            thread.position.set(cx, cy + 4);
            thread.rotation = Math.atan2(oy - cy, ox - cx);
            thread.width = Math.sqrt((ox - cx) ** 2 + (oy - cy) ** 2);
            thread.height = TILE * 0.22;
          }
          break;
        }
        case 'overcharge': {
          const tex = lib.fx(def.race, 'overcharge');
          if (!tex || !(def.attack === 'projectile' || def.attack === 'beam')) break;
          const mods = passiveMods(state, ctx, t);
          if (!view.fxGlow) {
            view.fxGlow = new Sprite(tex);
            view.fxGlow.anchor.set(0.5, 0.5);
            view.fxGlow.blendMode = 'add';
            this.glowLayer.addChild(view.fxGlow);
          }
          const pulse = 0.5 + 0.5 * Math.sin(this.auraPhase * 6 + view.phase);
          const ready = mods.alphaReady ? 0.35 + 0.35 * pulse : 0;
          const size = TILE * (0.5 + 0.2 * pulse + 0.9 * view.burst);
          view.fxGlow.width = size;
          view.fxGlow.height = size;
          view.fxGlow.position.set(cx, cy - view.mount);
          view.fxGlow.alpha = Math.min(1, ready + view.burst);
          view.fxGlow.visible = view.fxGlow.alpha > 0.02;
          break;
        }
      }
    }
    for (const [key, thread] of this.threads) {
      if (!liveThreads.has(key)) {
        thread.destroy();
        this.threads.delete(key);
      }
    }
  }

  private drawCreeps(state: SimState, ctx: SimContext, alpha: number, dt: number): void {
    const seen = new Set<number>();
    for (const c of state.creeps) {
      seen.add(c.id);
      let v = this.creeps.get(c.id);
      if (!v) {
        const def = ctx.creepIndex[c.def];
        const entry = this.sprites!.creep(def);
        const body = new Sprite(entry.texture);
        body.anchor.set(entry.ax, entry.ay);
        body.width = entry.width;
        body.height = entry.height;
        const shadow = new Sprite(this.softShadow!);
        shadow.anchor.set(0.5);
        shadow.tint = 0x03100a;
        shadow.alpha = 0.4;
        shadow.width = entry.width * 0.9;
        shadow.height = entry.height * 0.55;
        const hpBack = new Sprite(Texture.WHITE);
        hpBack.tint = 0x1a0d05;
        hpBack.alpha = 0.8;
        const hpFront = new Sprite(Texture.WHITE);
        hpFront.tint = 0x7fd36b;
        const slowRing = new Sprite(this.slowRingTex!);
        slowRing.anchor.set(0.5);
        slowRing.tint = 0x9fe8c0;
        slowRing.alpha = 0.7;
        slowRing.width = entry.width * 1.1;
        slowRing.height = entry.width * 0.7;
        slowRing.visible = false;
        const stun: Sprite[] = [];
        for (let i = 0; i < 3; i++) {
          const s = new Sprite(this.stunTex!);
          s.anchor.set(0.5);
          s.tint = 0xffe9a6;
          s.width = 7;
          s.height = 7;
          s.visible = false;
          this.hpLayer.addChild(s);
          stun.push(s);
        }
        this.shadowLayer.addChild(shadow);
        this.groundFxLayer.addChild(slowRing);
        this.creepLayer.addChild(body);
        this.hpLayer.addChild(hpBack, hpFront);
        if (c.sentBy >= 0) {
          // a rival's send: its shadow and health bar carry the sender's seat colour
          shadow.tint = seatColorHex(c.sentBy);
          shadow.alpha = 0.6;
          hpFront.tint = seatColorHex(c.sentBy);
        }
        const walk = entry.image ? this.sprites!.creepStrip(def, 'walk') : null;
        const die = entry.image ? this.sprites!.creepStrip(def, 'die') : null;
        const phase = ((c.id * 0.618) % 1) * Math.PI * 2;
        v = {
          body,
          painted: entry.image,
          facing: 1,
          anim: new StripPlayer(body, entry.texture, walk, phase),
          die,
          phase,
          baseW: body.width,
          baseH: body.height,
          speed: def.speed,
          shadow,
          hpBack,
          hpFront,
          slowRing,
          stun,
          dripTimer: 0,
        };
        this.creeps.set(c.id, v);
      }
      const x = (c.px + (c.x - c.px) * alpha) * TILE;
      const y = (c.py + (c.y - c.py) * alpha) * TILE;
      v.body.position.set(x, y);
      v.shadow.position.set(x + 2, y + 5);
      const dx = c.x - c.px;
      const dy = c.y - c.py;
      const moving = (dx !== 0 || dy !== 0) && c.stunTicks === 0;
      if (v.painted) {
        // A three-quarter-view sprite rotated to face down or left reads as lying on its side or
        // upside down, so painted creeps keep upright: mirror when heading left, lean a little
        // into vertical travel, and never rotate past that.
        if (dx > 0.001) v.facing = 1;
        else if (dx < -0.001) v.facing = -1;
        // walk strip at a cadence tied to speed, or a procedural bob and roll
        v.anim.rate = moving ? Math.max(0.5, v.speed / 1.5) * (c.slowFactor < 1 ? c.slowFactor : 1) : 0;
        v.anim.update(dt);
        let bobY = 0;
        let roll = 0;
        let stretch = 1;
        if (!v.anim.animated && moving) {
          const cadence = this.auraPhase * 10 * Math.max(0.5, v.speed / 1.5) + v.phase;
          bobY = -Math.abs(Math.sin(cadence)) * 2.2;
          roll = Math.sin(cadence) * 0.06;
          stretch = 1 + Math.sin(cadence * 2) * 0.025;
        }
        v.body.width = v.baseW * stretch;
        v.body.height = v.baseH / stretch;
        v.body.scale.x = Math.abs(v.body.scale.x) * v.facing;
        v.body.position.set(x, y + bobY);
        const lean = dy !== 0 || dx !== 0 ? Math.atan2(dy, Math.abs(dx) + 0.0001) : 0;
        v.body.rotation = v.facing * Math.max(-0.35, Math.min(0.35, lean * 0.4)) + roll;
      } else if (dx !== 0 || dy !== 0) {
        v.body.rotation = Math.atan2(dy, dx);
      }

      // status visuals
      const slowed = c.slowTicks > 0 && c.slowFactor < 1;
      v.slowRing.visible = slowed;
      if (slowed) {
        v.slowRing.position.set(x, y + 4);
        v.slowRing.rotation += 0.04 * dt;
      }
      const bleeding = c.bleedTicks > 0;
      v.body.tint = bleeding ? 0xb8ff9a : slowed ? 0xcfe8d8 : 0xffffff;
      if (bleeding) {
        v.dripTimer -= dt;
        if (v.dripTimer <= 0) {
          this.effects!.drip(x, y);
          v.dripTimer = 10;
        }
      }
      const stunned = c.stunTicks > 0;
      for (let i = 0; i < 3; i++) {
        const s = v.stun[i];
        s.visible = stunned;
        if (stunned) {
          const a = this.auraPhase * 6 + (i / 3) * Math.PI * 2;
          s.position.set(x + Math.cos(a) * 12, y - 10 + Math.sin(a) * 4);
        }
      }

      const ratio = Math.max(0, c.hp / c.maxHp);
      const show = ratio < 1;
      v.hpBack.visible = show;
      v.hpFront.visible = show;
      if (show) {
        const w = TILE * 0.6;
        const h = 5;
        v.hpBack.position.set(x - w / 2, y - TILE * 0.42);
        v.hpBack.width = w;
        v.hpBack.height = h;
        v.hpFront.position.set(x - w / 2, y - TILE * 0.42);
        v.hpFront.width = w * ratio;
        v.hpFront.height = h;
        v.hpFront.tint = ratio > 0.5 ? 0x7fd36b : ratio > 0.25 ? 0xe8c33a : 0xe85a3a;
      }
    }
    for (const [id, v] of this.creeps) {
      if (!seen.has(id)) {
        v.body.destroy();
        v.shadow.destroy();
        v.hpBack.destroy();
        v.hpFront.destroy();
        v.slowRing.destroy();
        for (const s of v.stun) s.destroy();
        this.creeps.delete(id);
      }
    }
  }

  private drawProjectiles(state: SimState, ctx: SimContext, alpha: number): void {
    const seen = new Set<number>();
    for (const p of state.projectiles) {
      seen.add(p.id);
      let v = this.projectiles.get(p.id);
      const x = (p.px + (p.x - p.px) * alpha) * TILE;
      const y = (p.py + (p.y - p.py) * alpha) * TILE;
      if (!v) {
        const defId = this.towerDefOf.get(p.owner) ?? state.towers.find((t) => t.id === p.owner)?.def;
        const def = defId ? ctx.towerIndex[defId] : undefined;
        const entry = def ? this.sprites!.projectile(def) : null;
        const sprite = new Sprite(entry ? entry.texture : Texture.WHITE);
        sprite.anchor.set(0.5);
        if (entry) {
          sprite.width = entry.width;
          sprite.height = entry.height;
        } else {
          sprite.width = 6;
          sprite.height = 6;
        }
        this.projectileLayer.addChild(sprite);
        v = { sprite, color: def ? projectileColor(def) : 0xffffff, lastX: x, lastY: y };
        this.projectiles.set(p.id, v);
      }
      v.sprite.position.set(x, y);
      const ddx = p.x - p.px;
      const ddy = p.y - p.py;
      if (ddx !== 0 || ddy !== 0) v.sprite.rotation = Math.atan2(ddy, ddx);
      // trail: one dot per frame while it moves a visible distance
      const mx = x - v.lastX;
      const my = y - v.lastY;
      if (mx * mx + my * my > 9) {
        this.effects!.trail(v.lastX, v.lastY, v.color);
        v.lastX = x;
        v.lastY = y;
      }
    }
    for (const [id, v] of this.projectiles) {
      if (!seen.has(id)) {
        v.sprite.destroy();
        this.projectiles.delete(id);
      }
    }
  }

  private drawOverlay(state: SimState, ctx: SimContext, overlay: RenderFrame['overlay']): void {
    const g = this.hoverLayer;
    const r = this.rangeLayer;
    g.clear();
    r.clear();

    if (overlay.selected !== null) {
      const t = state.towers.find((tw) => tw.id === overlay.selected);
      if (t) {
        const stats = towerStats(ctx.towerIndex[t.def], t.tier, t.branch);
        r.circle(t.col * TILE + TILE / 2, t.row * TILE + TILE / 2, stats.range * TILE)
          .fill({ color: 0xb9f0a8, alpha: 0.08 })
          .stroke({ width: 2, color: 0xb9f0a8, alpha: 0.5 });
        g.ellipse(t.col * TILE + TILE / 2, t.row * TILE + TILE / 2 + 8, TILE * 0.42, TILE * 0.22).stroke({ width: 3, color: 0xffffff, alpha: 0.8 });
      }
    }

    if (state.seats > 1) {
      // a shared board: a thin ring in the owner's colour under every tower that is not yours
      for (const t of state.towers) {
        if (t.owner === overlay.seat) continue;
        g.ellipse(t.col * TILE + TILE / 2, t.row * TILE + TILE / 2 + 9, TILE * 0.4, TILE * 0.2).stroke({ width: 2, color: seatColorHex(t.owner), alpha: 0.75 });
      }
    }

    // upgrade-ready badge: a small chevron over every tower of yours whose next tier you can afford now
    const sap = wallet(state, overlay.seat);
    for (const t of state.towers) {
      if (t.owner !== overlay.seat) continue;
      const cost = upgradeCost(ctx, t);
      if (cost === null || sap < cost) continue;
      const x = t.col * TILE + TILE / 2 + TILE * 0.34;
      const y = t.row * TILE + TILE / 2 - TILE * 0.52 - 2 * Math.sin(this.auraPhase * 5 + t.id);
      g.circle(x, y, 13).fill({ color: 0x0b1a12, alpha: 0.9 }).stroke({ width: 2.5, color: 0xf2c14e, alpha: 1 });
      g.poly([x - 7, y + 4, x, y - 6, x + 7, y + 4], true).fill({ color: 0xf2c14e });
    }

    // a pad tapped before a tower was chosen
    if (overlay.padPick && !overlay.placing && !overlay.pending) {
      const cx = overlay.padPick.col * TILE + TILE / 2;
      const cy = overlay.padPick.row * TILE + TILE / 2;
      const pulse = 0.5 + 0.5 * Math.sin(this.auraPhase * 8);
      g.ellipse(cx, cy + 8, TILE * 0.4, TILE * 0.22).stroke({ width: 3, color: 0xffe9a6, alpha: 0.6 + 0.4 * pulse });
    }

    // the ghost: on the pending pad (confirm step) or under the pointer
    const target = overlay.pending ?? overlay.hover;
    if (target) {
      const { col, row } = target;
      const i = cellIndex(state.cols, col, row);
      const cx = col * TILE + TILE / 2;
      const cy = row * TILE + TILE / 2;
      if (overlay.placing) {
        const def = ctx.towerIndex[overlay.placing];
        const valid = state.grid[i] === TILE_KIND.pad && state.occupied[i] === -1 && sap >= towerCost(ctx, def);
        const color = valid ? 0x7fd36b : 0xe85a3a;
        const stats = towerStats(def, 1, null);
        const pending = overlay.pending !== null;
        r.circle(cx, cy, stats.range * TILE).fill({ color, alpha: pending ? 0.12 : 0.08 }).stroke({ width: pending ? 3 : 2, color, alpha: pending ? 0.7 : 0.45 });
        g.ellipse(cx, cy + 8, TILE * 0.36, TILE * 0.2).fill({ color, alpha: 0.35 }).stroke({ width: pending ? 3 : 2, color, alpha: 0.9 });
      } else if (state.occupied[i] !== -1 || state.grid[i] === TILE_KIND.pad) {
        g.ellipse(cx, cy + 8, TILE * 0.38, TILE * 0.2).stroke({ width: 2, color: 0xffffff, alpha: 0.35 });
      }
    }
  }
}

export type { Tower };
