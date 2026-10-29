// Extra Terram — src/render/PixiRenderer.ts v0.15.0 — a tilted camera: the ground drawn to a texture and shown in perspective, lit by a normal map and the shots; everything that stands is placed at its projected foot
// PixiJS v8 renderer. It is driven by the app's loop (no Pixi ticker): the loop decides when a
// frame is worth drawing, this class only draws. Heat controls live in the loop (fps cap, idle
// between waves) and here (resolution cap, generated textures cached once, no per-frame filters,
// one pooled effects batch).
//
// Two groups of layers. The ground group (the painting, pad rings, aura fields, shadows, the
// placing ring, hive threads) is drawn in board px into one texture a frame, and the Ground mesh
// shows that texture in the camera's perspective, lit (ground.ts). The upright group (towers,
// creeps, shots, bars, labels, particles) is in screen px: every sprite is placed at the projection
// of its board position and scaled by the local tile width (camera.ts). With the camera flat the
// two coincide with the old fit-to-host board.
import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { Camera, FLAT, TILT_LANDSCAPE, TILT_PORTRAIT, place } from './camera';
import { Ground, normalMapFor } from './ground';
import { TILE as TILE_KIND, cellIndex, passiveFor, passiveMods, reinforceCost, towerCost, towerStats, upgradeCost, wallet, type SimContext, type SimEvent, type SimState, type Tower } from '../engine';
import { StripPlayer } from './anim';
import { DAMAGE_COLOR, Effects } from './effects';
import { PaintedFx, type TowerPose } from './paintedFx';
import type { CameraOptions, Cell, RenderFrame, Renderer } from './renderer';
import { SpriteLibrary, TILE, hasTurret, type Strip } from './sprites';
import type { Point } from './spriteIndex';
import { projectileColor, turretMount } from './vectorArt';
import { seatColorHex, sideColorIndex } from './seats';

export { TILE };
const MAX_RESOLUTION = 2;
/** Painted aura fields are drawn this opaque over the ground (the handoff's ~60%, raised for their thin line work). */
const FIELD_ALPHA = 0.75;

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
  /** Turret pivot (turret towers) or emitter (the rest), board px from the cell centre. */
  mount: Point;
  /** A painted turret's muzzle distance in front of the pivot, board px (0 without one). */
  reach: number;
  /** The sprite library's stripsVersion when this view last looked for its strips. */
  stripsVersion: number;
  anim: StripPlayer; // body idle/fire
  turretAnim: StripPlayer | null;
  fire: Strip | null; // body fire strip, played on each shot
  turretFire: Strip | null;
  phase: number; // procedural idle phase
  flinch: number; // 1 right after a shot, decays
  baseW: number;
  baseH: number;
  turretW: number;
  turretH: number;
  /** The cell centre, board px. */
  cx: number;
  cy: number;
  painted: boolean;
  /** Passive effect sprites, made only when the race's fx art exists. */
  fxGround: Sprite | null; // rooted tendrils under the tower
  fxGlow: Sprite | null; // spin-up ring or overcharge flash at the mount
  burst: number; // overcharge shot flash, decays
}

interface CreepView {
  body: Sprite;
  /** Where it is, board px (the body itself is placed in screen px by the camera). */
  bx: number;
  by: number;
  /** Painted creeps are three-quarter views: they mirror left/right instead of rotating. */
  painted: boolean;
  facing: 1 | -1;
  anim: StripPlayer;
  die: Strip | null;
  phase: number;
  baseW: number;
  baseH: number;
  speed: number; // tiles per second, for the walk cadence
  def: string;
  stripsVersion: number;
  shadow: Sprite;
  hpBack: Sprite;
  hpFront: Sprite;
  /** Mini-bosses only: a pulsing ring on the ground and a gold frame round the big health bar. */
  bossRing: Sprite | null;
  hpFrame: Sprite | null;
  slowRing: Sprite;
  stun: Sprite[];
  dripTimer: number;
}

interface ProjectileView {
  sprite: Sprite;
  w: number;
  h: number;
  color: number;
  lastX: number;
  lastY: number;
  /** Where it left the simulation (the cell centre) and how far the muzzle sits from there, board px. */
  spawnX: number;
  spawnY: number;
  offX: number;
  offY: number;
}

export class PixiRenderer implements Renderer {
  private app = new Application();
  private canvas: HTMLCanvasElement | null = null;
  private width = 1;
  private height = 1;
  private cols = 1;
  private rows = 1;

