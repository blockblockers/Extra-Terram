// Extra Terram — src/render/vectorArt.ts v0.2.0 — vector unit art, the fallback when no image exists
// Each drawing follows the art handoff's silhouette notes so the painted versions can replace them
// one at a time without the board changing feel. All drawings are centred on (0, 0) in a box of
// about 1.4 tiles for towers (foot at +0.12 tile), 1 tile for creeps (facing +x), 0.4 tile for projectiles.
import { Graphics } from 'pixi.js';
import type { CreepDef, TowerDef } from '../engine';

const hex = (css: string): number => parseInt(css.replace('#', ''), 16);

const BARK = 0x5a3d22;
const BARK_DARK = 0x3a2614;
const MOSS = 0x3f8f3a;
const LEAF = 0x7fd36b;
const SAP = 0xe8c33a;
const RUST = 0xb0452a;
const STEEL = 0xb9c2c9;
const INK = 0x0b1a12;

// ------------------------------------------------------------------ towers

/** Vector art is authored for a 64 px tile and drawn a little larger than one tile so it reads on a phone. */
export const TOWER_SCALE = 1.3;
export const CREEP_SCALE = 1.7;
export const PROJECTILE_SCALE = 1.5;

export function drawTower(g: Graphics, def: TowerDef, tier: 1 | 2 | 3, branch: 'a' | 'b' | null, tile: number): void {
  const s = (tile / 64) * TOWER_SCALE; // everything below is authored for a 64 px tile
  drawShadow(g, 0, 10 * s, 26 * s, 12 * s);
  switch (def.id) {
    case 'needlespire':
      drawNeedlespire(g, tier, branch, s);
      break;
    case 'ironbark':
      drawIronbark(g, tier, branch, s);
      break;
    case 'weepvine':
      drawWeepvine(g, tier, branch, s);
      break;
    default:
      drawGenericTower(g, def, tier, s);
  }
}

function drawShadow(g: Graphics, x: number, y: number, rx: number, ry: number): void {
  g.ellipse(x, y, rx, ry).fill({ color: 0x03100a, alpha: 0.45 });
}

/** A tall narrow spire ringed with needle clusters; t3a rust-tipped and weeping, t3b twin spires. */
function drawNeedlespire(g: Graphics, tier: 1 | 2 | 3, branch: 'a' | 'b' | null, s: number): void {
  const spires = tier === 3 && branch === 'b' ? [-9, 9] : [0];
  const tipColor = tier === 3 && branch === 'a' ? RUST : LEAF;
  const height = (30 + tier * 6) * s;
  for (const ox of spires) {
    const x = ox * s;
    // root flare
    g.ellipse(x, 8 * s, 11 * s, 5 * s).fill(BARK_DARK);
    // trunk, tapering
    g.moveTo(x - 7 * s, 8 * s)
      .lineTo(x + 7 * s, 8 * s)
      .lineTo(x + 2.5 * s, -height)
      .lineTo(x - 2.5 * s, -height)
      .closePath()
      .fill(BARK);
    g.moveTo(x - 3 * s, 6 * s)
      .lineTo(x + 1 * s, 6 * s)
      .lineTo(x + 0.5 * s, -height + 4 * s)
      .lineTo(x - 1 * s, -height + 4 * s)
      .closePath()
      .fill({ color: 0x7a5530, alpha: 0.6 }); // bark highlight
    // needle rings: one per tier
    for (let r = 0; r < tier; r++) {
      const y = -height * (0.42 + r * (0.5 / tier));
      const reach = (13 - r * 2) * s;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + r * 0.3;
        const dx = Math.cos(a) * reach;
        const dy = Math.sin(a) * reach * 0.45;
        g.moveTo(x, y).lineTo(x + dx, y + dy).stroke({ width: 1.6 * s, color: tipColor, alpha: 0.95 });
        g.circle(x + dx, y + dy, 1.2 * s).fill(tipColor);
      }
      // sap core glow between rings
      g.circle(x, y - 3 * s, 2.6 * s).fill({ color: SAP, alpha: 0.9 });
    }
    // crown
    if (tier === 3) {
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.5;
        g.moveTo(x, -height).lineTo(x + Math.cos(a) * 9 * s, -height + Math.sin(a) * 9 * s).stroke({ width: 1.8 * s, color: tipColor });
      }
    } else {
      g.circle(x, -height, 2.2 * s).fill(SAP);
    }
    if (tier === 3 && branch === 'a') {
      // weeping sap wounds
      for (const [wx, wy, len] of [
        [-2, -12, 9],
        [3, -22, 7],
      ]) {
        g.moveTo(x + wx * s, wy * s).lineTo(x + wx * s, (wy + len) * s).stroke({ width: 1.4 * s, color: RUST, alpha: 0.9 });
        g.circle(x + wx * s, (wy + len) * s, 1.3 * s).fill(RUST);
      }
    }
  }
}

