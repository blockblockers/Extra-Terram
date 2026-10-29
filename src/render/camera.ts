// Extra Terram — src/render/camera.ts v0.1.0 — the board seen from a tilted camera: a homography from board px to screen px
// The board is a flat picture (the painted map, rings, shadows) that the camera looks at from an
// angle: its far edge is narrower and the whole of it shorter, as a plane seen in perspective. The
// homography maps board px (TILE units, y down the trail) to screen px; everything that stands up
// (towers, creeps, shots, labels) is placed at its projected foot and scaled by the local tile
// width, so the far rows are smaller. With no tilt the mapping is the plain fit-to-host scale.

export interface Tilt {
  /** The far (top) edge's width as a fraction of the near edge's. 1 = no perspective. */
  top: number;
  /** The board's screen height as a fraction of its untilted height. 1 = no foreshortening. */
  height: number;
}

export const FLAT: Tilt = { top: 1, height: 1 };
/** Phones in portrait are width-limited: a mild tilt keeps the far rows readable. */
export const TILT_PORTRAIT: Tilt = { top: 0.82, height: 0.86 };
/** Landscape hosts have the room for the StarCraft angle. */
export const TILT_LANDSCAPE: Tilt = { top: 0.7, height: 0.74 };

export interface Projected {
  x: number;
  y: number;
  /** Screen px per board px at this depth (the local scale). */
  s: number;
}

type M3 = [number, number, number, number, number, number, number, number, number];

/** Solve the 3 × 3 homography that takes the four `src` points to the four `dst` points. */
function homography(src: Array<[number, number]>, dst: Array<[number, number]>): M3 {
  // 8 equations in the 8 unknowns a..h (i = 1), by Gaussian elimination
  const A: number[][] = [];
  const b: number[] = [];
  for (let k = 0; k < 4; k++) {
    const [x, y] = src[k];
    const [u, v] = dst[k];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    const d = A[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / d;
      if (f === 0) continue;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = b.map((v, i) => v / (A[i][i] || 1e-12));
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function invert(m: M3): M3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C || 1e-12;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

export class Camera {
  /** Board size, px. */
  boardW = 1;
  boardH = 1;
  /** Host size, px. */
  width = 1;
  height = 1;
  tilt: Tilt = FLAT;
  /** The four screen corners of the board: top-left, top-right, bottom-right, bottom-left. */
  corners: [number, number, number, number, number, number, number, number] = [0, 0, 1, 0, 1, 1, 0, 1];
  /** The uniform fit scale (the near edge's screen px per board px). */
  scale = 1;
  private fwd: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  private inv: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  /** Fit the board into the host with the current tilt. */
  fit(boardW: number, boardH: number, width: number, height: number, tilt: Tilt = this.tilt): void {
    this.boardW = boardW;
    this.boardH = boardH;
    this.width = width;
    this.height = height;
    this.tilt = tilt;
    const scale = Math.min(width / boardW, height / (boardH * tilt.height));
    this.scale = scale;
    const sw = boardW * scale;
    const sh = boardH * scale * tilt.height;
    const ox = (width - sw) / 2;
    const oy = (height - sh) / 2;
    const inset = (sw * (1 - tilt.top)) / 2;
    this.corners = [ox + inset, oy, ox + sw - inset, oy, ox + sw, oy + sh, ox, oy + sh];
    const c = this.corners;
    this.fwd = homography(
      [
        [0, 0],
        [boardW, 0],
        [boardW, boardH],
        [0, boardH],
      ],
      [
        [c[0], c[1]],
        [c[2], c[3]],
        [c[4], c[5]],
        [c[6], c[7]],
      ],
    );
    this.inv = invert(this.fwd);
  }

  /** Board px → screen px, with the local scale. */
  project(x: number, y: number): Projected {
    const m = this.fwd;
    const w = m[6] * x + m[7] * y + m[8];
    const X = (m[0] * x + m[1] * y + m[2]) / w;
    const Y = (m[3] * x + m[4] * y + m[5]) / w;
    // the local scale: how far one board px along x travels on screen at this depth
    const w1 = m[6] * (x + 1) + m[7] * y + m[8];
    const X1 = (m[0] * (x + 1) + m[1] * y + m[2]) / w1;
    return { x: X, y: Y, s: Math.abs(X1 - X) };
  }

  /** Screen px → board px. */
  unproject(X: number, Y: number): { x: number; y: number } {
    const m = this.inv;
    const w = m[6] * X + m[7] * Y + m[8];
    return { x: (m[0] * X + m[1] * Y + m[2]) / w, y: (m[3] * X + m[4] * Y + m[5]) / w };
  }

  /** Vertical foreshortening of things lying on the ground at this depth (1 flat, less when tilted). */
  get flatten(): number {
    return this.tilt.height;
  }
}

/** A sprite-like thing the camera can place: position and size in screen px. */
export interface Placeable {
  position: { set(x: number, y: number): void };
  width: number;
  height: number;
}

/** Put `s` at board (bx, by) with a board-px size of bw × bh. */
export function place(cam: Camera, s: Placeable, bx: number, by: number, bw: number, bh: number): Projected {
  const p = cam.project(bx, by);
  s.position.set(p.x, p.y);
  s.width = bw * p.s;
  s.height = bh * p.s;
  return p;
}
