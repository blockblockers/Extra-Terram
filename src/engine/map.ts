// Extra Terram — src/engine/map.ts v0.1.0 — Phase 1 scaffold
// Turns a painted tile grid into the engine's grid plus a waypoint path.
// Mazes are fixed, so the path is derived once here (breadth-first search from the spawn)
// and never recomputed during play. The map author paints tiles; nobody types coordinates.
import { TILE, type MapDef, type Point, type TileKind } from './types';

export interface ParsedMap {
  cols: number;
  rows: number;
  grid: TileKind[];
  spawn: Point;
  exit: Point;
  waypoints: Point[];
}

export const cellIndex = (cols: number, col: number, row: number): number => row * cols + col;

export function parseMap(map: MapDef): ParsedMap {
  const { cols, rows } = map;
  if (map.grid.length !== rows) throw new Error(`map ${map.id}: grid has ${map.grid.length} rows, expected ${rows}`);
  const grid: TileKind[] = new Array(cols * rows).fill(TILE.scenery);
  let spawn: Point | null = null;
  let exit: Point | null = null;

  for (let r = 0; r < rows; r++) {
    const line = map.grid[r];
    if (line.length !== cols) throw new Error(`map ${map.id}: row ${r} has ${line.length} columns, expected ${cols}`);
    for (let c = 0; c < cols; c++) {
      const kindName = map.legend[line[c]];
      if (!kindName) throw new Error(`map ${map.id}: row ${r}, col ${c}: '${line[c]}' is not in the legend`);
      const kind = TILE[kindName];
      grid[cellIndex(cols, c, r)] = kind;
      if (kind === TILE.spawn) spawn = { x: c, y: r };
      if (kind === TILE.exit) exit = { x: c, y: r };
    }
  }
  if (!spawn || !exit) throw new Error(`map ${map.id}: needs one spawn and one exit`);

  const cells = bfsPath(grid, cols, rows, spawn, exit);
  if (!cells) throw new Error(`map ${map.id}: no path from spawn to exit`);
  const waypoints = compress(cells.map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 })));
  return { cols, rows, grid, spawn, exit, waypoints };
}

const walkable = (k: TileKind): boolean => k === TILE.path || k === TILE.spawn || k === TILE.exit;

/** Shortest cell path over walkable tiles, 4-neighbourhood, deterministic neighbour order. */
function bfsPath(grid: TileKind[], cols: number, rows: number, from: Point, to: Point): Point[] | null {
  const start = cellIndex(cols, from.x, from.y);
  const goal = cellIndex(cols, to.x, to.y);
  const prev = new Int32Array(cols * rows).fill(-2); // -2 unvisited, -1 start
  prev[start] = -1;
  const queue: number[] = [start];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur === goal) break;
    const c = cur % cols;
    const r = (cur - c) / cols;
    const neighbours = [
      [c, r - 1],
      [c + 1, r],
      [c, r + 1],
      [c - 1, r],
    ];
    for (const [nc, nr] of neighbours) {
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const ni = cellIndex(cols, nc, nr);
      if (prev[ni] !== -2 || !walkable(grid[ni])) continue;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  if (prev[goal] === -2) return null;
  const out: Point[] = [];
  for (let i = goal; i !== -1; i = prev[i]) out.push({ x: i % cols, y: Math.floor(i / cols) });
  out.reverse();
  return out;
}

/** Drop the interior points of straight runs so creeps only ever steer at corners. */
function compress(points: Point[]): Point[] {
  if (points.length <= 2) return points;
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const collinear = (b.x - a.x) * (c.y - b.y) === (b.y - a.y) * (c.x - b.x);
    if (!collinear) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Euclidean length of the waypoint path, in tiles. */
export function pathLength(waypoints: Point[]): number {
  let len = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const dx = waypoints[i].x - waypoints[i - 1].x;
    const dy = waypoints[i].y - waypoints[i - 1].y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}