/** A squat armoured trunk; the seed-pod cannon is the turret and is drawn separately. */
function drawIronbark(g: Graphics, tier: 1 | 2 | 3, branch: 'a' | 'b' | null, s: number): void {
  const w = (20 + tier * 2) * s;
  const h = (16 + tier * 2) * s;
  const plateColor = tier === 3 && branch === 'a' ? STEEL : 0x6f7a7f;
  // root buttresses
  for (const a of [0.4, 1.3, 2.3, 3.4, 4.4, 5.4]) {
    g.moveTo(Math.cos(a) * w * 0.5, 6 * s + Math.sin(a) * 4 * s)
      .lineTo(Math.cos(a) * (w * 0.5 + 9 * s), 8 * s + Math.sin(a) * 6 * s)
      .stroke({ width: 4 * s, color: BARK_DARK, cap: 'round' });
  }
  // trunk body
  g.roundRect(-w / 2, -h, w, h + 8 * s, 7 * s).fill(BARK);
  g.roundRect(-w / 2 + 3 * s, -h + 3 * s, 6 * s, h, 3 * s).fill({ color: 0x7a5530, alpha: 0.5 });
  // iron bark plates
  const plates = tier + 1;
  for (let i = 0; i < plates; i++) {
    const y = -h + 4 * s + i * ((h + 2 * s) / plates);
    g.roundRect(-w / 2 - 1 * s, y, w + 2 * s, 5 * s, 2 * s).fill(plateColor).stroke({ width: 1 * s, color: 0x2b3236, alpha: 0.8 });
    // rivets
    g.circle(-w / 2 + 3 * s, y + 2.5 * s, 1 * s).fill(0x2b3236);
    g.circle(w / 2 - 3 * s, y + 2.5 * s, 1 * s).fill(0x2b3236);
  }
  // glowing seam at tier 3
  if (tier === 3) g.roundRect(-w / 2 + 2 * s, -h + 1 * s, w - 4 * s, 2 * s, 1 * s).fill({ color: SAP, alpha: 0.9 });
  // pod socket on top
  g.ellipse(0, -h, w * 0.42, 6 * s).fill(BARK_DARK);
}

/** A hooded node with trailing luminous vines pooling on the ground. */
function drawWeepvine(g: Graphics, tier: 1 | 2 | 3, branch: 'a' | 'b' | null, s: number): void {
  const vineColor = 0x4fa58a;
  const vineGlow = 0x9fe8c0;
  // surfacing roots (deep roots branch shows more)
  const roots = tier === 3 && branch === 'a' ? 8 : 4;
  for (let i = 0; i < roots; i++) {
    const a = (i / roots) * Math.PI * 2 + 0.4;
    const r = 16 * s;
    g.moveTo(Math.cos(a) * 6 * s, 8 * s + Math.sin(a) * 3 * s)
      .quadraticCurveTo(Math.cos(a) * r * 0.7, 10 * s + Math.sin(a) * 6 * s, Math.cos(a) * r, 9 * s + Math.sin(a) * 7 * s)
      .stroke({ width: 2.4 * s, color: BARK_DARK, cap: 'round' });
    g.circle(Math.cos(a) * r, 9 * s + Math.sin(a) * 7 * s, 1.4 * s).fill(vineGlow);
  }
  // stalk
  g.moveTo(-3 * s, 8 * s).lineTo(3 * s, 8 * s).lineTo(1.5 * s, -14 * s).lineTo(-1.5 * s, -14 * s).closePath().fill(BARK);
  // hood (bell), opens with tier
  const hoodW = (14 + tier * 2) * s;
  const hoodH = (12 + tier) * s;
  g.moveTo(-hoodW, -10 * s)
    .quadraticCurveTo(0, -10 * s - hoodH * 2.2, hoodW, -10 * s)
    .quadraticCurveTo(0, -4 * s, -hoodW, -10 * s)
    .closePath()
    .fill(MOSS);
  g.moveTo(-hoodW * 0.7, -12 * s).quadraticCurveTo(-hoodW * 0.2, -10 * s - hoodH * 1.6, hoodW * 0.1, -14 * s).stroke({ width: 1.5 * s, color: LEAF, alpha: 0.6 });
  // the eye shows from tier 2
  if (tier >= 2) g.ellipse(0, -11 * s, 4 * s, 2.4 * s).fill(SAP);
  if (tier >= 2) g.ellipse(0, -11 * s, 1.6 * s, 2 * s).fill(INK);
  // vines: count grows with tier; entangle branch ends in curled snares
  const vines = 5 + tier * 2;
  for (let i = 0; i < vines; i++) {
    const t = i / (vines - 1);
    const x0 = -hoodW * 0.9 + t * hoodW * 1.8;
    const len = (14 + ((i * 7) % 9)) * s;
    const x1 = x0 * 1.3 + (i % 2 ? 3 : -3) * s;
    g.moveTo(x0, -10 * s).quadraticCurveTo(x0 * 1.1, -10 * s + len * 0.6, x1, -10 * s + len).stroke({ width: 1.6 * s, color: vineColor, alpha: 0.95 });
    const endY = -10 * s + len;
    if (tier === 3 && branch === 'b') g.circle(x1 + 1.5 * s, endY, 2 * s).stroke({ width: 1.3 * s, color: vineGlow });
    else g.circle(x1, endY, 1.3 * s).fill(vineGlow);
  }
}