  /** The upright group, in screen px. */
  private board = new Container();
  /** The ground group, in board px: rendered to the Ground's texture, never to the screen directly. */
  private groundRoot = new Container();
  private cam = new Camera();
  private cameraOpts: CameraOptions = { tilt: true, lighting: true };
  private ground: Ground | null = null;
  private painting: Texture | null = null;
  private badgeLayer = new Graphics();
  private bgLayer = new Container();
  private padLayer = new Graphics();
  private fieldLayer = new Container(); // painted aura fields, under everything that moves
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
  private painted: PaintedFx | null = null;
  private fields = new Map<number, Sprite>();
  private towers = new Map<number, TowerView>();
  private creeps = new Map<number, CreepView>();
  /** One-shot death animations playing where a creep died. */
  private ghosts: Array<{ sprite: Sprite; anim: StripPlayer }> = [];
  private projectiles = new Map<number, ProjectileView>();
  private softShadow: Texture | null = null;
  private slowRingTex: Texture | null = null;
  private stunTex: Texture | null = null;
  private padKey = '';
  /** While placing: a small number on every buildable pad, the trail cells the chosen tower's range covers from there. */
  private coverLayer = new Container();
  private coverLabels = new Map<number, Text>();
  private coverKey = '';
  private coverCache = new Map<string, Map<number, number>>();
  private mounted = false;
  private auraPhase = 0;
  private lastTick = 0;
  private towerDefOf = new Map<number, string>();
  private ctx: SimContext | null = null;
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
      preference: 'webgl', // the ground shader is written for WebGL
    });
    this.mounted = true;
    this.sprites = new SpriteLibrary(this.app.renderer);
    const project = (x: number, y: number) => this.cam.project(x, y);
    this.effects = new Effects(this.app.renderer, project);
    this.painted = new PaintedFx(this.sprites, (id) => this.towerPose(id), project);
    this.groundRoot.addChild(this.bgLayer, this.padLayer, this.fieldLayer, this.auraLayer, this.rangeLayer, this.shadowLayer, this.groundFxLayer, this.threadLayer, this.hoverLayer);
    this.board.addChild(this.towerLayer, this.glowLayer, this.creepLayer, this.projectileLayer, this.effects.container, this.painted.normal, this.painted.additive, this.hpLayer, this.coverLayer, this.badgeLayer);
    this.creepLayer.sortableChildren = true;
    this.towerLayer.sortableChildren = true;
    this.makeSharedTextures();
    await Promise.all([this.loadBackground(ctx), this.sprites.load()]);
    const normal = await normalMapFor(ctx, this.painting);
    this.normal = normal;
    this.resize(width, height);
    this.app.stage.addChild(this.board);
  }
  private normal: Texture | null = null;

  /** The camera: tilted or flat, the ground lit or as painted. Takes effect on the next resize/draw. */
  setCamera(opts: CameraOptions): void {
    this.cameraOpts = { ...opts };
    if (this.mounted) this.resize(this.width, this.height);
  }

  /** (Re)make the ground mesh for the current fit: its texture holds about one texel per screen px of the near edge. */
  private ensureGround(): void {
    if (!this.mounted || !this.normal) return;
    const want = Math.min(1.5, Math.max(0.35, this.cam.scale * Math.min(window.devicePixelRatio || 1, MAX_RESOLUTION)));
    if (this.ground && Math.abs(this.ground.target.source.resolution - want) / want < 0.25) {
      this.ground.setCorners(this.cam.corners);
      this.ground.setLit(this.cameraOpts.lighting);
      return;
    }
    const old = this.ground;
    this.ground = new Ground(this.app.renderer, this.cols * TILE, this.rows * TILE, this.cols, this.rows, this.normal, want);
    this.ground.setCorners(this.cam.corners);
    this.ground.setLit(this.cameraOpts.lighting);
    this.app.stage.addChildAt(this.ground.mesh, 0);
    old?.destroy();
  }

  /** True when any tower on the board plays a looping idle strip (the loop keeps a low frame rate for them). */
  hasIdleAnimation(): boolean {
    for (const v of this.towers.values()) if (v.anim.animated) return true;
    return false;
  }

  /** Battery saver halves particle counts and is set by the shell after mount. */
  setEffectsScale(scale: number): void {
    if (this.effects) this.effects.scale = scale;
    if (this.painted) this.painted.scale = scale;
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
      this.painting = texture;
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
    const tilt = !this.cameraOpts.tilt ? FLAT : this.width > this.height * 1.1 ? TILT_LANDSCAPE : TILT_PORTRAIT;
    this.cam.fit(bw, bh, this.width, this.height, tilt);
    this.ensureGround();
    // the ground group renders at board px; the mesh does the fit
    this.groundRoot.scale.set(1);
    this.groundRoot.position.set(0, 0);
    this.coverKey = ''; // labels are placed by the camera: lay them out again
  }

  /** The canvas point (CSS px) of a cell's centre: the inverse of screenToCell, for tests and the art preview. */
  cellToScreen(col: number, row: number): { x: number; y: number } {
    const p = this.cam.project(col * TILE + TILE / 2, row * TILE + TILE / 2);
    const rect = this.canvas?.getBoundingClientRect();
    const kx = rect ? rect.width / this.width : 1;
    const ky = rect ? rect.height / this.height : 1;
    return { x: p.x * kx, y: p.y * ky };
  }

  screenToCell(clientX: number, clientY: number): Cell | null {
    if (!this.canvas) return null;
    const rect = this.canvas.getBoundingClientRect();
    const X = ((clientX - rect.left) * this.width) / Math.max(1, rect.width);
    const Y = ((clientY - rect.top) * this.height) / Math.max(1, rect.height);
    const { x, y } = this.cam.unproject(X, Y);
    const col = Math.floor(x / TILE);
    const row = Math.floor(y / TILE);
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return null;
    return { col, row };
  }

  /** Feed one tick's events; the shell calls this after every sim step. */
  pushEvents(events: SimEvent[], ctx: SimContext, state: SimState): void {
    if (!this.effects) return;
    this.ctx = ctx;
    const colorOf = (towerId: number): number => {
      const t = state.towers.find((tw) => tw.id === towerId);
      return t ? projectileColor(ctx.towerIndex[t.def]) : 0xffffff;
    };
    for (const ev of events) {
      if (ev.kind === 'beam' && ev.alpha) {
        const view = this.towers.get(ev.tower);
        if (view) view.burst = 1;
      } else if (ev.kind === 'fire') {
        const view = this.towers.get(ev.tower);
        if (view) {
          // aim from where the turret turns (its pivot), not from the cell centre under it
          view.targetAim = Math.atan2(ev.ty * TILE - (ev.y * TILE + view.mount.y), ev.tx * TILE - (ev.x * TILE + view.mount.x));
          view.recoil = 1;
          view.flinch = 1;
          if (ev.alpha) view.burst = 1;
          if (view.fire) view.anim.play(view.fire);
          if (view.turretAnim && view.turretFire) view.turretAnim.play(view.turretFire);
        }
      } else if (ev.kind === 'kill') {
        const view = [...this.creeps.values()].find((v) => v.die && Math.abs(v.bx - ev.x * TILE) < 1 && Math.abs(v.by - ev.y * TILE) < 1);
        const def = ctx.creepIndex[ev.creep];
        const die = this.sprites?.creepStrip(def, 'die') ?? null;
        if (die) {
          const g = new Sprite(die.frames[0]);
          g.anchor.set(0.5);
          const entry = this.sprites!.creep(def);
          const at = place(this.cam, g, ev.x * TILE, ev.y * TILE, entry.width, entry.height);
          g.zIndex = at.y;
          if (view) g.scale.x = Math.abs(g.scale.x) * view.facing;
          this.creepLayer.addChild(g);
          const anim = new StripPlayer(g, die.frames[0], null);
          anim.play(die);
          this.ghosts.push({ sprite: g, anim });
        }
      }
      // effects after the views, so a muzzle flash sees the new aim; painted when the art is there
      if (this.painted?.handle(ev)) {
        if (ev.kind === 'beam') this.effects.beamFlash(ev.tx * TILE, ev.ty * TILE, ev.damageType);
      } else {
        this.effects.handle(ev, colorOf);
      }
      this.light(ev, colorOf);
    }
  }

  /** The light a sim event throws on the ground (ground.ts draws it): muzzle flashes, impacts, deaths, the base, building. */
  private light(ev: SimEvent, colorOf: (towerId: number) => number): void {
    const g = this.ground;
    if (!g) return;
    switch (ev.kind) {
      case 'fire':
        g.flash(ev.x * TILE, ev.y * TILE, colorOf(ev.tower), TILE * 1.1, ev.alpha ? 1.4 : 0.8, 4);
        break;
      case 'beam':
        g.flash(ev.tx * TILE, ev.ty * TILE, DAMAGE_COLOR[ev.damageType], TILE * 0.9, 0.7, 3);
        break;
      case 'hit':
        if (ev.splash) g.flash(ev.x * TILE, ev.y * TILE, DAMAGE_COLOR[ev.damageType], TILE * (1.2 + ev.splash), 1.3, 8);
        else g.flash(ev.x * TILE, ev.y * TILE, DAMAGE_COLOR[ev.damageType], TILE * 0.7, 0.55, 4);
        break;
      case 'kill':
        g.flash(ev.x * TILE, ev.y * TILE, ev.armor === 'plated' ? 0xffb347 : ev.armor === 'shielded' ? 0x9ff0ff : ev.armor === 'carapace' ? 0x9fe84a : 0xd9c25a, TILE * 1.1, 0.9, 9);
        break;
      case 'leak':
        g.flash(ev.x * TILE, ev.y * TILE, 0xe85a3a, TILE * 1.8, 1.3, 12);
        break;
      case 'place':
        g.flash(ev.x * TILE, ev.y * TILE, 0x9fe8c0, TILE * 1.4, 0.9, 12);
        break;
      case 'upgrade':
        g.flash(ev.x * TILE, ev.y * TILE, 0xe8c33a, TILE * 1.4, 1.0, 12);
        break;
      case 'sell':
        g.flash(ev.x * TILE, ev.y * TILE, 0xc47a1e, TILE * 1.2, 0.7, 8);
        break;
      default:
        break;
    }
  }

  /** Where a tower's shots leave it right now (for painted muzzle flashes and beams). */
  private towerPose(id: number): TowerPose | null {
    const view = this.towers.get(id);
    const defId = this.towerDefOf.get(id);
    if (!view || !defId || !this.ctx) return null;
    const def = this.ctx.towerIndex[defId];
    if (!def) return null;
    const cx = view.cx;
    const cy = view.cy;
    const back = view.recoil * 3;
    return {
      def,
      cx,
      cy,
      mx: cx + view.mount.x,
      my: cy + view.mount.y,
      aim: view.turret ? view.aim : null,
      reach: view.turret ? Math.max(0, view.reach - back) : 0,
    };
  }

  draw(frame: RenderFrame): void {
    if (!this.mounted || !this.sprites || !this.effects) return;
    const { state, ctx, alpha, overlay } = frame;
    this.ctx = ctx;
    const dtTicks = state.tick - this.lastTick + (alpha - (this.lastAlpha ?? 0));
    this.lastTick = state.tick;
    this.lastAlpha = alpha;
    const dt = Math.max(0, Math.min(3, dtTicks));
    this.auraPhase += dt * 0.02;

    this.drawPads(state, ctx, overlay.showPads || overlay.placing !== null, overlay.seat);
    this.drawCoverage(state, ctx, overlay);
    this.drawAuras(state, ctx);
    this.drawTowers(state, ctx, dt);
    this.drawCreeps(state, ctx, alpha, dt);
    this.drawProjectiles(state, ctx, alpha);
    this.drawGhosts(dt);
    this.effects.update(dt);
    this.painted?.update(dt);
    this.drawOverlay(state, ctx, overlay);
    if (this.ground) {
      this.ground.update(dt);
      this.ground.render(this.app.renderer, this.groundRoot);
    }
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
    this.painted?.destroy();
    this.painted = null;
    this.fields.clear();
    // Generated textures are ours to free; the painted sprites and backgrounds belong to the Assets
    // cache and stay loaded for the next run (destroying them here only forced a re-decode and a
    // "managed by Assets" warning on every replay).
    for (const t of [this.softShadow, this.slowRingTex, this.stunTex]) t?.destroy(true);
    this.softShadow = this.slowRingTex = this.stunTex = null;
    this.ground?.destroy();
    this.ground = null;
    this.groundRoot.destroy({ children: true });
    this.app.destroy(false, { children: true });
  }

  // ------------------------------------------------------------ layers

  private drawPads(state: SimState, ctx: SimContext, show: boolean, seat: number): void {
    const key = `${show}|${state.towers.length}|${state.slotSide.join(',')}|${seat}`;
    if (key === this.padKey) return;
    this.padKey = key;
    const g = this.padLayer;
    g.clear();
    // versus boards always mark whose pad is whose; elsewhere pads only show on request or while placing
    if (!show && !state.versus) return;
    const mySide = state.versus ? (state.seatSide[seat] ?? -1) : -1;
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const i = cellIndex(state.cols, c, r);
        if (state.grid[i] !== TILE_KIND.pad || state.occupied[i] !== -1) continue;
        const x = c * TILE + TILE / 2;
        const y = r * TILE + TILE / 2;
        const zone = state.versus ? (ctx.zones[i] ?? -1) : -1;
        const owner = zone >= 0 ? state.slotSide[zone] : -1;
        // an owned pad carries a small ring in its owner's colour on a dark neutral disc (shared pads and closed ground none):
        // the disc keeps the ring and a tower's foot readable on any ground, the magenta hive floor included
        if (owner >= 0) {
          g.circle(x, y, TILE * 0.22).fill({ color: 0x07090c, alpha: 0.5 });
          g.circle(x, y, TILE * 0.15).stroke({ width: 6, color: 0x000000, alpha: 0.5 });
          g.circle(x, y, TILE * 0.15).stroke({ width: 2.5, color: this.sideColor(state, owner), alpha: owner === mySide ? 0.95 : 0.7 });
        }
        if (zone >= 0 && owner !== mySide) {
          // a rival's pad: while placing, a faint ring in its owner's colour, never the buildable green
          if (show && owner >= 0) g.circle(x, y, TILE * 0.3).stroke({ width: 1.5, color: this.sideColor(state, owner), alpha: 0.3 });
          continue;
        }
        if (show) {
          g.circle(x, y, TILE * 0.34).fill({ color: 0x07090c, alpha: 0.28 });
          g.circle(x, y, TILE * 0.34).stroke({ width: 5, color: 0x000000, alpha: 0.35 });
          g.circle(x, y, TILE * 0.34).stroke({ width: 2, color: 0xb9f0a8, alpha: 0.75 });
        }
      }
    }
  }

  /** A versus side's colour (its player's, or its team's in 2 v 2). */
  private sideColor(state: SimState, side: number): number {
    const sd = state.sides[side];
    return seatColorHex(sideColorIndex(state.teams, side, sd?.seats[0] ?? side));
  }

  /** Ground rings under aura towers (slow fields), support towers (buff links) and economy towers (a soft gold pool). */
  private drawAuras(state: SimState, ctx: SimContext): void {
    const g = this.auraLayer;
    g.clear();
    const liveFields = new Set<number>();
    for (const t of state.towers) {
      const def = ctx.towerIndex[t.def];
      const cx = t.col * TILE + TILE / 2;
      const cy = t.row * TILE + TILE / 2;
      if (def.attack === 'aura') {
        const stats = towerStats(def, t.tier, t.branch);
        const r = stats.range * TILE;
        // a painted field (optional art) replaces the ring, spokes and motes: under the creeps, turning slowly
        const fieldTex = this.sprites?.fx(def.race, `field-${def.id}`) ?? null;
        if (fieldTex) {
          liveFields.add(t.id);
          let field = this.fields.get(t.id);
          if (!field) {
            field = new Sprite(fieldTex);
            field.anchor.set(0.5);
            this.fieldLayer.addChild(field);
            this.fields.set(t.id, field);
          }
          field.position.set(cx, cy);
          field.width = r * 2;
          field.height = r * 2;
          field.rotation = this.auraPhase * 0.25 + t.id * 0.7;
          field.alpha = FIELD_ALPHA;
          field.tint = t.tier === 3 && t.branch === 'a' ? 0xbcbcbc : 0xffffff;
          // a faint wash in the tower's colour keeps the zone readable under the field's thin line work
          g.circle(cx, cy, r).fill({ color: hexColor(def.color), alpha: 0.08 });
          continue;
        }
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
    for (const [id, field] of this.fields) {
      if (!liveFields.has(id)) {
        field.destroy();
        this.fields.delete(id);
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
        const lib = this.sprites!;
        const entry = lib.tower(def, t.tier, t.branch);
        // painted bodies: a turret turns on its pivot, everything else shoots from its emitter (mounts.json)
        const mount: Point = !entry.image
          ? { x: 0, y: -turretMount(def, t.tier, TILE) }
          : hasTurret(def)
            ? lib.pivot(def, t.tier, t.branch)
            : lib.emitter(def, t.tier, t.branch);
        const body = new Sprite(entry.texture);
        body.anchor.set(entry.ax, entry.ay);
        place(this.cam, body, t.col * TILE + TILE / 2, t.row * TILE + TILE / 2, entry.width, entry.height);
        body.zIndex = t.row * 2;
        this.towerLayer.addChild(body);
        let turret: Sprite | null = null;
        let turretW = 0;
        let turretH = 0;
        if (hasTurret(def)) {
          const te = this.sprites!.turret(def, t.tier, t.branch, entry.image);
          if (te) {
            turret = new Sprite(te.texture);
            turret.anchor.set(te.ax, te.ay);
            turretW = te.width;
            turretH = te.height;
            place(this.cam, turret, t.col * TILE + TILE / 2 + mount.x, t.row * TILE + TILE / 2 + mount.y, te.width, te.height);
            turret.zIndex = t.row * 2 + 1;
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
          reach: turret && entry.image ? lib.reach(def, t.tier, t.branch) : 0,
          stripsVersion: lib.stripsVersion,
          anim: new StripPlayer(body, entry.texture, idle, phase),
          turretAnim: turret ? new StripPlayer(turret, turret.texture, null) : null,
          fire,
          turretFire,
          phase,
          flinch: 0,
          baseW: entry.width,
          baseH: entry.height,
          turretW,
          turretH,
          cx: t.col * TILE + TILE / 2,
          cy: t.row * TILE + TILE / 2,
          painted: entry.image,
          fxGround: null,
          fxGlow: null,
          burst: 0,
        };
        this.towers.set(t.id, view);
        this.towerDefOf.set(t.id, t.def);
      }
      // strips load on demand: attach any that arrived since this view last looked
      if (view.painted && view.stripsVersion !== this.sprites!.stripsVersion) {
        const lib = this.sprites!;
        view.stripsVersion = lib.stripsVersion;
        view.anim.setLoop(lib.towerStrip(def, t.tier, t.branch, 'idle'));
        view.fire ??= lib.towerStrip(def, t.tier, t.branch, 'fire');
        if (view.turret) view.turretFire ??= lib.turretStrip(def, t.tier, t.branch);
      }
      // animation: a strip when there is one, otherwise a slow breath and a flinch on fire
      view.anim.update(dt);
      view.turretAnim?.update(dt);
      view.flinch = Math.max(0, view.flinch - 0.2 * dt);
      const cx = t.col * TILE + TILE / 2;
      const cy = t.row * TILE + TILE / 2;
      let bw = view.baseW;
      let bh = view.baseH;
      if (view.painted && !view.anim.animated) {
        const breath = 1 + 0.015 * Math.sin(this.auraPhase * 2.2 + view.phase);
        const squash = view.flinch > 0 && !view.turret ? 1 + 0.06 * view.flinch : 1;
        bw = view.baseW * breath * squash;
        bh = (view.baseH * (2 - breath)) / squash;
      }
      // the strip player may swap textures; the camera sets the size every frame
      place(this.cam, view.body, cx, cy, bw, bh);
      if (view.turret) {
        // ease toward the target angle along the shortest arc
        let diff = view.targetAim - view.aim;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        view.aim += diff * Math.min(1, 0.35 * dt + 0.15);
        view.turret.rotation = view.aim;
        view.recoil = Math.max(0, view.recoil - 0.25 * dt);
        const back = view.recoil * 3;
        place(this.cam, view.turret, cx + view.mount.x - Math.cos(view.aim) * back, cy + view.mount.y - Math.sin(view.aim) * back, view.turretW, view.turretH);
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
          place(this.cam, view.fxGlow, cx + view.mount.x, cy + view.mount.y, TILE * 0.9, TILE * 0.9);
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
          place(this.cam, view.fxGlow, cx + view.mount.x, cy + view.mount.y, size, size);
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
        let bossRing: Sprite | null = null;
        let hpFrame: Sprite | null = null;
        if (def.archetype === 'boss') {
          bossRing = new Sprite(this.slowRingTex!);
          bossRing.anchor.set(0.5);
          bossRing.tint = 0xf2c14e;
          this.groundFxLayer.addChild(bossRing);
          hpFrame = new Sprite(Texture.WHITE);
          hpFrame.tint = 0xf2c14e;
          this.hpLayer.addChildAt(hpFrame, this.hpLayer.getChildIndex(hpBack));
        }
        if (c.sentBy >= 0) {
          // a rival's send: its shadow and health bar carry the sender's seat colour
          shadow.tint = seatColorHex(c.sentBy);
          shadow.alpha = 0.6;
          hpFront.tint = seatColorHex(c.sentBy);
        }
        if (state.versus) {
          // versus: the shadow wears the colour of the lane or base the creep is going for
          shadow.alpha = 0.7;
        }
        const walk = entry.image ? this.sprites!.creepStrip(def, 'walk') : null;
        const die = entry.image ? this.sprites!.creepStrip(def, 'die') : null;
        const phase = ((c.id * 0.618) % 1) * Math.PI * 2;
        v = {
          body,
          bx: 0,
          by: 0,
          painted: entry.image,
          facing: 1,
          anim: new StripPlayer(body, entry.texture, walk, phase),
          die,
          phase,
          baseW: body.width,
          baseH: body.height,
          speed: def.speed,
          def: c.def,
          stripsVersion: this.sprites!.stripsVersion,
          shadow,
          hpBack,
          hpFront,
          bossRing,
          hpFrame,
          slowRing,
          stun,
          dripTimer: 0,
        };
        this.creeps.set(c.id, v);
      }
      const x = (c.px + (c.x - c.px) * alpha) * TILE;
      const y = (c.py + (c.y - c.py) * alpha) * TILE;
      v.bx = x;
      v.by = y;
      v.shadow.position.set(x + 2, y + 5);
      if (state.versus) {
        // the target can change (a King base falls and the creep turns to another), so tint every frame
        const side = state.slotSide[c.route] ?? -1;
        v.shadow.tint = side >= 0 ? this.sideColor(state, side) : 0x555555;
      }
      const dx = c.x - c.px;
      const dy = c.y - c.py;
      const moving = (dx !== 0 || dy !== 0) && c.stunTicks === 0;
      if (v.painted && v.stripsVersion !== this.sprites!.stripsVersion) {
        // strips load on demand: attach the walk loop (and keep the die strip) once they arrive
        const lib = this.sprites!;
        const def = ctx.creepIndex[v.def];
        v.stripsVersion = lib.stripsVersion;
        v.anim.setLoop(lib.creepStrip(def, 'walk'));
        v.die ??= lib.creepStrip(def, 'die');
      }
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
        const at = place(this.cam, v.body, x, y + bobY, v.baseW * stretch, v.baseH / stretch);
        v.body.scale.x = Math.abs(v.body.scale.x) * v.facing;
        v.body.zIndex = at.y;
        const lean = dy !== 0 || dx !== 0 ? Math.atan2(dy, Math.abs(dx) + 0.0001) : 0;
        v.body.rotation = v.facing * Math.max(-0.35, Math.min(0.35, lean * 0.4)) + roll;
      } else {
        const at = place(this.cam, v.body, x, y, v.baseW, v.baseH);
        v.body.zIndex = at.y;
        if (dx !== 0 || dy !== 0) v.body.rotation = Math.atan2(dy, dx);
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
          place(this.cam, s, x + Math.cos(a) * 12, y - 10 + Math.sin(a) * 4, 7, 7);
        }
      }

      const ratio = Math.max(0, c.hp / c.maxHp);
      if (v.bossRing && v.hpFrame) {
        // a mini-boss: ring underfoot, and a wide health bar that is always shown
        const pulse = 0.5 + 0.5 * Math.sin(this.auraPhase * 5 + v.phase);
        v.bossRing.position.set(x, y + TILE * 0.25);
        v.bossRing.width = TILE * (1.7 + 0.15 * pulse);
        v.bossRing.height = TILE * (0.8 + 0.07 * pulse);
        v.bossRing.alpha = 0.45 + 0.35 * pulse;
        const w = TILE * 1.4;
        const h = 8;
        const top = y - TILE * 1.15;
        place(this.cam, v.hpFrame, x - w / 2 - 2, top - 2, w + 4, h + 4);
        v.hpBack.visible = true;
        v.hpFront.visible = true;
        place(this.cam, v.hpBack, x - w / 2, top, w, h);
        place(this.cam, v.hpFront, x - w / 2, top, Math.max(0.01, w * ratio), h);
        v.hpFront.tint = ratio > 0.5 ? 0xe85a3a : ratio > 0.25 ? 0xff8a3a : 0xffd27a;
        continue;
      }
      const show = ratio < 1;
      v.hpBack.visible = show;
      v.hpFront.visible = show;
      if (show) {
        const w = TILE * 0.6;
        const h = 5;
        place(this.cam, v.hpBack, x - w / 2, y - TILE * 0.42, w, h);
        place(this.cam, v.hpFront, x - w / 2, y - TILE * 0.42, Math.max(0.01, w * ratio), h);
        v.hpFront.tint = ratio > 0.5 ? 0x7fd36b : ratio > 0.25 ? 0xe8c33a : 0xe85a3a;
      }
    }
    for (const [id, v] of this.creeps) {
      if (!seen.has(id)) {
        v.body.destroy();
        v.shadow.destroy();
        v.hpBack.destroy();
        v.hpFront.destroy();
        v.bossRing?.destroy();
        v.hpFrame?.destroy();
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
        const pw = entry ? entry.width : 6;
        const ph = entry ? entry.height : 6;
        this.projectileLayer.addChild(sprite);
        // the simulation launches every shot from the cell centre; a painted tower's shot is drawn from
        // its muzzle instead, the offset easing away over the first half tile (render only)
        const tv = this.towers.get(p.owner);
        let spawnX = x;
        let spawnY = y;
        let offX = 0;
        let offY = 0;
        if (tv && tv.painted) {
          spawnX = tv.cx;
          spawnY = tv.cy;
          offX = tv.mount.x + (tv.turret ? Math.cos(tv.targetAim) * tv.reach : 0);
          offY = tv.mount.y + (tv.turret ? Math.sin(tv.targetAim) * tv.reach : 0);
        }
        v = { sprite, w: pw, h: ph, color: def ? projectileColor(def) : 0xffffff, lastX: x + offX, lastY: y + offY, spawnX, spawnY, offX, offY };
        this.projectiles.set(p.id, v);
      }
      const travelled = Math.sqrt((x - v.spawnX) ** 2 + (y - v.spawnY) ** 2);
      const k = Math.max(0, 1 - travelled / (TILE * 0.5));
      const dxw = x + v.offX * k;
      const dyw = y + v.offY * k;
      place(this.cam, v.sprite, dxw, dyw, v.w, v.h);
      const ddx = p.x - p.px;
      const ddy = p.y - p.py;
      if (ddx !== 0 || ddy !== 0) v.sprite.rotation = Math.atan2(ddy, ddx);
      // trail: one dot per frame while it moves a visible distance
      const mx = dxw - v.lastX;
      const my = dyw - v.lastY;
      if (mx * mx + my * my > 9) {
        this.effects!.trail(v.lastX, v.lastY, v.color);
        v.lastX = dxw;
        v.lastY = dyw;
      }
    }
    for (const [id, v] of this.projectiles) {
      if (!seen.has(id)) {
        v.sprite.destroy();
        this.projectiles.delete(id);
      }
    }
  }

  /** Trail cells within `range` tiles of each pad centre (a map constant per range, cached): the number a pad shows while placing. */
  private coverage(state: SimState, range: number): Map<number, number> {
    const key = `${state.cols}x${state.rows}|${range.toFixed(2)}`;
    const hit = this.coverCache.get(key);
    if (hit) return hit;
    const trail: Array<[number, number]> = [];
    for (let r = 0; r < state.rows; r++) for (let c = 0; c < state.cols; c++) if (state.grid[cellIndex(state.cols, c, r)] === TILE_KIND.path) trail.push([c + 0.5, r + 0.5]);
    const out = new Map<number, number>();
    const r2 = range * range;
    for (let r = 0; r < state.rows; r++)
      for (let c = 0; c < state.cols; c++) {
        const i = cellIndex(state.cols, c, r);
        if (state.grid[i] !== TILE_KIND.pad) continue;
        let n = 0;
        for (const [x, y] of trail) if ((x - c - 0.5) ** 2 + (y - r - 0.5) ** 2 <= r2) n++;
        out.set(i, n);
      }
    this.coverCache.set(key, out);
    return out;
  }

  /** While a tower is chosen: every pad the player may build on shows how many trail cells that tower would reach from it. */
  private drawCoverage(state: SimState, ctx: SimContext, overlay: RenderFrame['overlay']): void {
    const def = overlay.placing ? ctx.towerIndex[overlay.placing] : null;
    const key = def ? `${def.id}|${state.towers.length}|${state.slotSide.join(',')}|${overlay.seat}` : '';
    if (key === this.coverKey) return;
    this.coverKey = key;
    for (const t of this.coverLabels.values()) t.visible = false;
    if (!def) return;
    const range = towerStats(def, 1, null).range;
    if (range <= 0) return; // economy and support towers: no trail to cover
    const cover = this.coverage(state, range);
    const mySide = state.versus ? (state.seatSide[overlay.seat] ?? -1) : -1;
    let best = 0;
    for (const [i, n] of cover) if (state.occupied[i] === -1) best = Math.max(best, n);
    for (const [i, n] of cover) {
      if (state.occupied[i] !== -1) continue;
      const zone = state.versus ? (ctx.zones[i] ?? -1) : -1;
      if (zone >= 0 && state.slotSide[zone] !== mySide) continue;
      let label = this.coverLabels.get(i);
      if (!label) {
        label = new Text({ text: '', style: { fontFamily: 'system-ui, sans-serif', fontSize: 15, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x07090c, width: 4 } } });
        label.anchor.set(0.5);
        this.coverLayer.addChild(label);
        this.coverLabels.set(i, label);
      }
      const at = this.cam.project((i % state.cols) * TILE + TILE / 2, Math.floor(i / state.cols) * TILE + TILE / 2 - 2);
      label.position.set(at.x, at.y);
      label.scale.set(at.s);
      label.text = String(n);
      label.style.fill = n === best && n > 0 ? 0xffe066 : 0xffffff; // the best pads glow gold
      label.alpha = n === 0 ? 0.45 : 1;
      label.visible = true;
    }
  }

  private drawOverlay(state: SimState, ctx: SimContext, overlay: RenderFrame['overlay']): void {
    const g = this.hoverLayer;
    const r = this.rangeLayer;
    const b = this.badgeLayer;
    g.clear();
    r.clear();
    b.clear();

    if (overlay.selected !== null) {
      const t = state.towers.find((tw) => tw.id === overlay.selected);
      if (t) {
        const stats = towerStats(ctx.towerIndex[t.def], t.tier, t.branch);
        r.circle(t.col * TILE + TILE / 2, t.row * TILE + TILE / 2, stats.range * TILE)
          .fill({ color: 0xb9f0a8, alpha: 0.08 })
          .stroke({ width: 2, color: 0xb9f0a8, alpha: 0.5 });
        g.ellipse(t.col * TILE + TILE / 2, t.row * TILE + TILE / 2 + 6, TILE * 0.42, TILE * 0.42 * this.ringFlatten()).stroke({ width: 3, color: 0xffffff, alpha: 0.8 });
      }
    }

    if (state.versus) this.drawVersusMarks(g, state, ctx);

    if (state.seats > 1) {
      // a shared board: a thin ring in the owner's colour under every tower that is not yours
      for (const t of state.towers) {
        if (t.owner === overlay.seat) continue;
        g.ellipse(t.col * TILE + TILE / 2, t.row * TILE + TILE / 2 + 6, TILE * 0.4, TILE * 0.4 * this.ringFlatten()).stroke({ width: 2, color: seatColorHex(t.owner), alpha: 0.75 });
      }
    }

    // upgrade-ready badge: a small chevron over every tower of yours whose next tier you can afford now;
    // at tier 3, a smaller blue plus when a Reinforce level is affordable (long runs: where money goes)
    const sap = wallet(state, overlay.seat);
    for (const t of state.towers) {
      if (t.owner !== overlay.seat) continue;
      // badges stand up: screen px at the projected spot, sized by the local scale
      const at = this.cam.project(t.col * TILE + TILE / 2 + TILE * 0.34, t.row * TILE + TILE / 2 - TILE * 0.52 - 2 * Math.sin(this.auraPhase * 5 + t.id));
      const x = at.x;
      const y = at.y;
      const k = at.s;
      if (t.tier === 3) {
        const cost = reinforceCost(ctx, t);
        if (cost === null || sap < cost) continue;
        b.circle(x, y, 10 * k).fill({ color: 0x0b1a12, alpha: 0.85 }).stroke({ width: 2 * k, color: 0x8fd8ff, alpha: 0.95 });
        b.rect(x - 5 * k, y - 1.25 * k, 10 * k, 2.5 * k).fill({ color: 0x8fd8ff });
        b.rect(x - 1.25 * k, y - 5 * k, 2.5 * k, 10 * k).fill({ color: 0x8fd8ff });
        continue;
      }
      const cost = upgradeCost(ctx, t);
      if (cost === null || sap < cost) continue;
      b.circle(x, y, 13 * k).fill({ color: 0x0b1a12, alpha: 0.9 }).stroke({ width: 2.5 * k, color: 0xf2c14e, alpha: 1 });
      b.poly([x - 7 * k, y + 4 * k, x, y - 6 * k, x + 7 * k, y + 4 * k], true).fill({ color: 0xf2c14e });
    }

    // a pad tapped before a tower was chosen
    if (overlay.padPick && !overlay.placing && !overlay.pending) {
      const cx = overlay.padPick.col * TILE + TILE / 2;
      const cy = overlay.padPick.row * TILE + TILE / 2;
      const pulse = 0.5 + 0.5 * Math.sin(this.auraPhase * 8);
      g.ellipse(cx, cy + 6, TILE * 0.4, TILE * 0.4 * this.ringFlatten()).stroke({ width: 3, color: 0xffe9a6, alpha: 0.6 + 0.4 * pulse });
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
        const zone = state.versus ? (ctx.zones[i] ?? -1) : -1;
        const mine = zone < 0 || state.slotSide[zone] === (state.seatSide[overlay.seat] ?? -1);
        const valid = state.grid[i] === TILE_KIND.pad && state.occupied[i] === -1 && sap >= towerCost(ctx, def) && mine;
        const color = valid ? 0x7fd36b : 0xe85a3a;
        const stats = towerStats(def, 1, null);
        const pending = overlay.pending !== null;
        r.circle(cx, cy, stats.range * TILE).fill({ color, alpha: pending ? 0.12 : 0.08 }).stroke({ width: pending ? 3 : 2, color, alpha: pending ? 0.7 : 0.45 });
        g.ellipse(cx, cy + 6, TILE * 0.36, TILE * 0.36 * this.ringFlatten()).fill({ color, alpha: 0.35 }).stroke({ width: pending ? 3 : 2, color, alpha: 0.9 });
      } else if (state.occupied[i] !== -1 || state.grid[i] === TILE_KIND.pad) {
        g.ellipse(cx, cy + 6, TILE * 0.38, TILE * 0.38 * this.ringFlatten()).stroke({ width: 2, color: 0xffffff, alpha: 0.35 });
      }
    }
  }

  /** Rings drawn on the ground are circles the camera foreshortens; with the camera flat they are drawn as the old flattened ellipses. */
  private ringFlatten(): number {
    return this.cameraOpts.tilt ? 0.78 : 0.52;
  }

  /**
   * Versus boards: a ring in its defender's colour at every King base and at both ends of every lane;
   * a fallen side's ground (its lane, or its fork and base) goes dark.
   */
  private drawVersusMarks(g: Graphics, state: SimState, ctx: SimContext): void {
    for (let slot = 0; slot < state.routes.length; slot++) {
      const route = state.routes[slot];
      const side = state.slotSide[slot] ?? -1;
      const end = route[route.length - 1];
      const color = side >= 0 ? this.sideColor(state, side) : 0x666666;
      const pulse = 0.75 + 0.25 * Math.sin(this.auraPhase * 3 + slot);
      g.circle(end.x * TILE, end.y * TILE, TILE * 0.62).stroke({ width: 4, color, alpha: side >= 0 ? 0.9 * pulse : 0.5 });
      if (state.versus === 'lanes') {
        const start = route[0];
        g.circle(start.x * TILE, start.y * TILE, TILE * 0.5).stroke({ width: 3, color, alpha: side >= 0 ? 0.7 : 0.4 });
      }
      if (side >= 0) continue;
      // closed or fallen: veil the cells that belonged to it
      for (let i = 0; i < ctx.zones.length; i++) {
        if (ctx.zones[i] !== slot) continue;
        const c = i % state.cols;
        const r = (i - c) / state.cols;
        g.rect(c * TILE, r * TILE, TILE, TILE).fill({ color: 0x000000, alpha: 0.42 });
      }
    }
  }
}

export type { Tower };