function drawGenericTower(g: Graphics, def: TowerDef, tier: 1 | 2 | 3, s: number): void {
  const r = (16 + tier * 2) * s;
  g.circle(0, 0, r).fill(0x1c3a27).stroke({ width: 3 * s, color: INK });
  g.circle(0, 0, r * 0.7).fill(hex(def.color));
}

/** Rotating parts: the Ironbark seed-pod cannon (and generic barrels for turret towers without art). */
export function drawTurret(g: Graphics, def: TowerDef, tier: 1 | 2 | 3, branch: 'a' | 'b' | null, tile: number): void {
  const s = (tile / 64) * TOWER_SCALE;
  if (def.id === 'ironbark') {
    const barrels = tier === 3 && branch === 'b' ? [-4.5, 4.5] : [0];
    const steel = tier === 3 && branch === 'a';
    const len = (steel ? 24 : 18 + tier * 2) * s;
    // pod body (pivot at 0,0; points +x)
    g.ellipse(1 * s, 0, 10 * s, 8 * s).fill(BARK_DARK).stroke({ width: 1 * s, color: INK, alpha: 0.6 });
    g.ellipse(-1 * s, -2 * s, 6 * s, 3.5 * s).fill({ color: 0x7a5530, alpha: 0.55 });
    g.circle(-4 * s, 1 * s, 1.6 * s).fill({ color: SAP, alpha: 0.8 });
    for (const oy of barrels) {
      const bw = steel ? 4.5 * s : 6 * s;
      g.roundRect(4 * s, oy * s - bw / 2, len, bw, bw / 2).fill(steel ? STEEL : 0x4a4f52).stroke({ width: 1 * s, color: 0x1f2426 });
      g.circle(4 * s + len, oy * s, bw / 2 - 0.5 * s).fill(INK);
    }
    // bands
    for (let i = 0; i < tier; i++) g.rect(6 * s + i * 5 * s, -8 * s, 1.5 * s, 16 * s).fill({ color: steel ? 0xe8edf0 : 0x8a949a, alpha: 0.8 });
    if (tier === 3) g.circle(0, 0, 2.2 * s).fill(SAP);
    return;
  }
  // generic barrel
  g.roundRect(0, -3 * s, 20 * s, 6 * s, 3 * s).fill(hex(def.color)).stroke({ width: 1 * s, color: INK });
  g.circle(0, 0, 5 * s).fill(hex(def.color)).stroke({ width: 1 * s, color: INK });
}

// ------------------------------------------------------------------ creeps (facing +x)

export function drawCreep(g: Graphics, def: CreepDef, tile: number): void {
  const s = (tile / 64) * CREEP_SCALE;
  switch (def.id) {
    case 'compactor':
      drawCompactor(g, s);
      break;
    case 'dump-hauler':
      drawHauler(g, s);
      break;
    case 'dozer':
      drawDozer(g, s);
      break;
    default:
      g.circle(0, 0, def.radius * tile).fill(hex(def.color)).stroke({ width: 2 * s, color: INK });
  }
}

const YELLOW = 0xe8c33a;
const YELLOW_DARK = 0xb08f22;
const GUNMETAL = 0x2a2d30;
const TRACK = 0x151719;

function hazardStripes(g: Graphics, x: number, y: number, w: number, h: number, s: number): void {
  g.rect(x, y, w, h).fill(YELLOW);
  const step = 4 * s;
  for (let i = -h; i < w; i += step * 2) {
    g.moveTo(x + i, y + h).lineTo(x + i + h, y).lineTo(x + i + h + step, y).lineTo(x + i + step, y + h).closePath().fill(INK);
  }
}

function tracks(g: Graphics, x: number, y: number, w: number, h: number, s: number): void {
  g.roundRect(x, y, w, h, 2 * s).fill(TRACK);
  for (let i = 2 * s; i < w - 2 * s; i += 4 * s) g.rect(x + i, y + 1 * s, 2 * s, h - 2 * s).fill({ color: 0x3a3f44, alpha: 0.9 });
}

/** Small, lean: a roller drum in front and an exposed engine behind. */
function drawCompactor(g: Graphics, s: number): void {
  const L = 22 * s;
  const W = 14 * s;
  g.ellipse(0, 2 * s, L * 0.55, W * 0.6).fill({ color: 0x03100a, alpha: 0.35 });
  // wheels
  g.roundRect(-L / 2, -W / 2 - 2 * s, 8 * s, 3 * s, 1 * s).fill(TRACK);
  g.roundRect(-L / 2, W / 2 - 1 * s, 8 * s, 3 * s, 1 * s).fill(TRACK);
  // body
  g.roundRect(-L / 2, -W / 2, L * 0.62, W, 2 * s).fill(YELLOW).stroke({ width: 1 * s, color: INK });
  // engine block (exposed)
  g.rect(-L / 2 + 2 * s, -W / 2 + 2 * s, 7 * s, W - 4 * s).fill(GUNMETAL);
  g.rect(-L / 2 + 3.5 * s, -W / 2 + 3 * s, 1.5 * s, W - 6 * s).fill(0x5a6166);
  // roller drum in front
  g.roundRect(L * 0.12, -W / 2 - 1 * s, L * 0.38, W + 2 * s, 2.5 * s).fill(0x6a7076).stroke({ width: 1 * s, color: INK });
  for (let i = 0; i < 3; i++) g.rect(L * 0.16 + i * 3 * s, -W / 2, 1 * s, W).fill({ color: 0x2b3236, alpha: 0.8 });
  g.circle(L * 0.08, 0, 1.6 * s).fill(0xffe9a6); // headlamp
}

/** Long bed heaped with rubble, cab at the back, six wheels. */
function drawHauler(g: Graphics, s: number): void {
  const L = 30 * s;
  const W = 16 * s;
  g.ellipse(0, 2 * s, L * 0.52, W * 0.6).fill({ color: 0x03100a, alpha: 0.35 });
  for (const x of [-L / 2 + 2 * s, -L / 2 + 10 * s, L / 2 - 9 * s]) {
    g.roundRect(x, -W / 2 - 2.5 * s, 6 * s, 3 * s, 1 * s).fill(TRACK);
    g.roundRect(x, W / 2 - 0.5 * s, 6 * s, 3 * s, 1 * s).fill(TRACK);
  }
  // chassis
  g.roundRect(-L / 2, -W / 2, L, W, 2 * s).fill(YELLOW_DARK).stroke({ width: 1 * s, color: INK });
  // bed with rubble
  g.roundRect(-L / 2 + 1 * s, -W / 2 + 1 * s, L * 0.68, W - 2 * s, 1.5 * s).fill(0x4a4f52);
  const rubble = [
    [-11, -3, 3],
    [-6, 2, 3.5],
    [-1, -2, 3],
    [-8, 4, 2.2],
    [-3, 4, 2.4],
    [2, 2, 2.6],
    [-12, 3, 2],
  ];
  for (const [rx, ry, rr] of rubble) g.circle(rx * s, ry * s, rr * s).fill(0x8d9398).stroke({ width: 0.6 * s, color: 0x3a3f44 });
  // cab at the front (+x)
  g.roundRect(L * 0.2, -W / 2 + 1 * s, L * 0.28, W - 2 * s, 2 * s).fill(YELLOW).stroke({ width: 1 * s, color: INK });
  g.rect(L * 0.34, -W / 2 + 3 * s, 3 * s, W - 6 * s).fill({ color: 0x9fd8e8, alpha: 0.9 }); // windshield
  g.circle(L / 2 - 1 * s, -W / 2 + 3 * s, 1.4 * s).fill(0xffe9a6);
  g.circle(L / 2 - 1 * s, W / 2 - 3 * s, 1.4 * s).fill(0xffe9a6);
}

/** Wide, low, armoured; a huge striped blade across the front, full tracks. */
function drawDozer(g: Graphics, s: number): void {
  const L = 30 * s;
  const W = 24 * s;
  g.ellipse(0, 2 * s, L * 0.6, W * 0.55).fill({ color: 0x03100a, alpha: 0.4 });
  tracks(g, -L / 2, -W / 2, L * 0.8, 6 * s, s);
  tracks(g, -L / 2, W / 2 - 6 * s, L * 0.8, 6 * s, s);
  // hull
  g.roundRect(-L / 2 + 2 * s, -W / 2 + 5 * s, L * 0.72, W - 10 * s, 2 * s).fill(YELLOW).stroke({ width: 1 * s, color: INK });
  // bolted armour plates
  for (const [px, py, pw, ph] of [
    [-12, -6, 9, 5],
    [-12, 1, 9, 5],
    [-2, -6, 8, 12],
  ]) {
    g.rect(px * s, py * s, pw * s, ph * s).fill(0x6a7076).stroke({ width: 0.8 * s, color: INK });
    g.circle((px + 1.5) * s, (py + 1.5) * s, 0.8 * s).fill(INK);
    g.circle((px + pw - 1.5) * s, (py + ph - 1.5) * s, 0.8 * s).fill(INK);
  }
  // exhaust stacks
  g.circle(-9 * s, -3 * s, 1.8 * s).fill(GUNMETAL);
  g.circle(-9 * s, 3 * s, 1.8 * s).fill(GUNMETAL);
  // blade arms + blade across the front
  g.rect(L * 0.2, -W / 2 + 7 * s, 6 * s, 2.5 * s).fill(GUNMETAL);
  g.rect(L * 0.2, W / 2 - 9.5 * s, 6 * s, 2.5 * s).fill(GUNMETAL);
  hazardStripes(g, L * 0.36, -W / 2 + 1 * s, 5 * s, W - 2 * s, s);
  g.rect(L * 0.36, -W / 2 + 1 * s, 5 * s, W - 2 * s).stroke({ width: 1 * s, color: INK });
  g.circle(L * 0.3, -W / 2 + 9 * s, 1.3 * s).fill(0xffe9a6);
  g.circle(L * 0.3, W / 2 - 9 * s, 1.3 * s).fill(0xffe9a6);
}

// ------------------------------------------------------------------ projectiles (pointing +x)

export function drawProjectile(g: Graphics, def: TowerDef, tile: number): void {
  const s = (tile / 64) * PROJECTILE_SCALE;
  switch (def.id) {
    case 'needlespire':
      // a thin pale needle
      g.moveTo(-7 * s, 0).lineTo(5 * s, -1.2 * s).lineTo(7 * s, 0).lineTo(5 * s, 1.2 * s).closePath().fill(0xd8ffc8);
      g.moveTo(-7 * s, 0).lineTo(2 * s, 0).stroke({ width: 1 * s, color: LEAF });
      break;
    case 'ironbark':
      // a dark acorn with a cap
      g.ellipse(0, 0, 4.5 * s, 3.5 * s).fill(0x5a3d22).stroke({ width: 0.8 * s, color: INK });
      g.ellipse(-2 * s, 0, 2.5 * s, 3.8 * s).fill(0x3a2614);
      g.circle(1.5 * s, -1 * s, 1 * s).fill({ color: 0xa07850, alpha: 0.8 });
      break;
    default:
      g.circle(0, 0, 3 * s).fill(hex(def.color)).stroke({ width: 0.8 * s, color: INK, alpha: 0.6 });
  }
}

/** Where the rotating part sits, in board pixels above the cell centre. */
export function turretMount(def: TowerDef, tier: 1 | 2 | 3, tile: number): number {
  const s = (tile / 64) * TOWER_SCALE;
  if (def.id === 'ironbark') return (16 + tier * 2) * s;
  return 10 * s;
}

export function projectileColor(def: TowerDef): number {
  if (def.id === 'needlespire') return 0xd8ffc8;
  if (def.id === 'ironbark') return 0x9a7a55;
  return hex(def.color);
}
